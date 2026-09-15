import {
  LIFECYCLE_EVENT,
  SERIAL_STATUS,
  SerializedInventoryService,
  VALID_TRANSITIONS,
  validateImeiOrSerial,
} from '../serialized-inventory.service';
import { Money } from '../../core/money';
import { AuditService } from '../../core/audit.service';
import { TransactionOrchestrator } from '../../core/transaction-orchestrator';
import type { PrismaService } from '../../prisma/prisma.service';

// A known-good Luhn example: 490154203237518 (check digit 8).
const VALID_IMEI = '490154203237518';

/* ------------------------------------------------------------------ */
/* In-memory Prisma fake — the suite never touches a real database.    */
/* ------------------------------------------------------------------ */

function setup() {
  const items = new Map<string, any>();
  const devices = new Map<string, any>();
  const events: any[] = [];
  const auditRows: any[] = [];
  let clock = Date.now();

  const catalogItem = {
    findUnique: jest.fn(async ({ where }: any) => items.get(where.id) ?? null),
  };

  const serializedItem = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `si-${devices.size + 1}`, imei2: null, warrantyEndsAt: null, ...data };
      devices.set(row.id, row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }: any) => devices.get(where.id) ?? null),
    findFirst: jest.fn(async ({ where, include }: any) => {
      const ors: any[] = where?.OR ?? [];
      const match = (d: any): boolean =>
        ors.some((cond: any) => {
          if (cond.imei1 !== undefined) return d.imei1 === cond.imei1;
          if (cond.imei2 !== undefined) return d.imei2 === cond.imei2;
          return false;
        });
      const row = [...devices.values()].find(match) ?? null;
      if (!row || !include) return row;
      return {
        ...row,
        item: items.get(row.itemId) ?? null,
        lifecycleEvents: events.filter((e) => e.serialId === row.id),
      };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = devices.get(where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    }),
  };

  const serializedLifecycleEvent = {
    create: jest.fn(async ({ data }: any) => {
      clock += 1;
      const row = { id: `sle-${events.length + 1}`, createdAt: new Date(clock), ...data };
      events.push(row);
      return row;
    }),
  };

  const auditLog = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `audit-${auditRows.length + 1}`, createdAt: new Date(), ...data };
      auditRows.push(row);
      return row;
    }),
  };

  const prisma: any = { catalogItem, serializedItem, serializedLifecycleEvent, auditLog };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  const db = prisma as unknown as PrismaService;

  const svc = new SerializedInventoryService(db, new TransactionOrchestrator(db), new AuditService(db));

  const seedItem = (overrides: any = {}) => {
    const row = {
      id: `ci-${items.size + 1}`,
      sku: 'PHONE-X',
      name: 'Phone X',
      category: 'DEVICE',
      costPrice: '0.00',
      isSerialized: true,
      isActive: true,
      ...overrides,
    };
    items.set(row.id, row);
    return row;
  };

  return { db, svc, items, devices, events, auditLog, seedItem };
}

describe('stage 3.2 serialized inventory (TASK BRIEF-012)', () => {
  describe('IMEI validation', () => {
    it('accepts a valid 15-digit IMEI and canonicalizes input', () => {
      expect(validateImeiOrSerial(VALID_IMEI)).toEqual({ kind: 'IMEI', normalized: VALID_IMEI });
      expect(validateImeiOrSerial(' 4901-5420-3237-518 ').normalized).toBe(VALID_IMEI);
    });

    it('rejects bad checksums, short codes and garbage', () => {
      expect(() => validateImeiOrSerial('490154203237519')).toThrow(/checksum/);
      expect(() => validateImeiOrSerial('')).toThrow(/15-digit IMEI/);
      expect(() => validateImeiOrSerial('ABC')).toThrow(/15-digit IMEI/);
      expect(() => validateImeiOrSerial('!!bad!!')).toThrow(/15-digit IMEI/);
    });

    it('accepts 8–20 char alphanumeric serials', () => {
      expect(validateImeiOrSerial('SN12345678')).toEqual({ kind: 'SERIAL', normalized: 'SN12345678' });
      expect(() => validateImeiOrSerial('SN1234')).toThrow(/15-digit IMEI/);
    });
  });

  describe('registration', () => {
    it('registers IN_STOCK with cost, warranty and PURCHASE_IN event', async () => {
      const h = setup();
      const item = h.seedItem();
      const before = Date.now();
      const device = await h.svc.registerSerial({
        imei1: VALID_IMEI,
        itemId: item.id,
        acquisitionCost: '299.99',
        referenceId: 'po-1',
        actorUserId: 'u-admin',
      });
      expect(device).toMatchObject({ imei1: VALID_IMEI, currentStatus: 'IN_STOCK', acquisitionCost: '299.99', warrantyMonths: 12 });
      expect(device.warrantyEndsAt?.getTime()).toBeGreaterThan(before + 360 * 86400000);
      expect(h.events).toHaveLength(1);
      expect(h.events[0]).toMatchObject({ eventType: 'PURCHASE_IN', referenceType: 'PURCHASE', referenceId: 'po-1' });
      expect(h.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('rejects duplicate IMEI with ConflictError and non-serialized items', async () => {
      const h = setup();
      const item = h.seedItem();
      await h.svc.registerSerial({ imei1: VALID_IMEI, itemId: item.id, acquisitionCost: '10.00', referenceId: 'po-1' });
      await expect(
        h.svc.registerSerial({ imei1: VALID_IMEI, itemId: item.id, acquisitionCost: '10.00', referenceId: 'po-2' }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      const bulk = h.seedItem({ id: 'ci-bulk', sku: 'BULK', isSerialized: false });
      await expect(
        h.svc.registerSerial({ imei1: 'SN87654321', itemId: bulk.id, acquisitionCost: '10.00', referenceId: 'po-3' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(
        h.svc.registerSerial({ imei1: 'SN99999999', itemId: 'missing', acquisitionCost: '10.00', referenceId: 'po-4' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('sale attachment', () => {
    it('moves IN_STOCK and RESERVED to SOLD with SALE_OUT, and blocks double sale', async () => {
      const h = setup();
      const item = h.seedItem();
      const device = await h.svc.registerSerial({ imei1: VALID_IMEI, itemId: item.id, acquisitionCost: '100.00', referenceId: 'po-1' });
      const sold = await h.svc.attachToSale({ serialId: device.id, saleDocumentId: 'inv-1', actorUserId: 'u-op' });
      expect(sold.currentStatus).toBe('SOLD');
      expect(h.events[h.events.length - 1]).toMatchObject({ eventType: 'SALE_OUT', referenceType: 'SALE', referenceId: 'inv-1' });
      await expect(h.svc.attachToSale({ serialId: device.id, saleDocumentId: 'inv-2' })).rejects.toMatchObject({
        code: 'CONFLICT',
      });

      const reserved = await h.svc.registerSerial({ imei1: 'SN11223344', itemId: item.id, acquisitionCost: '50.00', referenceId: 'po-2' });
      await h.svc.transitionStatus({
        serialId: reserved.id,
        toStatus: 'RESERVED',
        eventType: 'STATUS_CHANGE',
        referenceType: 'SALE',
        referenceId: 'hold-1',
        description: 'Customer hold.',
      });
      const soldReserved = await h.svc.attachToSale({ serialId: reserved.id, saleDocumentId: 'inv-3' });
      expect(soldReserved.currentStatus).toBe('SOLD');
    });
  });

  describe('return restock (v2.9.2 gap)', () => {
    it('resolves SOLD to IN_STOCK with a RETURN_RESTOCK trail', async () => {
      const h = setup();
      const item = h.seedItem();
      const device = await h.svc.registerSerial({ imei1: VALID_IMEI, itemId: item.id, acquisitionCost: '100.00', referenceId: 'po-1' });
      await h.svc.attachToSale({ serialId: device.id, saleDocumentId: 'inv-1' });
      const restocked = await h.svc.restockFromReturn({
        serialId: device.id,
        returnDocumentId: 'ret-1',
        condition: 'RESTOCKED_INVENTORY',
        actorUserId: 'u-admin',
      });
      expect(restocked.currentStatus).toBe('IN_STOCK');
      const types = h.events.map((e) => e.eventType);
      expect(types).toEqual(['PURCHASE_IN', 'SALE_OUT', 'RETURN_RESTOCK', 'STATUS_CHANGE']);
    });

    it('quarantines to DEFECTIVE on DEFECTIVE_QUARANTINE', async () => {
      const h = setup();
      const item = h.seedItem();
      const device = await h.svc.registerSerial({ imei1: VALID_IMEI, itemId: item.id, acquisitionCost: '100.00', referenceId: 'po-1' });
      await h.svc.attachToSale({ serialId: device.id, saleDocumentId: 'inv-1' });
      const quarantined = await h.svc.restockFromReturn({
        serialId: device.id,
        returnDocumentId: 'ret-2',
        condition: 'DEFECTIVE_QUARANTINE',
      });
      expect(quarantined.currentStatus).toBe('DEFECTIVE');
      expect(h.events[h.events.length - 2]).toMatchObject({ eventType: 'DEFECT_QUARANTINE' });
    });

    it('refuses restock from non-returnable states', async () => {
      const h = setup();
      const item = h.seedItem();
      const device = await h.svc.registerSerial({ imei1: VALID_IMEI, itemId: item.id, acquisitionCost: '100.00', referenceId: 'po-1' });
      await expect(
        h.svc.restockFromReturn({ serialId: device.id, returnDocumentId: 'ret-x', condition: 'RESTOCKED_INVENTORY' }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });

  describe('FSM enforcement', () => {
    it('rejects illegal edges and terminal SALVAGED with ConflictError', async () => {
      const h = setup();
      const item = h.seedItem();
      const device = await h.svc.registerSerial({ imei1: VALID_IMEI, itemId: item.id, acquisitionCost: '100.00', referenceId: 'po-1' });
      await h.svc.attachToSale({ serialId: device.id, saleDocumentId: 'inv-1' });
      // SOLD has no direct IN_STOCK edge.
      await expect(
        h.svc.transitionStatus({
          serialId: device.id,
          toStatus: 'IN_STOCK',
          eventType: 'STATUS_CHANGE',
          referenceType: 'X',
          referenceId: 'x-1',
          description: 'Shortcut.',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      await h.svc.transitionStatus({
        serialId: device.id,
        toStatus: 'RETURNED',
        eventType: 'STATUS_CHANGE',
        referenceType: 'X',
        referenceId: 'x-2',
        description: 'Received.',
      });
      await h.svc.transitionStatus({
        serialId: device.id,
        toStatus: 'SALVAGED',
        eventType: 'SALVAGE_DECOMMISSION',
        referenceType: 'X',
        referenceId: 'x-3',
        description: 'Scrapped.',
      });
      await expect(
        h.svc.transitionStatus({
          serialId: device.id,
          toStatus: 'IN_STOCK',
          eventType: 'STATUS_CHANGE',
          referenceType: 'X',
          referenceId: 'x-4',
          description: 'Back from dead.',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(
        h.svc.transitionStatus({
          serialId: device.id,
          toStatus: 'NOPE',
          eventType: 'STATUS_CHANGE',
          referenceType: 'X',
          referenceId: 'x-5',
          description: 'Bad.',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('exposes the mandated transition table', () => {
      expect(VALID_TRANSITIONS.IN_STOCK).toEqual(['RESERVED', 'SOLD', 'UNDER_REPAIR', 'DEFECTIVE', 'SALVAGED']);
      expect(VALID_TRANSITIONS.SALVAGED).toEqual([]);
      expect(SERIAL_STATUS.SOLD).toBe('SOLD');
      expect(LIFECYCLE_EVENT.SALE_OUT).toBe('SALE_OUT');
    });
  });

  describe('cost and lookup', () => {
    it('returns the specific acquisition cost as Money', async () => {
      const h = setup();
      const item = h.seedItem();
      const device = await h.svc.registerSerial({ imei1: VALID_IMEI, itemId: item.id, acquisitionCost: '299.99', referenceId: 'po-1' });
      const cost = await h.svc.getAcquisitionCost(device.id);
      expect(cost).toBeInstanceOf(Money);
      expect(cost.to2dp()).toBe('299.99');
    });

    it('looks up by either IMEI with ordered history and warranty state', async () => {
      const h = setup();
      const item = h.seedItem();
      const device = await h.svc.registerSerial({
        imei1: VALID_IMEI,
        imei2: 'SN55667788',
        itemId: item.id,
        acquisitionCost: '100.00',
        referenceId: 'po-1',
      });
      await h.svc.attachToSale({ serialId: device.id, saleDocumentId: 'inv-1' });

      const byImei1 = await h.svc.lookupByImei(VALID_IMEI);
      expect(byImei1.item.sku).toBe('PHONE-X');
      expect(byImei1.lifecycleEvents.map((e) => e.eventType)).toEqual(['PURCHASE_IN', 'SALE_OUT']);
      expect(byImei1.isUnderWarranty).toBe(true);

      const byImei2 = await h.svc.lookupByImei('SN55667788');
      expect(byImei2.id).toBe(device.id);

      const noWarranty = await h.svc.registerSerial({
        imei1: 'SN00001111',
        itemId: item.id,
        acquisitionCost: '10.00',
        warrantyMonths: 0,
        referenceId: 'po-2',
      });
      expect((await h.svc.lookupByImei('SN00001111')).isUnderWarranty).toBe(false);
      expect(noWarranty.warrantyEndsAt).not.toBeNull();

      await expect(h.svc.lookupByImei('SN00000000')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
