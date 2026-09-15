import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BusinessDocument, RepairOrder, RepairOrderPart } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Money } from '../../core/money';
import { ConflictError, NotFoundError, ValidationError } from '../../core/result';
import { TransactionOrchestrator } from '../../core/transaction-orchestrator';
import { DocumentNumberService } from '../../core/document-number.service';
import { AuditService } from '../../core/audit.service';
import { InventoryDomainService } from '../../inventory/inventory-domain.service';
import { PostingService } from '../../accounting/posting.service';
import { PartiesService } from '../../parties/parties.service';
import { PartySubledgerService } from '../../parties/party-subledger.service';
import { RepairFsmService } from './repair-fsm.service';
import { InvalidRepairPricingError } from './repairs.errors';
import { REPAIR_STATUS } from './repairs.types';
import type { DeliverRepairOrderDto, RepairPaymentInput } from './dto/deliver-repair-order.dto';

/**
 * DIRECTIVE-014 Stage 6.2 — atomic repair operations (v3.0 workshop engine).
 *
 * Owns part consumption/return with IAS 2 WIP clearing, the delivery
 * invoice (document + split payments + balanced journal + subledger leg),
 * and cancellation with automatic stock/WIP restoration. Every public
 * method runs in the caller's `tx` or a fresh orchestrator transaction —
 * partial workshop writes are impossible.
 *
 * COA notes (committed chart, NOT the directive's assumed codes):
 *  - Cash → 10000, Bank → 10200, Wallet float → 10100 (directive wrote
 *    10100/10200/10300 — 10100 is the wallet float and 10300 is Owner
 *    Advances in the committed COA).
 *  - Spare parts stock → 12200, Repair WIP clearing → 12300 (added in
 *    Stage 6.2; the directive's 12100 is Serialized Devices here).
 *  - Parts revenue → 40000 Sales Revenue (directive wrote 40300, which is
 *    Flexy margin in the committed COA). Labor revenue → 40200 ✓.
 *  - WIP journals use documentType 'REPAIR_WIP' (open-string design).
 *  - Delivery documents are SALE_INVOICE/POSTED like counter sales, so
 *    revenue listings stay uniform. DocumentLines carry consumed PARTS
 *    only — labor has no CatalogItem and the FK forbids orphan lines;
 *    labor economics live in the header + journal.
 */

const WIP_CLEARING = '12300';
const SPARES_STOCK = '12200';
const COGS_PARTS = '50100';
const CASH = '10000';
const BANK = '10200';
const WALLET_FLOAT = '10100';
const AR_CONTROL = '11000';
const LABOR_REVENUE = '40200';
const PARTS_REVENUE_SALES = '40000';

const PAYMENT_ACCOUNT: Record<string, string> = {
  CASH,
  DIGITAL_WALLET: WALLET_FLOAT,
  BANK_TRANSFER: BANK,
};

export interface RepairDeliveryResult {
  order: RepairOrder;
  document: BusinessDocument;
  journalEntryId: string;
  journalNumber: string;
}

function toMoney(value: string | Money, what: string): Money {
  if (value instanceof Money) return value;
  try {
    return Money.from(value);
  } catch {
    throw new InvalidRepairPricingError(`RepairOrchestratorService: ${what} is not a valid amount.`, { value });
  }
}

function assertPositiveInt(value: number, what: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`RepairOrchestratorService: ${what} must be a positive integer, got ${String(value)}.`);
  }
}

@Injectable()
export class RepairOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: TransactionOrchestrator,
    private readonly sequences: DocumentNumberService,
    private readonly inventory: InventoryDomainService,
    private readonly posting: PostingService,
    private readonly parties: PartiesService,
    private readonly subledger: PartySubledgerService,
    private readonly audit: AuditService,
    private readonly fsm: RepairFsmService,
  ) {}

  private db(tx?: Prisma.TransactionClient): Prisma.TransactionClient {
    return tx ?? (this.prisma as unknown as Prisma.TransactionClient);
  }

  private async requireOrder(orderId: string, db: Prisma.TransactionClient): Promise<RepairOrder> {
    if (!orderId || orderId.trim().length === 0) {
      throw new ValidationError('RepairOrchestratorService: orderId must be a non-empty string.');
    }
    const order = await db.repairOrder.findUnique({ where: { id: orderId } });
    if (!order) {
      const { RepairOrderNotFoundError } = await import('./repairs.errors');
      throw new RepairOrderNotFoundError(`Repair order "${orderId}" not found.`, { orderId });
    }
    return order;
  }

  private async activeParts(orderId: string, db: Prisma.TransactionClient) {
    return db.repairOrderPart.findMany({ where: { repairOrderId: orderId, status: { not: 'RETURNED' } } });
  }

  private async refreshTotals(
    db: Prisma.TransactionClient,
    order: RepairOrder,
  ): Promise<{ partsTotal: Money; total: Money; outstanding: Money }> {
    const parts = await this.activeParts(order.id, db);
    let partsTotal = Money.zero();
    for (const part of parts) {
      partsTotal = partsTotal.add(Money.from(part.totalPrice));
    }
    const labor = Money.from(order.laborPrice);
    const discount = Money.from(order.discountAmount);
    const paid = Money.from(order.paidAmount);
    const total = labor.add(partsTotal).sub(discount);
    return { partsTotal, total, outstanding: total.sub(paid) };
  }

  async consumePart(
    repairOrderId: string,
    itemId: string,
    quantity: number,
    unitPrice: string | Money,
    actorUserId?: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<RepairOrderPart> {
    assertPositiveInt(quantity, 'quantity');
    const price = toMoney(unitPrice, 'unitPrice');
    if (price.isNegative()) {
      throw new InvalidRepairPricingError('RepairOrchestratorService.consumePart: unitPrice must be >= 0.');
    }

    const run = async (db: Prisma.TransactionClient): Promise<RepairOrderPart> => {
      const order = await this.requireOrder(repairOrderId, db);
      this.fsm.assertNotClosed(order.status, order.orderNumber);
      if (order.status !== REPAIR_STATUS.APPROVED && order.status !== REPAIR_STATUS.IN_REPAIR) {
        const { InvalidRepairStateTransitionError } = await import('./repairs.errors');
        throw new InvalidRepairStateTransitionError(
          `Parts can only be consumed in APPROVED or IN_REPAIR (order ${order.orderNumber} is ${order.status}).`,
          { orderId: order.id, status: order.status },
        );
      }
      const movement = await this.inventory.consumeForRepairWip(
        { itemId, quantity, repairOrderId: order.id, actorUserId },
        db,
      );
      const unitCost = Money.from(movement.unitCost);
      const totalCost = unitCost.mul(quantity);
      const totalPrice = price.mul(quantity);
      const part = await db.repairOrderPart.create({
        data: {
          repairOrderId: order.id,
          itemId,
          quantity,
          unitCost: unitCost.to2dp(),
          totalCost: totalCost.to2dp(),
          unitPrice: price.to2dp(),
          totalPrice: totalPrice.to2dp(),
          status: 'CONSUMED',
        },
      });
      await this.posting.post(
        {
          documentType: 'REPAIR_WIP',
          description: `Consume part ${itemId} for repair ${order.orderNumber}`,
          lines: [
            { accountCode: WIP_CLEARING, debit: totalCost.to2dp(), memo: `WIP ${order.orderNumber}` },
            { accountCode: SPARES_STOCK, credit: totalCost.to2dp(), memo: `WIP ${order.orderNumber}` },
          ],
          postingDate: new Date(),
          actorUserId,
        },
        db,
      );
      const partsTotal = Money.from(order.partsPriceTotal).add(totalPrice);
      const total = Money.from(order.laborPrice).add(partsTotal).sub(Money.from(order.discountAmount));
      await db.repairOrder.update({
        where: { id: order.id },
        data: {
          partsPriceTotal: partsTotal.to2dp(),
          totalAmount: total.to2dp(),
          outstandingAmount: total.sub(Money.from(order.paidAmount)).to2dp(),
        },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'REPAIR.PART_CONSUME',
          entityType: 'RepairOrderPart',
          entityId: part.id,
          after: { orderId: order.id, itemId, quantity, unitCost: unitCost.to2dp(), totalPrice: totalPrice.to2dp() },
        },
        db,
      );
      return part;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `repair-consume:${repairOrderId}` });
  }

  async returnPart(
    repairOrderId: string,
    partId: string,
    actorUserId?: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<RepairOrderPart> {
    const run = async (db: Prisma.TransactionClient): Promise<RepairOrderPart> => {
      const order = await this.requireOrder(repairOrderId, db);
      this.fsm.assertNotClosed(order.status, order.orderNumber);
      const part = await db.repairOrderPart.findUnique({ where: { id: partId } });
      if (!part) {
        throw new NotFoundError(`Repair part "${partId}" not found.`, { partId });
      }
      if (part.repairOrderId !== order.id) {
        throw new ValidationError(`Part ${partId} does not belong to repair order ${order.orderNumber}.`, {
          partId,
          orderId: order.id,
        });
      }
      if (part.status !== 'CONSUMED') {
        throw new ConflictError(`Part ${partId} is ${part.status} — only CONSUMED parts can be returned.`, {
          partId,
          status: part.status,
        });
      }
      await this.inventory.returnFromRepairWip(
        { itemId: part.itemId, quantity: part.quantity, repairOrderId: order.id, actorUserId },
        db,
      );
      const updated = await db.repairOrderPart.update({
        where: { id: part.id },
        data: { status: 'RETURNED', returnedAt: new Date() },
      });
      const partTotal = Money.from(part.totalPrice);
      await this.posting.post(
        {
          documentType: 'REPAIR_WIP',
          description: `Return part ${part.itemId} to stock for repair ${order.orderNumber}`,
          lines: [
            { accountCode: SPARES_STOCK, debit: Money.from(part.totalCost).to2dp(), memo: `WIP return ${order.orderNumber}` },
            { accountCode: WIP_CLEARING, credit: Money.from(part.totalCost).to2dp(), memo: `WIP return ${order.orderNumber}` },
          ],
          postingDate: new Date(),
          actorUserId,
        },
        db,
      );
      const partsTotal = Money.from(order.partsPriceTotal).sub(partTotal);
      const total = Money.from(order.laborPrice).add(partsTotal).sub(Money.from(order.discountAmount));
      await db.repairOrder.update({
        where: { id: order.id },
        data: {
          partsPriceTotal: partsTotal.to2dp(),
          totalAmount: total.to2dp(),
          outstandingAmount: total.sub(Money.from(order.paidAmount)).to2dp(),
        },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'REPAIR.PART_RETURN',
          entityType: 'RepairOrderPart',
          entityId: part.id,
          after: { orderId: order.id, status: 'RETURNED' },
        },
        db,
      );
      return updated;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `repair-return-part:${partId}` });
  }

  async deliverRepairOrder(
    params: DeliverRepairOrderDto,
    outerTx?: Prisma.TransactionClient,
  ): Promise<RepairDeliveryResult> {
    const run = async (db: Prisma.TransactionClient): Promise<RepairDeliveryResult> => {
      const order = await this.requireOrder(params.repairOrderId, db);
      this.fsm.assertNotClosed(order.status, order.orderNumber);
      this.fsm.assertTransition(order.status, REPAIR_STATUS.DELIVERED, order.orderNumber);

      const parts = await this.activeParts(order.id, db);
      let partsTotal = Money.zero();
      let partsCost = Money.zero();
      for (const part of parts) {
        partsTotal = partsTotal.add(Money.from(part.totalPrice));
        partsCost = partsCost.add(Money.from(part.totalCost));
      }
      const labor = Money.from(order.laborPrice);
      const discount =
        params.discountAmount !== undefined ? toMoney(params.discountAmount, 'discountAmount') : Money.from(order.discountAmount);
      if (discount.isNegative()) {
        throw new InvalidRepairPricingError('RepairOrchestratorService.deliverRepairOrder: discountAmount must be >= 0.');
      }
      const total = labor.add(partsTotal).sub(discount);
      if (total.isNegative()) {
        throw new InvalidRepairPricingError(
          `RepairOrchestratorService.deliverRepairOrder: discount ${discount.to2dp()} exceeds billable ${labor.add(partsTotal).to2dp()}.`,
        );
      }

      const payments = params.payments ?? [];
      let paid = Money.zero();
      for (let index = 0; index < payments.length; index += 1) {
        const payment = payments[index];
        if (!PAYMENT_ACCOUNT[payment.paymentMethod]) {
          throw new ValidationError(
            `RepairOrchestratorService.deliverRepairOrder: payment ${index + 1} has unknown method "${payment.paymentMethod}".`,
          );
        }
        const amount = toMoney(payment.amount, `payment ${index + 1} amount`);
        if (amount.isNegative()) {
          throw new ValidationError(`RepairOrchestratorService.deliverRepairOrder: payment ${index + 1} amount must be >= 0.`);
        }
        paid = paid.add(amount);
      }
      if (paid.greaterThan(total)) {
        throw new ValidationError('Overpayment is not permitted in repair delivery.');
      }
      const outstanding = total.sub(paid);
      const party = outstanding.isPositive() ? await this.parties.getParty(order.partyId, db) : null;

      const documentNumber = await this.sequences.nextNumber('INV-', db, 6);
      const document = await db.businessDocument.create({
        data: {
          documentNumber,
          type: 'SALE_INVOICE',
          partyId: order.partyId,
          status: 'POSTED',
          subtotalAmount: labor.add(partsTotal).to2dp(),
          discountAmount: discount.to2dp(),
          totalAmount: total.to2dp(),
          paidAmount: paid.to2dp(),
          outstandingAmount: outstanding.to2dp(),
          lines: {
            create: parts.map((part) => ({
              itemId: part.itemId,
              serialId: null,
              quantity: part.quantity,
              unitCost: part.unitCost,
              unitPrice: part.unitPrice,
              lineTotal: part.totalPrice,
            })),
          },
          payments: {
            create: payments.map((payment, index) => ({
              paymentMethod: payment.paymentMethod,
              amount: toMoney(payment.amount, `payment ${index + 1} amount`).to2dp(),
              walletId: payment.walletId ?? null,
              repairOrderId: order.id,
            })),
          },
        },
        include: { lines: true, payments: true },
      });

      // Discount waterfall: labor first, overflow onto parts (both legs stay >= 0).
      const laborDiscount = discount.lessThanOrEqual(labor) ? discount : labor;
      const partsDiscount = discount.sub(laborDiscount);
      const laborNet = labor.sub(laborDiscount);
      const partsNet = partsTotal.sub(partsDiscount);

      const legs: Array<{ accountCode: string; debit?: string; credit?: string; partyId?: string; memo?: string }> = [];
      for (const payment of payments) {
        const amount = toMoney(payment.amount, 'payment amount');
        if (amount.isPositive()) {
          legs.push({ accountCode: PAYMENT_ACCOUNT[payment.paymentMethod], debit: amount.to2dp() });
        }
      }
      if (outstanding.isPositive() && party) {
        legs.push({ accountCode: AR_CONTROL, debit: outstanding.to2dp(), partyId: party.id });
      }
      if (laborNet.isPositive()) {
        legs.push({ accountCode: LABOR_REVENUE, credit: laborNet.to2dp() });
      }
      if (partsNet.isPositive()) {
        legs.push({ accountCode: PARTS_REVENUE_SALES, credit: partsNet.to2dp(), memo: 'Spare parts revenue' });
      }
      if (partsCost.isPositive()) {
        legs.push({ accountCode: COGS_PARTS, debit: partsCost.to2dp() });
        legs.push({ accountCode: WIP_CLEARING, credit: partsCost.to2dp(), memo: `Flush WIP ${order.orderNumber}` });
      }
      let journalEntryId = '';
      let journalNumber = '';
      if (legs.length >= 2) {
        const posted = await this.posting.post(
          {
            documentType: 'SALE_INVOICE',
            documentId: document.id,
            description: `Repair delivery ${order.orderNumber} — ${documentNumber}`,
            lines: legs,
            postingDate: new Date(),
            actorUserId: params.actorUserId,
          },
          db,
        );
        journalEntryId = posted.id;
        journalNumber = posted.entryNumber;
        if (outstanding.isPositive() && party) {
          const arLeg = posted.lines.find((line) => line.accountCode === AR_CONTROL);
          if (!arLeg) {
            throw new ValidationError('Repair delivery journal is missing its AR leg.', { journalEntryId: posted.id });
          }
          await this.subledger.recordSubledgerEntry(
            {
              partyId: party.id,
              journalLineId: arLeg.id,
              entryType: 'INVOICE_CHARGE',
              amount: outstanding,
              isDebit: true,
              actorUserId: params.actorUserId,
            },
            db,
          );
        }
      }

      const updated = await db.repairOrder.update({
        where: { id: order.id },
        data: {
          status: REPAIR_STATUS.DELIVERED,
          deliveredAt: new Date(),
          businessDocumentId: document.id,
          discountAmount: discount.to2dp(),
          partsPriceTotal: partsTotal.to2dp(),
          totalAmount: total.to2dp(),
          paidAmount: paid.to2dp(),
          outstandingAmount: outstanding.to2dp(),
        },
      });
      await this.audit.record(
        {
          actorUserId: params.actorUserId,
          action: 'REPAIR.DELIVER',
          entityType: 'RepairOrder',
          entityId: order.id,
          after: {
            status: REPAIR_STATUS.DELIVERED,
            documentNumber,
            totalAmount: total.to2dp(),
            paidAmount: paid.to2dp(),
            outstandingAmount: outstanding.to2dp(),
            journalNumber,
          },
        },
        db,
      );
      return { order: updated, document, journalEntryId, journalNumber };
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `repair-deliver:${params.repairOrderId}` });
  }

  async cancelRepairOrder(
    repairOrderId: string,
    reason?: string,
    actorUserId?: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<RepairOrder> {
    const run = async (db: Prisma.TransactionClient): Promise<RepairOrder> => {
      const order = await this.requireOrder(repairOrderId, db);
      this.fsm.assertNotClosed(order.status, order.orderNumber);
      this.fsm.assertTransition(order.status, REPAIR_STATUS.CANCELLED, order.orderNumber);

      const parts = await this.activeParts(order.id, db);
      let restoredCost = Money.zero();
      for (const part of parts) {
        await this.inventory.returnFromRepairWip(
          { itemId: part.itemId, quantity: part.quantity, repairOrderId: order.id, actorUserId },
          db,
        );
        await db.repairOrderPart.update({
          where: { id: part.id },
          data: { status: 'RETURNED', returnedAt: new Date() },
        });
        restoredCost = restoredCost.add(Money.from(part.totalCost));
      }
      if (restoredCost.isPositive()) {
        await this.posting.post(
          {
            documentType: 'REPAIR_WIP',
            description: `Repair cancellation ${order.orderNumber}: ${reason?.trim() ? reason.trim() : 'cancelled'}`,
            lines: [
              { accountCode: SPARES_STOCK, debit: restoredCost.to2dp(), memo: `Cancel ${order.orderNumber}` },
              { accountCode: WIP_CLEARING, credit: restoredCost.to2dp(), memo: `Cancel ${order.orderNumber}` },
            ],
            postingDate: new Date(),
            actorUserId,
          },
          db,
        );
      }
      const updated = await db.repairOrder.update({
        where: { id: order.id },
        data: {
          status: REPAIR_STATUS.CANCELLED,
          cancelledAt: new Date(),
          partsPriceTotal: '0.00',
          totalAmount: Money.from(order.laborPrice).sub(Money.from(order.discountAmount)).to2dp(),
          outstandingAmount: Money.from(order.laborPrice)
            .sub(Money.from(order.discountAmount))
            .sub(Money.from(order.paidAmount))
            .to2dp(),
        },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'REPAIR.CANCEL',
          entityType: 'RepairOrder',
          entityId: order.id,
          after: { status: REPAIR_STATUS.CANCELLED, reason: reason?.trim() ?? null, restoredParts: parts.length },
        },
        db,
      );
      return updated;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `repair-cancel:${repairOrderId}` });
  }
}
