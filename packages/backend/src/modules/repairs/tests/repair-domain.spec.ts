import { DocumentNumberService } from '../../../core/document-number.service';
import { AuditService } from '../../../core/audit.service';
import { TransactionOrchestrator } from '../../../core/transaction-orchestrator';
import { PartiesService } from '../../../parties/parties.service';
import { RepairDomainService } from '../repair-domain.service';
import { RepairFsmService, REPAIR_TRANSITIONS } from '../repair-fsm.service';
import {
  InvalidRepairPricingError,
  InvalidRepairStateTransitionError,
  RepairOrderClosedError,
  RepairOrderNotFoundError,
} from '../repairs.errors';
import type { PrismaService } from '../../../prisma/prisma.service';

/* ------------------------------------------------------------------ */
/* In-memory Prisma fake — the suite never touches a real database.    */
/* ------------------------------------------------------------------ */

function setup() {
  const parties = new Map<string, any>();
  const orders = new Map<string, any>();
  const parts: any[] = [];
  const auditRows: any[] = [];
  const seqLast = new Map<string, number>();
  let partySeq = 0;

  const party = {
    create: jest.fn(async ({ data }: any) => {
      partySeq += 1;
      const row = { id: `party-${partySeq}`, phone: null, address: null, creditLimit: '0.00', isActive: true, ...data };
      parties.set(row.id, row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }: any) => parties.get(where.id) ?? null),
    findMany: jest.fn(async () => [...parties.values()]),
    update: jest.fn(async ({ where, data }: any) => {
      const row = parties.get(where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    }),
  };

  const repairOrder = {
    create: jest.fn(async ({ data }: any) => {
      const row = {
        id: `ro-${orders.size + 1}`,
        serialOrImei: null,
        diagnosisNotes: null,
        technicianNotes: null,
        status: 'RECEIVED',
        assignedTechnicianId: null,
        estimatedCost: '0.00',
        laborPrice: '0.00',
        partsPriceTotal: '0.00',
        discountAmount: '0.00',
        totalAmount: '0.00',
        paidAmount: '0.00',
        outstandingAmount: '0.00',
        businessDocumentId: null,
        receivedAt: new Date(),
        readyAt: null,
        deliveredAt: null,
        cancelledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      orders.set(row.id, row);
      return row;
    }),
    findUnique: jest.fn(async ({ where, include }: any) => {
      const row = orders.get(where.id) ?? null;
      if (!row) return null;
      if (!include) return row;
      const out: any = { ...row };
      if (include.parts) out.parts = parts.filter((p) => p.repairOrderId === row.id);
      if (include.party) out.party = parties.get(row.partyId) ?? null;
      return out;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = orders.get(where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    }),
  };

  const repairOrderPart = {
    findMany: jest.fn(async ({ where }: any = {}) => {
      let rows = [...parts];
      if (where?.repairOrderId) rows = rows.filter((p) => p.repairOrderId === where.repairOrderId);
      if (where?.status && typeof where.status === 'string') rows = rows.filter((p) => p.status === where.status);
      if (where?.status?.not) rows = rows.filter((p) => p.status !== where.status.not);
      return rows;
    }),
  };

  const documentSequence = {
    upsert: jest.fn(async ({ where, update, create }: any) => {
      const current: number | undefined = seqLast.get(where.prefix);
      if (current === undefined) {
        seqLast.set(create.prefix, create.lastNumber);
        return { prefix: create.prefix, lastNumber: create.lastNumber, updatedAt: new Date() };
      }
      const next: number = current + (update.lastNumber?.increment ?? 1);
      seqLast.set(where.prefix, next);
      return { prefix: where.prefix, lastNumber: next, updatedAt: new Date() };
    }),
  };

  const auditLog = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `audit-${auditRows.length + 1}`, createdAt: new Date(), ...data };
      auditRows.push(row);
      return row;
    }),
  };

  const prisma: any = { party, repairOrder, repairOrderPart, documentSequence, auditLog };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  const db = prisma as unknown as PrismaService;

  const orchestrator = new TransactionOrchestrator(db);
  const audit = new AuditService(db);
  const partiesSvc = new PartiesService(db, orchestrator, audit);
  const sequences = new DocumentNumberService(db);
  const fsm = new RepairFsmService();
  const repairs = new RepairDomainService(db, orchestrator, sequences, audit, partiesSvc, fsm);

  const seedCustomer = async (name = 'Karim', type = 'CUSTOMER') =>
    partiesSvc.createParty({ name, type: type as 'CUSTOMER' });
  const seedPart = (repairOrderId: string, totalPrice: string, status = 'CONSUMED') => {
    const row = {
      id: `rop-${parts.length + 1}`,
      repairOrderId,
      itemId: 'ci-screen',
      quantity: 1,
      unitCost: totalPrice,
      totalCost: totalPrice,
      unitPrice: totalPrice,
      totalPrice,
      status,
      consumedAt: new Date(),
      returnedAt: null,
    };
    parts.push(row);
    return row;
  };

  return { db, partiesSvc, fsm, repairs, auditLog, orders, seedCustomer, seedPart };
}

describe('stage 6.1 repair domain (DIRECTIVE-013)', () => {
  it('intakes orders in RECEIVED with REP numbering', async () => {
    const h = setup();
    const customer = await h.seedCustomer();
    const order = await h.repairs.createRepairOrder({
      partyId: customer.id,
      deviceType: 'PHONE',
      brand: 'Samsung',
      model: 'A54',
      reportedIssue: 'No power',
      actorUserId: 'u-op',
    });
    expect(order).toMatchObject({ orderNumber: 'REP000001', status: 'RECEIVED', totalAmount: '0.00' });
    expect(h.auditLog.create).toHaveBeenCalledTimes(1);

    await expect(
      h.repairs.createRepairOrder({ partyId: 'ghost', deviceType: 'PHONE', brand: 'B', model: 'M', reportedIssue: 'X' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const supplier = await h.partiesSvc.createParty({ name: 'Supply', type: 'SUPPLIER' });
    await expect(
      h.repairs.createRepairOrder({ partyId: supplier.id, deviceType: 'PHONE', brand: 'B', model: 'M', reportedIssue: 'X' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      h.repairs.createRepairOrder({ partyId: customer.id, deviceType: 'PHONE', brand: 'B', model: 'M', reportedIssue: '  ' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('walks the full lifecycle RECEIVED → READY with exact money', async () => {
    const h = setup();
    const customer = await h.seedCustomer();
    const created = await h.repairs.createRepairOrder({
      partyId: customer.id, deviceType: 'PHONE', brand: 'Xiaomi', model: 'Note 13', reportedIssue: 'Cracked screen',
    });
    const diagnosed = await h.repairs.diagnoseOrder(created.id, 'Display assembly broken', 'Bench 2');
    expect(diagnosed.status).toBe('DIAGNOSING');
    expect(diagnosed.diagnosisNotes).toBe('Display assembly broken');

    h.seedPart(created.id, '50.00');
    const quoted = await h.repairs.quoteOrder(created.id, '150.00', '210.00');
    expect(quoted).toMatchObject({
      status: 'QUOTED', laborPrice: '150.00', estimatedCost: '210.00',
      partsPriceTotal: '50.00', totalAmount: '200.00', outstandingAmount: '200.00',
    });

    const approved = await h.repairs.approveOrder(created.id);
    expect(approved.status).toBe('APPROVED');
    const inRepair = await h.repairs.startRepair(created.id, 'tech-7');
    expect(inRepair).toMatchObject({ status: 'IN_REPAIR', assignedTechnicianId: 'tech-7' });
    const ready = await h.repairs.markReady(created.id);
    expect(ready.status).toBe('READY');
    expect(ready.readyAt).toBeInstanceOf(Date);

    const full = await h.repairs.getRepairOrder(created.id);
    expect(full.party.id).toBe(customer.id);
    expect(full.parts).toHaveLength(1);
    expect(full.orderNumber).toBe('REP000001');
  });

  it('rejects empty quotations with InvalidRepairPricingError', async () => {
    const h = setup();
    const customer = await h.seedCustomer();
    const created = await h.repairs.createRepairOrder({
      partyId: customer.id, deviceType: 'PHONE', brand: 'B', model: 'M', reportedIssue: 'X',
    });
    await h.repairs.diagnoseOrder(created.id, 'Looks fine');
    await expect(h.repairs.quoteOrder(created.id, '0.00', '0.00')).rejects.toBeInstanceOf(InvalidRepairPricingError);
    await expect(h.repairs.quoteOrder(created.id, '-10.00', '0.00')).rejects.toBeInstanceOf(InvalidRepairPricingError);
    // Order is still DIAGNOSING after the failed quotes.
    expect((await h.repairs.getRepairOrder(created.id)).status).toBe('DIAGNOSING');
  });

  it('rejects illegal jumps with InvalidRepairStateTransitionError', async () => {
    const h = setup();
    const customer = await h.seedCustomer();
    const created = await h.repairs.createRepairOrder({
      partyId: customer.id, deviceType: 'PHONE', brand: 'B', model: 'M', reportedIssue: 'X',
    });
    // RECEIVED → READY skips the whole pipeline.
    await expect(h.repairs.markReady(created.id)).rejects.toBeInstanceOf(InvalidRepairStateTransitionError);
    await h.repairs.diagnoseOrder(created.id, 'Issue confirmed');
    // Re-diagnosis is not a transition either (strict, no self-loops).
    await expect(h.repairs.diagnoseOrder(created.id, 'Again')).rejects.toBeInstanceOf(InvalidRepairStateTransitionError);
    // Pure FSM checks.
    expect(h.fsm.canTransition('RECEIVED', 'DELIVERED')).toBe(false);
    expect(h.fsm.canTransition('QUOTED', 'APPROVED')).toBe(true);
    expect(REPAIR_TRANSITIONS.READY).toEqual(['DELIVERED', 'CANCELLED']);
  });

  it('locks terminal CANCELLED and DELIVERED states', async () => {
    const h = setup();
    expect(h.fsm.isTerminal('CANCELLED')).toBe(true);
    expect(h.fsm.isTerminal('DELIVERED')).toBe(true);
    expect(h.fsm.isTerminal('READY')).toBe(false);
    // Seeded terminal order: any mutation attempt reports CLOSED.
    h.orders.set('ro-cancelled', {
      id: 'ro-cancelled', orderNumber: 'REP000099', partyId: 'p', status: 'CANCELLED',
      laborPrice: '0.00', partsPriceTotal: '0.00', discountAmount: '0.00',
      totalAmount: '0.00', paidAmount: '0.00', outstandingAmount: '0.00',
    });
    await expect(h.repairs.diagnoseOrder('ro-cancelled', 'Late notes')).rejects.toBeInstanceOf(RepairOrderClosedError);
    await expect(h.repairs.approveOrder('ro-cancelled')).rejects.toBeInstanceOf(RepairOrderClosedError);
    // FSM-level terminal lock (no outbound edges at all).
    expect(() => h.fsm.assertTransition('CANCELLED', 'RECEIVED')).toThrow(InvalidRepairStateTransitionError);
    expect(() => h.fsm.assertTransition('DELIVERED', 'IN_REPAIR')).toThrow(InvalidRepairStateTransitionError);
  });

  it('resolves orders with parts and party, or throws RepairOrderNotFoundError', async () => {
    const h = setup();
    const customer = await h.seedCustomer('Amine');
    const created = await h.repairs.createRepairOrder({
      partyId: customer.id, deviceType: 'TABLET', brand: 'Lenovo', model: 'Tab', reportedIssue: 'Battery',
    });
    h.seedPart(created.id, '30.00');
    const full = await h.repairs.getRepairOrder(created.id);
    expect(full.party.name).toBe('Amine');
    expect(full.parts.map((p) => p.totalPrice)).toEqual(['30.00']);
    await expect(h.repairs.getRepairOrder('ghost')).rejects.toBeInstanceOf(RepairOrderNotFoundError);
    await expect(h.repairs.getRepairOrder('ghost')).rejects.toMatchObject({ code: 'REPAIR_ORDER_NOT_FOUND' });
  });
});
