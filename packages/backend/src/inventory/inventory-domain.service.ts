import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CatalogItem, InventoryMovement } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../core/money';
import { InsufficientStockError, NotFoundError, ValidationError } from '../core/result';
import { TransactionOrchestrator } from '../core/transaction-orchestrator';
import { AuditService } from '../core/audit.service';

/**
 * TASK BRIEF-011 Stage 3.1 — v3.0 inventory domain service (moving average).
 *
 * Centralizes every physical stock mutation of `CatalogItem` stock behind
 * append-only `InventoryMovement` rows carrying a `balanceAfterQty`
 * snapshot. Truth is the latest snapshot (no derived SUM queries);
 * negative stock is impossible by construction (issues guard, counts are
 * non-negative). Non-serialized items carry a moving-average `costPrice`
 * recomputed on every receipt:
 *
 *   newAvg = (currentQty × currentCost + incomingQty × incomingCost) / (currentQty + incomingQty)
 *   (empty stock → newAvg = incomingCost)
 *
 * All money flows through Stage 1.1 `Money`. Every mutating method runs in
 * the caller's `tx` or a fresh orchestrator transaction. Serialized units
 * (IMEI devices) are tracked in `SerializedItem` (Stage 3.2); their
 * per-unit cost uses specific identification, never the average.
 */

export const MOVEMENT_IN = 'IN';
export const MOVEMENT_OUT = 'OUT';
export const MOVEMENT_WIP_CONSUME = 'REPAIR_WIP_CONSUME';
export const MOVEMENT_WIP_RETURN = 'REPAIR_WIP_RETURN';
export const MOVEMENT_ADJUSTMENT = 'ADJUSTMENT';

export const REF_PURCHASE = 'PURCHASE';
export const REF_SALE = 'SALE';
export const REF_REPAIR_WORK_ORDER = 'REPAIR_WORK_ORDER';
export const REF_STOCK_ADJUSTMENT = 'STOCK_ADJUSTMENT';
export const REF_OPENING_BALANCE = 'OPENING_BALANCE';

export interface ReceiveStockParams {
  itemId: string;
  quantity: number;
  unitCost: string | Money;
  referenceType: string;
  referenceId: string;
  actorUserId?: string;
}

export interface IssueStockParams {
  itemId: string;
  quantity: number;
  referenceType: string;
  referenceId: string;
  actorUserId?: string;
}

export interface RepairWipParams {
  itemId: string;
  quantity: number;
  repairOrderId: string;
  actorUserId?: string;
}

export interface AdjustStockParams {
  itemId: string;
  countedQuantity: number;
  reason: string;
  referenceId: string;
  actorUserId?: string;
}

function toMoney(value: string | Money, what: string): Money {
  if (value instanceof Money) return value;
  try {
    return Money.from(value);
  } catch {
    throw new ValidationError(`InventoryDomainService: ${what} is not a valid amount.`, { value });
  }
}

function assertPositiveInt(value: number, what: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`InventoryDomainService: ${what} must be a positive integer, got ${String(value)}.`);
  }
}

function assertNonEmpty(value: string | undefined, what: string): void {
  if (!value || value.trim().length === 0) {
    throw new ValidationError(`InventoryDomainService: ${what} must be a non-empty string.`);
  }
}

@Injectable()
export class InventoryDomainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: TransactionOrchestrator,
    private readonly audit: AuditService,
  ) {}

  private db(tx?: Prisma.TransactionClient): Prisma.TransactionClient {
    return tx ?? (this.prisma as unknown as Prisma.TransactionClient);
  }

  private async requireItem(itemId: string, db: Prisma.TransactionClient): Promise<CatalogItem> {
    assertNonEmpty(itemId, 'itemId');
    const item = await db.catalogItem.findUnique({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundError(`Catalog item "${itemId}" not found.`, { itemId });
    }
    if (!item.isActive) {
      throw new ValidationError(`Catalog item ${item.sku} is inactive.`, { itemId });
    }
    return item;
  }

  private async latestBalance(itemId: string, db: Prisma.TransactionClient): Promise<number> {
    const latest = await db.inventoryMovement.findFirst({
      where: { itemId },
      orderBy: { createdAt: 'desc' },
    });
    return latest ? latest.balanceAfterQty : 0;
  }

  private async latestMovement(
    itemId: string,
    db: Prisma.TransactionClient,
  ): Promise<InventoryMovement | null> {
    return db.inventoryMovement.findFirst({ where: { itemId }, orderBy: { createdAt: 'desc' } });
  }

  /** Latest `balanceAfterQty` snapshot; 0 when the item has no movements. */
  async getAvailableStock(itemId: string, tx?: Prisma.TransactionClient): Promise<number> {
    assertNonEmpty(itemId, 'itemId');
    return this.latestBalance(itemId, this.db(tx));
  }

  async receiveStock(params: ReceiveStockParams, outerTx?: Prisma.TransactionClient): Promise<InventoryMovement> {
    assertPositiveInt(params.quantity, 'quantity');
    assertNonEmpty(params.referenceType, 'referenceType');
    assertNonEmpty(params.referenceId, 'referenceId');
    const incomingCost = toMoney(params.unitCost, 'unitCost');
    if (incomingCost.isNegative()) {
      throw new ValidationError('InventoryDomainService.receiveStock: unitCost must be >= 0.');
    }

    const run = async (db: Prisma.TransactionClient): Promise<InventoryMovement> => {
      const item = await this.requireItem(params.itemId, db);
      const currentQty = await this.latestBalance(params.itemId, db);
      const currentCost = Money.from(item.costPrice);
      const newAverage =
        currentQty <= 0
          ? incomingCost
          : currentCost.mul(currentQty).add(incomingCost.mul(params.quantity)).div(currentQty + params.quantity);
      const newBalance = currentQty + params.quantity;
      await db.catalogItem.update({
        where: { id: item.id },
        data: { costPrice: newAverage.to2dp() },
      });
      const movement = await db.inventoryMovement.create({
        data: {
          itemId: item.id,
          movementType: MOVEMENT_IN,
          quantity: params.quantity,
          unitCost: incomingCost.to2dp(),
          totalCost: incomingCost.mul(params.quantity).to2dp(),
          balanceAfterQty: newBalance,
          referenceType: params.referenceType,
          referenceId: params.referenceId,
        },
      });
      if (params.actorUserId) {
        await this.audit.record(
          {
            actorUserId: params.actorUserId,
            action: 'INVENTORY.RECEIVE',
            entityType: 'InventoryMovement',
            entityId: movement.id,
            after: {
              itemId: item.id,
              sku: item.sku,
              quantity: params.quantity,
              unitCost: incomingCost.to2dp(),
              balanceAfterQty: newBalance,
              movingAverage: newAverage.to2dp(),
            },
          },
          db,
        );
      }
      return movement;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `inventory-receive:${params.itemId}` });
  }

  async issueStock(params: IssueStockParams, outerTx?: Prisma.TransactionClient): Promise<InventoryMovement> {
    assertPositiveInt(params.quantity, 'quantity');
    assertNonEmpty(params.referenceType, 'referenceType');
    assertNonEmpty(params.referenceId, 'referenceId');

    const run = async (db: Prisma.TransactionClient): Promise<InventoryMovement> => {
      const item = await this.requireItem(params.itemId, db);
      const currentQty = await this.latestBalance(params.itemId, db);
      if (currentQty < params.quantity) {
        throw new InsufficientStockError(
          `Insufficient stock for item ${item.sku}. Required: ${params.quantity}, Available: ${currentQty}.`,
          { itemId: item.id, sku: item.sku, required: params.quantity, available: currentQty },
        );
      }
      return this.persistIssue(db, {
        item,
        currentQty,
        quantity: params.quantity,
        movementType: MOVEMENT_OUT,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        actorUserId: params.actorUserId,
        auditAction: 'INVENTORY.ISSUE',
      });
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `inventory-issue:${params.itemId}` });
  }

  async consumeForRepairWip(params: RepairWipParams, outerTx?: Prisma.TransactionClient): Promise<InventoryMovement> {
    assertPositiveInt(params.quantity, 'quantity');
    assertNonEmpty(params.repairOrderId, 'repairOrderId');

    const run = async (db: Prisma.TransactionClient): Promise<InventoryMovement> => {
      const item = await this.requireItem(params.itemId, db);
      const currentQty = await this.latestBalance(params.itemId, db);
      if (currentQty < params.quantity) {
        throw new InsufficientStockError(
          `Insufficient stock for item ${item.sku}. Required: ${params.quantity}, Available: ${currentQty}.`,
          { itemId: item.id, sku: item.sku, required: params.quantity, available: currentQty },
        );
      }
      return this.persistIssue(db, {
        item,
        currentQty,
        quantity: params.quantity,
        movementType: MOVEMENT_WIP_CONSUME,
        referenceType: REF_REPAIR_WORK_ORDER,
        referenceId: params.repairOrderId,
        actorUserId: params.actorUserId,
        auditAction: 'INVENTORY.WIP_CONSUME',
      });
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `inventory-wip-consume:${params.itemId}` });
  }

  /**
   * Returns a WIP part to saleable stock at the CURRENT average (no
   * re-averaging — the cost layer never left the building).
   */
  async returnFromRepairWip(params: RepairWipParams, outerTx?: Prisma.TransactionClient): Promise<InventoryMovement> {
    assertPositiveInt(params.quantity, 'quantity');
    assertNonEmpty(params.repairOrderId, 'repairOrderId');

    const run = async (db: Prisma.TransactionClient): Promise<InventoryMovement> => {
      const item = await this.requireItem(params.itemId, db);
      const currentQty = await this.latestBalance(params.itemId, db);
      const cost = Money.from(item.costPrice);
      const newBalance = currentQty + params.quantity;
      const movement = await db.inventoryMovement.create({
        data: {
          itemId: item.id,
          movementType: MOVEMENT_WIP_RETURN,
          quantity: params.quantity,
          unitCost: cost.to2dp(),
          totalCost: cost.mul(params.quantity).to2dp(),
          balanceAfterQty: newBalance,
          referenceType: REF_REPAIR_WORK_ORDER,
          referenceId: params.repairOrderId,
        },
      });
      if (params.actorUserId) {
        await this.audit.record(
          {
            actorUserId: params.actorUserId,
            action: 'INVENTORY.WIP_RETURN',
            entityType: 'InventoryMovement',
            entityId: movement.id,
            after: { itemId: item.id, sku: item.sku, quantity: params.quantity, balanceAfterQty: newBalance },
          },
          db,
        );
      }
      return movement;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `inventory-wip-return:${params.itemId}` });
  }

  /**
   * Cycle-count reconciliation. `balanceAfterQty` becomes the counted value
   * verbatim, so stock can never go negative through this path either.
   * A zero discrepancy returns the latest movement (or a qty-0 marker when
   * the item has no history yet).
   */
  async adjustStock(params: AdjustStockParams, outerTx?: Prisma.TransactionClient): Promise<InventoryMovement> {
    if (!Number.isInteger(params.countedQuantity) || params.countedQuantity < 0) {
      throw new ValidationError(
        `InventoryDomainService.adjustStock: countedQuantity must be an integer >= 0, got ${String(params.countedQuantity)}.`,
      );
    }
    assertNonEmpty(params.reason, 'reason');
    assertNonEmpty(params.referenceId, 'referenceId');

    const run = async (db: Prisma.TransactionClient): Promise<InventoryMovement> => {
      const item = await this.requireItem(params.itemId, db);
      const currentQty = await this.latestBalance(params.itemId, db);
      const diff = params.countedQuantity - currentQty;
      if (diff === 0) {
        const latest = await this.latestMovement(params.itemId, db);
        if (latest) return latest;
        return db.inventoryMovement.create({
          data: {
            itemId: item.id,
            movementType: MOVEMENT_ADJUSTMENT,
            quantity: 0,
            unitCost: Money.from(item.costPrice).to2dp(),
            totalCost: '0.00',
            balanceAfterQty: currentQty,
            referenceType: REF_STOCK_ADJUSTMENT,
            referenceId: params.referenceId,
          },
        });
      }
      const absQty = Math.abs(diff);
      const cost = Money.from(item.costPrice);
      const movement = await db.inventoryMovement.create({
        data: {
          itemId: item.id,
          movementType: MOVEMENT_ADJUSTMENT,
          quantity: absQty,
          unitCost: cost.to2dp(),
          totalCost: cost.mul(absQty).to2dp(),
          balanceAfterQty: params.countedQuantity,
          referenceType: REF_STOCK_ADJUSTMENT,
          referenceId: params.referenceId,
        },
      });
      if (params.actorUserId) {
        await this.audit.record(
          {
            actorUserId: params.actorUserId,
            action: 'INVENTORY.ADJUST',
            entityType: 'InventoryMovement',
            entityId: movement.id,
            before: { balanceQty: currentQty },
            after: {
              itemId: item.id,
              sku: item.sku,
              countedQuantity: params.countedQuantity,
              discrepancy: diff,
              reason: params.reason,
            },
          },
          db,
        );
      }
      return movement;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `inventory-adjust:${params.itemId}` });
  }

  /** Stock value at moving-average cost. Exact 2dp total; read-only. */
  async calculateValuation(
    itemId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ totalQuantity: number; totalValuation: string }> {
    const db = this.db(tx);
    const items =
      itemId !== undefined
        ? [await this.requireItem(itemId, db)]
        : await db.catalogItem.findMany({ where: { isActive: true } });
    let totalQuantity = 0;
    let totalValuation = Money.zero();
    for (const item of items) {
      const qty = await this.latestBalance(item.id, db);
      totalQuantity += qty;
      totalValuation = totalValuation.add(Money.from(item.costPrice).mul(qty));
    }
    return { totalQuantity, totalValuation: totalValuation.to2dp() };
  }

  /** Shared OUT-direction writer (issues + WIP consumes value at current average). */
  private async persistIssue(
    db: Prisma.TransactionClient,
    opts: {
      item: CatalogItem;
      currentQty: number;
      quantity: number;
      movementType: string;
      referenceType: string;
      referenceId: string;
      actorUserId?: string;
      auditAction: string;
    },
  ): Promise<InventoryMovement> {
    const cost = Money.from(opts.item.costPrice);
    const newBalance = opts.currentQty - opts.quantity;
    const movement = await db.inventoryMovement.create({
      data: {
        itemId: opts.item.id,
        movementType: opts.movementType,
        quantity: opts.quantity,
        unitCost: cost.to2dp(),
        totalCost: cost.mul(opts.quantity).to2dp(),
        balanceAfterQty: newBalance,
        referenceType: opts.referenceType,
        referenceId: opts.referenceId,
      },
    });
    if (opts.actorUserId) {
      await this.audit.record(
        {
          actorUserId: opts.actorUserId,
          action: opts.auditAction,
          entityType: 'InventoryMovement',
          entityId: movement.id,
          after: {
            itemId: opts.item.id,
            sku: opts.item.sku,
            quantity: opts.quantity,
            unitCost: cost.to2dp(),
            balanceAfterQty: newBalance,
          },
        },
        db,
      );
    }
    return movement;
  }
}
