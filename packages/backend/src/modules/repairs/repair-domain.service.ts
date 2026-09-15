import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Party, RepairOrder, RepairOrderPart } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Money } from '../../core/money';
import { ValidationError } from '../../core/result';
import { TransactionOrchestrator } from '../../core/transaction-orchestrator';
import { DocumentNumberService } from '../../core/document-number.service';
import { AuditService } from '../../core/audit.service';
import { PartiesService } from '../../parties/parties.service';
import { RepairFsmService } from './repair-fsm.service';
import { InvalidRepairPricingError, RepairOrderNotFoundError } from './repairs.errors';
import { REPAIR_STATUS } from './repairs.types';
import type { CreateRepairOrderDto } from './dto/create-repair-order.dto';

/**
 * DIRECTIVE-013 Stage 6.1 — repair ticket lifecycle (v3.0 repair foundation).
 *
 * Intake → diagnosis → quotation → approval → repair → ready. Every step
 * runs in the caller's `tx` or a fresh orchestrator transaction; every
 * transition passes the FSM (terminal orders reject first with
 * `RepairOrderClosedError`, illegal edges with
 * `InvalidRepairStateTransitionError`). Money is exact throughout; the
 * quoted total always equals labor + active parts − discount.
 *
 * Out of scope for this stage (arrives with billing/delivery): part
 * consumption/return, deposits, delivery + REPAIR_INVOICE posting, and
 * cancellation endpoints. The FSM already models those terminal edges.
 */

export type RepairOrderWithDetails = RepairOrder & { parts: RepairOrderPart[]; party: Party };

function assertNonEmpty(value: string | undefined, what: string): void {
  if (!value || value.trim().length === 0) {
    throw new ValidationError(`RepairDomainService: ${what} must be a non-empty string.`);
  }
}

function toPricing(value: string | Money, what: string): Money {
  if (value instanceof Money) return value;
  try {
    return Money.from(value);
  } catch {
    throw new InvalidRepairPricingError(`RepairDomainService: ${what} is not a valid amount.`, { value });
  }
}

@Injectable()
export class RepairDomainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: TransactionOrchestrator,
    private readonly sequences: DocumentNumberService,
    private readonly audit: AuditService,
    private readonly parties: PartiesService,
    private readonly fsm: RepairFsmService,
  ) {}

  private db(tx?: Prisma.TransactionClient): Prisma.TransactionClient {
    return tx ?? (this.prisma as unknown as Prisma.TransactionClient);
  }

  private async requireOrder(orderId: string, db: Prisma.TransactionClient): Promise<RepairOrder> {
    assertNonEmpty(orderId, 'orderId');
    const order = await db.repairOrder.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new RepairOrderNotFoundError(`Repair order "${orderId}" not found.`, { orderId });
    }
    return order;
  }

  private transitionTimestamps(toStatus: string): { readyAt?: Date; deliveredAt?: Date; cancelledAt?: Date } {
    const now = new Date();
    if (toStatus === REPAIR_STATUS.READY) return { readyAt: now };
    if (toStatus === REPAIR_STATUS.DELIVERED) return { deliveredAt: now };
    if (toStatus === REPAIR_STATUS.CANCELLED) return { cancelledAt: now };
    return {};
  }

  async createRepairOrder(input: CreateRepairOrderDto, outerTx?: Prisma.TransactionClient): Promise<RepairOrder> {
    assertNonEmpty(input.partyId, 'partyId');
    assertNonEmpty(input.deviceType, 'deviceType');
    assertNonEmpty(input.brand, 'brand');
    assertNonEmpty(input.model, 'model');
    assertNonEmpty(input.reportedIssue, 'reportedIssue');

    const run = async (db: Prisma.TransactionClient): Promise<RepairOrder> => {
      const party = await this.parties.getParty(input.partyId, db);
      if (!party.isActive) {
        throw new ValidationError(`Customer ${party.name} is inactive — intake blocked.`, { partyId: party.id });
      }
      if (party.type !== 'CUSTOMER' && party.type !== 'BOTH') {
        throw new ValidationError(
          `Party ${party.name} is a ${party.type} — repair orders require a CUSTOMER (or BOTH).`,
          { partyId: party.id, type: party.type },
        );
      }
      const orderNumber = await this.sequences.nextNumber('REP', db, 6);
      const order = await db.repairOrder.create({
        data: {
          orderNumber,
          partyId: party.id,
          deviceType: input.deviceType.trim(),
          brand: input.brand.trim(),
          model: input.model.trim(),
          serialOrImei: input.serialOrImei?.trim() ? input.serialOrImei.trim() : null,
          reportedIssue: input.reportedIssue.trim(),
          status: REPAIR_STATUS.RECEIVED,
        },
      });
      if (input.actorUserId) {
        await this.audit.record(
          {
            actorUserId: input.actorUserId,
            action: 'REPAIR.INTAKE',
            entityType: 'RepairOrder',
            entityId: order.id,
            after: { orderNumber, partyId: party.id, deviceType: order.deviceType },
          },
          db,
        );
      }
      return order;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: 'repair-intake' });
  }

  async diagnoseOrder(
    orderId: string,
    diagnosisNotes: string,
    technicianNotes?: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<RepairOrder> {
    assertNonEmpty(diagnosisNotes, 'diagnosisNotes');

    const run = async (db: Prisma.TransactionClient): Promise<RepairOrder> => {
      const order = await this.requireOrder(orderId, db);
      this.fsm.assertNotClosed(order.status, order.orderNumber);
      this.fsm.assertTransition(order.status, REPAIR_STATUS.DIAGNOSING, order.orderNumber);
      const updated = await db.repairOrder.update({
        where: { id: order.id },
        data: {
          status: REPAIR_STATUS.DIAGNOSING,
          diagnosisNotes: diagnosisNotes.trim(),
          technicianNotes: technicianNotes?.trim() ? technicianNotes.trim() : null,
        },
      });
      await this.audit.record(
        {
          action: 'REPAIR.DIAGNOSE',
          entityType: 'RepairOrder',
          entityId: order.id,
          after: { status: REPAIR_STATUS.DIAGNOSING },
        },
        db,
      );
      return updated;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `repair-diagnose:${orderId}` });
  }

  async quoteOrder(
    orderId: string,
    laborPrice: string | Money,
    estimatedCost: string | Money,
    outerTx?: Prisma.TransactionClient,
  ): Promise<RepairOrder> {
    const labor = toPricing(laborPrice, 'laborPrice');
    const estimate = toPricing(estimatedCost, 'estimatedCost');
    if (labor.isNegative() || estimate.isNegative()) {
      throw new InvalidRepairPricingError('RepairDomainService.quoteOrder: laborPrice and estimatedCost must be >= 0.');
    }

    const run = async (db: Prisma.TransactionClient): Promise<RepairOrder> => {
      const order = await this.requireOrder(orderId, db);
      this.fsm.assertNotClosed(order.status, order.orderNumber);
      this.fsm.assertTransition(order.status, REPAIR_STATUS.QUOTED, order.orderNumber);
      const parts = await db.repairOrderPart.findMany({
        where: { repairOrderId: order.id, status: { not: 'RETURNED' } },
      });
      let partsTotal = Money.zero();
      for (const part of parts) {
        partsTotal = partsTotal.add(Money.from(part.totalPrice));
      }
      const quoted = labor.add(partsTotal);
      if (!quoted.isPositive()) {
        throw new InvalidRepairPricingError(
          `RepairDomainService.quoteOrder: quotation for ${order.orderNumber} is empty — labor and parts total 0.00.`,
          { orderId: order.id },
        );
      }
      const discount = Money.from(order.discountAmount);
      const total = quoted.sub(discount);
      if (total.isNegative()) {
        throw new InvalidRepairPricingError(
          `RepairDomainService.quoteOrder: discount ${discount.to2dp()} exceeds quoted ${quoted.to2dp()}.`,
        );
      }
      const paid = Money.from(order.paidAmount);
      const updated = await db.repairOrder.update({
        where: { id: order.id },
        data: {
          status: REPAIR_STATUS.QUOTED,
          laborPrice: labor.to2dp(),
          estimatedCost: estimate.to2dp(),
          partsPriceTotal: partsTotal.to2dp(),
          totalAmount: total.to2dp(),
          outstandingAmount: total.sub(paid).to2dp(),
        },
      });
      await this.audit.record(
        {
          action: 'REPAIR.QUOTE',
          entityType: 'RepairOrder',
          entityId: order.id,
          after: {
            status: REPAIR_STATUS.QUOTED,
            laborPrice: labor.to2dp(),
            partsPriceTotal: partsTotal.to2dp(),
            totalAmount: total.to2dp(),
          },
        },
        db,
      );
      return updated;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `repair-quote:${orderId}` });
  }

  async approveOrder(orderId: string, outerTx?: Prisma.TransactionClient): Promise<RepairOrder> {
    const run = async (db: Prisma.TransactionClient): Promise<RepairOrder> => {
      const order = await this.requireOrder(orderId, db);
      this.fsm.assertNotClosed(order.status, order.orderNumber);
      this.fsm.assertTransition(order.status, REPAIR_STATUS.APPROVED, order.orderNumber);
      const updated = await db.repairOrder.update({
        where: { id: order.id },
        data: { status: REPAIR_STATUS.APPROVED },
      });
      await this.audit.record(
        {
          action: 'REPAIR.APPROVE',
          entityType: 'RepairOrder',
          entityId: order.id,
          after: { status: REPAIR_STATUS.APPROVED, totalAmount: order.totalAmount },
        },
        db,
      );
      return updated;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `repair-approve:${orderId}` });
  }

  async startRepair(orderId: string, technicianId?: string, outerTx?: Prisma.TransactionClient): Promise<RepairOrder> {
    if (technicianId !== undefined && technicianId.trim().length === 0) {
      throw new ValidationError('RepairDomainService.startRepair: technicianId must be a non-empty string when provided.');
    }

    const run = async (db: Prisma.TransactionClient): Promise<RepairOrder> => {
      const order = await this.requireOrder(orderId, db);
      this.fsm.assertNotClosed(order.status, order.orderNumber);
      this.fsm.assertTransition(order.status, REPAIR_STATUS.IN_REPAIR, order.orderNumber);
      const updated = await db.repairOrder.update({
        where: { id: order.id },
        data: {
          status: REPAIR_STATUS.IN_REPAIR,
          ...(technicianId !== undefined ? { assignedTechnicianId: technicianId.trim() } : {}),
        },
      });
      await this.audit.record(
        {
          action: 'REPAIR.START',
          entityType: 'RepairOrder',
          entityId: order.id,
          after: { status: REPAIR_STATUS.IN_REPAIR, assignedTechnicianId: updated.assignedTechnicianId },
        },
        db,
      );
      return updated;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `repair-start:${orderId}` });
  }

  async markReady(orderId: string, outerTx?: Prisma.TransactionClient): Promise<RepairOrder> {
    const run = async (db: Prisma.TransactionClient): Promise<RepairOrder> => {
      const order = await this.requireOrder(orderId, db);
      this.fsm.assertNotClosed(order.status, order.orderNumber);
      this.fsm.assertTransition(order.status, REPAIR_STATUS.READY, order.orderNumber);
      const updated = await db.repairOrder.update({
        where: { id: order.id },
        data: { status: REPAIR_STATUS.READY, ...this.transitionTimestamps(REPAIR_STATUS.READY) },
      });
      await this.audit.record(
        {
          action: 'REPAIR.READY',
          entityType: 'RepairOrder',
          entityId: order.id,
          after: { status: REPAIR_STATUS.READY, totalAmount: order.totalAmount },
        },
        db,
      );
      return updated;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `repair-ready:${orderId}` });
  }

  async getRepairOrder(orderId: string, tx?: Prisma.TransactionClient): Promise<RepairOrderWithDetails> {
    assertNonEmpty(orderId, 'orderId');
    const order = await this.db(tx).repairOrder.findUnique({
      where: { id: orderId },
      include: { parts: true, party: true },
    });
    if (!order) {
      throw new RepairOrderNotFoundError(`Repair order "${orderId}" not found.`, { orderId });
    }
    return order;
  }
}
