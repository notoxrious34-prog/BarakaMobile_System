import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CatalogItem, SerializedItem, SerializedLifecycleEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../core/money';
import { ConflictError, NotFoundError, ValidationError } from '../core/result';
import { TransactionOrchestrator } from '../core/transaction-orchestrator';
import { AuditService } from '../core/audit.service';

/**
 * TASK BRIEF-012 Stage 3.2 — serialized inventory & IMEI lifecycle (v3.0).
 *
 * Owns every `SerializedItem` row: Luhn-checked registration, a strict
 * state machine, append-only lifecycle events, and specific-identification
 * cost for double-entry COGS (a serialized unit's cost is its own
 * `acquisitionCost` — never the moving average).
 *
 * FSM subtlety (documented, not accidental): SOLD has no direct edge to
 * IN_STOCK/DEFECTIVE, yet returns must resolve there. `restockFromReturn`
 * therefore hops SOLD → RETURNED (carrying the RETURN event) and then
 * RETURNED → target (STATUS_CHANGE). History shows both hops — the v2.9.2
 * gap was precisely that return-restock left no auditable trail.
 */

export const SERIAL_STATUS = {
  IN_STOCK: 'IN_STOCK',
  RESERVED: 'RESERVED',
  SOLD: 'SOLD',
  UNDER_REPAIR: 'UNDER_REPAIR',
  WARRANTY_CLAIMED: 'WARRANTY_CLAIMED',
  RETURNED: 'RETURNED',
  DEFECTIVE: 'DEFECTIVE',
  SALVAGED: 'SALVAGED',
} as const;

export type SerialStatus = (typeof SERIAL_STATUS)[keyof typeof SERIAL_STATUS];

export const LIFECYCLE_EVENT = {
  PURCHASE_IN: 'PURCHASE_IN',
  SALE_OUT: 'SALE_OUT',
  REPAIR_HOLD: 'REPAIR_HOLD',
  RETURN_RESTOCK: 'RETURN_RESTOCK',
  DEFECT_QUARANTINE: 'DEFECT_QUARANTINE',
  WARRANTY_CLAIM: 'WARRANTY_CLAIM',
  SALVAGE_DECOMMISSION: 'SALVAGE_DECOMMISSION',
  STATUS_CHANGE: 'STATUS_CHANGE',
} as const;

export type LifecycleEventType = (typeof LIFECYCLE_EVENT)[keyof typeof LIFECYCLE_EVENT];

const KNOWN_STATUSES = new Set<string>(Object.values(SERIAL_STATUS));
const KNOWN_EVENTS = new Set<string>(Object.values(LIFECYCLE_EVENT));

export const VALID_TRANSITIONS: Record<string, readonly string[]> = {
  [SERIAL_STATUS.IN_STOCK]: [
    SERIAL_STATUS.RESERVED,
    SERIAL_STATUS.SOLD,
    SERIAL_STATUS.UNDER_REPAIR,
    SERIAL_STATUS.DEFECTIVE,
    SERIAL_STATUS.SALVAGED,
  ],
  [SERIAL_STATUS.RESERVED]: [SERIAL_STATUS.IN_STOCK, SERIAL_STATUS.SOLD],
  [SERIAL_STATUS.SOLD]: [
    SERIAL_STATUS.RETURNED,
    SERIAL_STATUS.UNDER_REPAIR,
    SERIAL_STATUS.WARRANTY_CLAIMED,
  ],
  [SERIAL_STATUS.RETURNED]: [SERIAL_STATUS.IN_STOCK, SERIAL_STATUS.DEFECTIVE, SERIAL_STATUS.SALVAGED],
  [SERIAL_STATUS.UNDER_REPAIR]: [
    SERIAL_STATUS.IN_STOCK,
    SERIAL_STATUS.SOLD,
    SERIAL_STATUS.DEFECTIVE,
    SERIAL_STATUS.SALVAGED,
  ],
  [SERIAL_STATUS.WARRANTY_CLAIMED]: [
    SERIAL_STATUS.SOLD,
    SERIAL_STATUS.UNDER_REPAIR,
    SERIAL_STATUS.DEFECTIVE,
    SERIAL_STATUS.SALVAGED,
  ],
  [SERIAL_STATUS.DEFECTIVE]: [SERIAL_STATUS.IN_STOCK, SERIAL_STATUS.SALVAGED],
  [SERIAL_STATUS.SALVAGED]: [],
};

export type RestockCondition = 'RESTOCKED_INVENTORY' | 'DEFECTIVE_QUARANTINE';

export interface RegisterSerialParams {
  imei1: string;
  imei2?: string;
  itemId: string;
  acquisitionCost: string | Money;
  warrantyMonths?: number;
  referenceId: string;
  actorUserId?: string;
}

export interface AttachToSaleParams {
  serialId: string;
  saleDocumentId: string;
  actorUserId?: string;
}

export interface RestockFromReturnParams {
  serialId: string;
  returnDocumentId: string;
  condition: RestockCondition;
  actorUserId?: string;
}

export interface TransitionStatusParams {
  serialId: string;
  toStatus: string;
  eventType: string;
  referenceType: string;
  referenceId: string;
  description: string;
  actorUserId?: string;
}

export type SerialWithHistory = SerializedItem & {
  item: CatalogItem;
  lifecycleEvents: SerializedLifecycleEvent[];
  isUnderWarranty: boolean;
};

/**
 * Validates + normalizes a serial: 15-digit Luhn IMEI, else 8–20 char
 * alphanumeric. Normalization (trim, strip spaces/dashes) matches the
 * v2.9.2 intake convention so uniqueness checks are canonical.
 */
export function validateImeiOrSerial(raw: string): { kind: 'IMEI' | 'SERIAL'; normalized: string } {
  const normalized = (raw ?? '').trim().replace(/[\s-]+/g, '');
  if (/^\d{15}$/.test(normalized)) {
    let sum = 0;
    for (let i = 0; i < 14; i += 1) {
      let digit = Number(normalized[i]);
      if (i % 2 === 1) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    const check = (10 - (sum % 10)) % 10;
    if (check !== Number(normalized[14])) {
      throw new ValidationError(`Invalid IMEI checksum: "${raw}".`);
    }
    return { kind: 'IMEI', normalized };
  }
  if (/^[A-Za-z0-9]{8,20}$/.test(normalized)) {
    return { kind: 'SERIAL', normalized };
  }
  throw new ValidationError(
    'Serial must be a 15-digit IMEI (Luhn-checked) or an 8–20 character alphanumeric serial.',
  );
}

function assertNonEmpty(value: string | undefined, what: string): void {
  if (!value || value.trim().length === 0) {
    throw new ValidationError(`SerializedInventoryService: ${what} must be a non-empty string.`);
  }
}

function toMoney(value: string | Money, what: string): Money {
  if (value instanceof Money) return value;
  try {
    return Money.from(value);
  } catch {
    throw new ValidationError(`SerializedInventoryService: ${what} is not a valid amount.`, { value });
  }
}

@Injectable()
export class SerializedInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: TransactionOrchestrator,
    private readonly audit: AuditService,
  ) {}

  private db(tx?: Prisma.TransactionClient): Prisma.TransactionClient {
    return tx ?? (this.prisma as unknown as Prisma.TransactionClient);
  }

  private async requireSerial(serialId: string, db: Prisma.TransactionClient): Promise<SerializedItem> {
    assertNonEmpty(serialId, 'serialId');
    const device = await db.serializedItem.findUnique({ where: { id: serialId } });
    if (!device) {
      throw new NotFoundError(`Serialized device "${serialId}" not found.`, { serialId });
    }
    return device;
  }

  private async requireCatalogItem(itemId: string, db: Prisma.TransactionClient): Promise<CatalogItem> {
    assertNonEmpty(itemId, 'itemId');
    const item = await db.catalogItem.findUnique({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundError(`Catalog item "${itemId}" not found.`, { itemId });
    }
    if (!item.isActive) {
      throw new ValidationError(`Catalog item ${item.sku} is inactive.`, { itemId });
    }
    if (!item.isSerialized) {
      throw new ValidationError(
        `Catalog item ${item.sku} is not serialized — register it as bulk stock instead.`,
        { itemId },
      );
    }
    return item;
  }

  /**
   * Single validated hop: FSM-check → status update → lifecycle event →
   * optional audit. Same-status calls are idempotent no-ops (no event).
   */
  private async applyTransition(
    db: Prisma.TransactionClient,
    device: SerializedItem,
    toStatus: string,
    eventType: string,
    referenceType: string,
    referenceId: string,
    description: string,
    actorUserId?: string,
    auditAction = 'SERIAL.STATUS_CHANGE',
  ): Promise<SerializedItem> {
    if (!KNOWN_STATUSES.has(toStatus)) {
      throw new ValidationError(`Unknown serial status "${toStatus}".`, { toStatus });
    }
    if (!KNOWN_EVENTS.has(eventType)) {
      throw new ValidationError(`Unknown lifecycle event "${eventType}".`, { eventType });
    }
    assertNonEmpty(referenceType, 'referenceType');
    assertNonEmpty(referenceId, 'referenceId');
    assertNonEmpty(description, 'description');
    if (device.currentStatus === toStatus) return device;

    const allowed = VALID_TRANSITIONS[device.currentStatus] ?? [];
    if (!allowed.includes(toStatus)) {
      throw new ConflictError(
        `Illegal status transition ${device.currentStatus} → ${toStatus} for ${device.imei1}.`,
        { serialId: device.id, from: device.currentStatus, to: toStatus },
      );
    }
    const updated = await db.serializedItem.update({ where: { id: device.id }, data: { currentStatus: toStatus } });
    await db.serializedLifecycleEvent.create({
      data: {
        serialId: device.id,
        eventType,
        referenceType,
        referenceId,
        description,
      },
    });
    if (actorUserId) {
      await this.audit.record(
        {
          actorUserId,
          action: auditAction,
          entityType: 'SerializedItem',
          entityId: device.id,
          before: { status: device.currentStatus },
          after: { status: toStatus, eventType, referenceId },
        },
        db,
      );
    }
    return updated;
  }

  async registerSerial(params: RegisterSerialParams, outerTx?: Prisma.TransactionClient): Promise<SerializedItem> {
    const { normalized: imei1 } = validateImeiOrSerial(params.imei1);
    let imei2: string | undefined;
    if (params.imei2 !== undefined && params.imei2.trim().length > 0) {
      imei2 = validateImeiOrSerial(params.imei2).normalized;
    }
    assertNonEmpty(params.referenceId, 'referenceId');
    const cost = toMoney(params.acquisitionCost, 'acquisitionCost');
    if (cost.isNegative()) {
      throw new ValidationError('SerializedInventoryService.registerSerial: acquisitionCost must be >= 0.');
    }
    const warrantyMonths = params.warrantyMonths ?? 12;
    if (!Number.isInteger(warrantyMonths) || warrantyMonths < 0 || warrantyMonths > 60) {
      throw new ValidationError('SerializedInventoryService.registerSerial: warrantyMonths must be an integer in [0, 60].');
    }

    const run = async (db: Prisma.TransactionClient): Promise<SerializedItem> => {
      const item = await this.requireCatalogItem(params.itemId, db);
      const clash = await db.serializedItem.findFirst({
        where: { OR: [{ imei1 }, ...(imei2 ? [{ imei2 }] : [])] },
      });
      if (clash) {
        throw new ConflictError(`Serial ${imei1} is already registered.`, { imei1 });
      }
      const now = new Date();
      const warrantyEndsAt = new Date(now);
      warrantyEndsAt.setMonth(warrantyEndsAt.getMonth() + warrantyMonths);
      const device = await db.serializedItem.create({
        data: {
          imei1,
          imei2: imei2 ?? null,
          itemId: item.id,
          acquisitionCost: cost.to2dp(),
          currentStatus: SERIAL_STATUS.IN_STOCK,
          warrantyMonths,
          warrantyEndsAt,
        },
      });
      await db.serializedLifecycleEvent.create({
        data: {
          serialId: device.id,
          eventType: LIFECYCLE_EVENT.PURCHASE_IN,
          referenceType: 'PURCHASE',
          referenceId: params.referenceId,
          description: `Purchase intake: ${item.name} (${imei1}).`,
        },
      });
      if (params.actorUserId) {
        await this.audit.record(
          {
            actorUserId: params.actorUserId,
            action: 'SERIAL.REGISTER',
            entityType: 'SerializedItem',
            entityId: device.id,
            after: { imei1, itemId: item.id, acquisitionCost: cost.to2dp(), warrantyMonths },
          },
          db,
        );
      }
      return device;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `serial-register:${imei1}` });
  }

  async attachToSale(params: AttachToSaleParams, outerTx?: Prisma.TransactionClient): Promise<SerializedItem> {
    assertNonEmpty(params.saleDocumentId, 'saleDocumentId');

    const run = async (db: Prisma.TransactionClient): Promise<SerializedItem> => {
      const device = await this.requireSerial(params.serialId, db);
      if (device.currentStatus !== SERIAL_STATUS.IN_STOCK && device.currentStatus !== SERIAL_STATUS.RESERVED) {
        throw new ConflictError(
          `Device ${device.imei1} cannot be sold from status ${device.currentStatus} (must be IN_STOCK or RESERVED).`,
          { serialId: device.id, status: device.currentStatus },
        );
      }
      return this.applyTransition(
        db,
        device,
        SERIAL_STATUS.SOLD,
        LIFECYCLE_EVENT.SALE_OUT,
        'SALE',
        params.saleDocumentId,
        `Sold via ${params.saleDocumentId}.`,
        params.actorUserId,
        'SERIAL.SALE',
      );
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `serial-sale:${params.serialId}` });
  }

  async restockFromReturn(
    params: RestockFromReturnParams,
    outerTx?: Prisma.TransactionClient,
  ): Promise<SerializedItem> {
    assertNonEmpty(params.returnDocumentId, 'returnDocumentId');
    if (params.condition !== 'RESTOCKED_INVENTORY' && params.condition !== 'DEFECTIVE_QUARANTINE') {
      throw new ValidationError(
        'SerializedInventoryService.restockFromReturn: condition must be RESTOCKED_INVENTORY or DEFECTIVE_QUARANTINE.',
      );
    }

    const run = async (db: Prisma.TransactionClient): Promise<SerializedItem> => {
      let device = await this.requireSerial(params.serialId, db);
      if (device.currentStatus !== SERIAL_STATUS.SOLD && device.currentStatus !== SERIAL_STATUS.RETURNED) {
        throw new ConflictError(
          `Cannot restock return for device ${device.imei1} in status ${device.currentStatus} (must be SOLD or RETURNED).`,
          { serialId: device.id, status: device.currentStatus },
        );
      }
      const target =
        params.condition === 'RESTOCKED_INVENTORY' ? SERIAL_STATUS.IN_STOCK : SERIAL_STATUS.DEFECTIVE;
      const returnEvent =
        params.condition === 'RESTOCKED_INVENTORY'
          ? LIFECYCLE_EVENT.RETURN_RESTOCK
          : LIFECYCLE_EVENT.DEFECT_QUARANTINE;

      let returnEventConsumed = false;
      if (device.currentStatus === SERIAL_STATUS.SOLD) {
        device = await this.applyTransition(
          db,
          device,
          SERIAL_STATUS.RETURNED,
          returnEvent,
          'RETURN',
          params.returnDocumentId,
          `Return ${params.returnDocumentId} received — pending inspection.`,
        );
        returnEventConsumed = true;
      }
      return this.applyTransition(
        db,
        device,
        target,
        returnEventConsumed ? LIFECYCLE_EVENT.STATUS_CHANGE : returnEvent,
        'RETURN',
        params.returnDocumentId,
        returnEventConsumed
          ? `Inspected after return ${params.returnDocumentId} — moved to ${target}.`
          : `Return ${params.returnDocumentId} resolved to ${target}.`,
        params.actorUserId,
        'SERIAL.RESTOCK',
      );
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `serial-restock:${params.serialId}` });
  }

  async transitionStatus(
    params: TransitionStatusParams,
    outerTx?: Prisma.TransactionClient,
  ): Promise<SerializedItem> {
    const run = async (db: Prisma.TransactionClient): Promise<SerializedItem> => {
      const device = await this.requireSerial(params.serialId, db);
      return this.applyTransition(
        db,
        device,
        params.toStatus,
        params.eventType,
        params.referenceType,
        params.referenceId,
        params.description,
        params.actorUserId,
      );
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `serial-transition:${params.serialId}` });
  }

  /** Specific-identification cost for double-entry COGS posting. */
  async getAcquisitionCost(serialId: string, tx?: Prisma.TransactionClient): Promise<Money> {
    const device = await this.requireSerial(serialId, this.db(tx));
    return Money.from(device.acquisitionCost);
  }

  async lookupByImei(imei: string, tx?: Prisma.TransactionClient): Promise<SerialWithHistory> {
    if (!imei || imei.trim().length === 0) {
      throw new ValidationError('SerializedInventoryService.lookupByImei: imei must be a non-empty string.');
    }
    const normalized = imei.trim().replace(/[\s-]+/g, '');
    const db = this.db(tx);
    const device = await db.serializedItem.findFirst({
      where: { OR: [{ imei1: normalized }, { imei2: normalized }] },
      include: {
        item: true,
        lifecycleEvents: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!device) {
      throw new NotFoundError(`No device registered with serial "${imei}".`, { imei });
    }
    return {
      ...device,
      isUnderWarranty: device.warrantyEndsAt !== null && device.warrantyEndsAt.getTime() > Date.now(),
    };
  }
}
