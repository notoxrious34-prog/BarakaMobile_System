import { ChartOfAccountsService } from '../../../accounting/chart-of-accounts.service';
import { FiscalPeriodService } from '../../../accounting/fiscal-period.service';
import { DocumentNumberService } from '../../../core/document-number.service';
import { AuditService } from '../../../core/audit.service';
import { TransactionOrchestrator } from '../../../core/transaction-orchestrator';
import { PostingService } from '../../../accounting/posting.service';
import { PartiesService } from '../../../parties/parties.service';
import { PartySubledgerService } from '../../../parties/party-subledger.service';
import { InventoryDomainService } from '../../../inventory/inventory-domain.service';
import { RepairDomainService } from '../repair-domain.service';
import { RepairFsmService } from '../repair-fsm.service';
import { RepairOrchestratorService } from '../repair-orchestrator.service';
import {
  InvalidRepairStateTransitionError,
  RepairOrderClosedError,
} from '../repairs.errors';
import type { PrismaService } from '../../../prisma/prisma.service';

/* ------------------------------------------------------------------ */
/* Full-stack fake with snapshot-rollback transactions (see Stage 5.1).*/
/* ------------------------------------------------------------------ */

function setup() {
  const coaRows = new Map<string, any>();
  const periodsById = new Map<string, any>();
  const periodsByName = new Map<string, any>();
  const entries = new Map<string, any>();
  const lines = new Map<string, any>();
  const parties = new Map<string, any>();
  const subledgers: any[] = [];
  const documents = new Map<string, any>();
  const docLines = new Map<string, any>();
  const payments = new Map<string, any>();
  const items = new Map<string, any>();
  const movements: any[] = [];
  const orders = new Map<string, any>();
  const parts: any[] = [];
  const events: any[] = [];
  const auditRows: any[] = [];
  const seqLast = new Map<string, number>();
  let seq = 0;
  let fpSeq = 0;
  let partySeq = 0;
  let subSeq = 0;
  let docSeq = 0;
  let clock = Date.now();
  const tick = (): Date => new Date((clock += 1));

  const chartOfAccount = {
    upsert: jest.fn(async ({ create, update }: any) => {
      const merged = { isControl: false, isActive: true, ...coaRows.get(create.accountCode), ...create, ...update };
      coaRows.set(create.accountCode, merged);
      return merged;
    }),
    findUnique: jest.fn(async ({ where }: any) => coaRows.get(where.accountCode) ?? null),
    findMany: jest.fn(async () => [...coaRows.values()]),
  };

  const fiscalPeriod = {
    findUnique: jest.fn(async ({ where }: any) => {
      if (where.id) return periodsById.get(where.id) ?? null;
      if (where.periodName) return periodsByName.get(where.periodName) ?? null;
      return null;
    }),
    create: jest.fn(async ({ data }: any) => {
      fpSeq += 1;
      const row = { id: `fp-${fpSeq}`, status: 'OPEN', closedAt: null, ...data };
      periodsById.set(row.id, row);
      periodsByName.set(row.periodName, row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = periodsById.get(where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
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

  const journalEntry = {
    create: jest.fn(async ({ data, include }: any) => {
      seq += 1;
      const entry: any = {
        id: `je-${seq}`,
        entryNumber: data.entryNumber,
        postingDate: data.postingDate ?? new Date(),
        documentType: data.documentType,
        documentId: data.documentId ?? null,
        description: data.description,
        status: data.status ?? 'POSTED',
        reversalOfId: data.reversalOfId ?? null,
        fiscalPeriodId: data.fiscalPeriodId,
        createdByUserId: data.createdByUserId ?? null,
        createdAt: new Date(),
      };
      const nested = (data.lines?.create ?? []).map((l: any, index: number) => ({
        id: `jel-${seq}-${index}`,
        journalEntryId: entry.id,
        accountCode: l.accountCode,
        debit: l.debit ?? '0.00',
        credit: l.credit ?? '0.00',
        memo: l.memo ?? null,
        partyId: l.partyId ?? null,
      }));
      entries.set(entry.id, entry);
      for (const line of nested) lines.set(line.id, line);
      if (include?.lines) return { ...entry, lines: nested };
      return entry;
    }),
    findUnique: jest.fn(async ({ where }: any) => entries.get(where.id) ?? null),
    findMany: jest.fn(async () => [...entries.values()]),
    update: jest.fn(async ({ where, data }: any) => {
      const entry = entries.get(where.id);
      if (!entry) throw new Error('not found');
      Object.assign(entry, data);
      return entry;
    }),
    count: jest.fn(async () => entries.size),
  };

  const journalEntryLine = {
    findMany: jest.fn(async ({ where, include }: any = {}) => {
      let rows = [...lines.values()];
      const je = where?.journalEntry;
      if (je) {
        rows = rows.filter((l) => {
          const entry = entries.get(l.journalEntryId);
          if (!entry) return false;
          if (je.status && entry.status !== je.status) return false;
          if (je.postingDate?.lte && entry.postingDate > je.postingDate.lte) return false;
          return true;
        });
      }
      if (include?.account) return rows.map((l) => ({ ...l, account: coaRows.get(l.accountCode) }));
      return rows;
    }),
    count: jest.fn(async () => lines.size),
  };

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

  const partySubledgerEntry = {
    create: jest.fn(async ({ data }: any) => {
      subSeq += 1;
      const row = { id: `sub-${subSeq}`, createdAt: tick(), ...data };
      subledgers.push(row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }: any) => {
      if (where.id) return subledgers.find((s) => s.id === where.id) ?? null;
      if (where.journalLineId) return subledgers.find((s) => s.journalLineId === where.journalLineId) ?? null;
      return null;
    }),
    findFirst: jest.fn(async ({ where }: any) => {
      const rows = subledgers.filter((s) => s.partyId === where.partyId);
      rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return rows[0] ?? null;
    }),
    findMany: jest.fn(async () => [...subledgers]),
  };

  const catalogItem = {
    findUnique: jest.fn(async ({ where }: any) => items.get(where.id) ?? null),
    update: jest.fn(async ({ where, data }: any) => {
      const row = items.get(where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    }),
  };

  const inventoryMovement = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `im-${movements.length + 1}`, createdAt: tick(), ...data };
      movements.push(row);
      return row;
    }),
    findFirst: jest.fn(async ({ where }: any) => {
      const rows = movements.filter((m) => m.itemId === where.itemId);
      rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return rows[0] ?? null;
    }),
  };

  const repairOrder = {
    create: jest.fn(async ({ data }: any) => {
      const row = {
        id: `ro-${orders.size + 1}`,
        serialOrImei: null, diagnosisNotes: null, technicianNotes: null,
        status: 'RECEIVED', assignedTechnicianId: null,
        estimatedCost: '0.00', laborPrice: '0.00', partsPriceTotal: '0.00',
        discountAmount: '0.00', totalAmount: '0.00', paidAmount: '0.00', outstandingAmount: '0.00',
        businessDocumentId: null, receivedAt: new Date(), readyAt: null,
        deliveredAt: null, cancelledAt: null, createdAt: new Date(), updatedAt: new Date(),
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
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `rop-${parts.length + 1}`, status: 'CONSUMED', consumedAt: new Date(), returnedAt: null, ...data };
      parts.push(row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }: any) => parts.find((p) => p.id === where.id) ?? null),
    findMany: jest.fn(async ({ where }: any = {}) => {
      let rows = [...parts];
      if (where?.repairOrderId) rows = rows.filter((p) => p.repairOrderId === where.repairOrderId);
      if (where?.status && typeof where.status === 'string') rows = rows.filter((p) => p.status === where.status);
      if (where?.status?.not) rows = rows.filter((p) => p.status !== where.status.not);
      return rows;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = parts.find((p) => p.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    }),
  };

  const businessDocument = {
    create: jest.fn(async ({ data, include }: any) => {
      const n = documents.size + 1;
      const doc: any = {
        id: `doc-${n}`,
        documentNumber: data.documentNumber,
        type: data.type,
        partyId: data.partyId ?? null,
        status: data.status ?? 'POSTED',
        subtotalAmount: data.subtotalAmount,
        discountAmount: data.discountAmount,
        totalAmount: data.totalAmount,
        paidAmount: data.paidAmount,
        outstandingAmount: data.outstandingAmount,
        reversalDocumentId: data.reversalDocumentId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const docLineRows = (data.lines?.create ?? []).map((l: any, index: number) => ({
        id: `dl-${n}-${index}`,
        documentId: doc.id,
        itemId: l.itemId,
        serialId: l.serialId ?? null,
        quantity: l.quantity,
        unitCost: l.unitCost,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
      }));
      const paymentRows = (data.payments?.create ?? []).map((p: any, index: number) => ({
        id: `pa-${n}-${index}`,
        documentId: doc.id,
        repairOrderId: p.repairOrderId ?? null,
        paymentMethod: p.paymentMethod,
        amount: p.amount,
        walletId: p.walletId ?? null,
        createdAt: new Date(),
      }));
      documents.set(doc.id, doc);
      const out: any = { ...doc };
      if (include?.lines) {
        const lineRows = docLineRows.map((l: any) => ({ ...l }));
        for (const l of lineRows) {
          const key = `${l.documentId}:${l.id}`;
          (businessDocument as any).lineStore.set(key, l);
        }
        out.lines = lineRows;
      }
      if (include?.payments) {
        const payRows = paymentRows.map((p: any) => ({ ...p }));
        for (const p of payRows) {
          const key = `${p.documentId}:${p.id}`;
          (businessDocument as any).payStore.set(key, p);
        }
        out.payments = payRows;
      }
      return out;
    }),
  };
  (businessDocument as any).lineStore = new Map<string, any>();
  (businessDocument as any).payStore = new Map<string, any>();

  const auditLog = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `audit-${auditRows.length + 1}`, createdAt: new Date(), ...data };
      auditRows.push(row);
      return row;
    }),
  };

  const prisma: any = {
    chartOfAccount, fiscalPeriod, documentSequence, journalEntry, journalEntryLine,
    party, partySubledgerEntry, catalogItem, inventoryMovement,
    repairOrder, repairOrderPart, businessDocument, auditLog,
  };
  prisma.$transaction = jest.fn(async (fn: any) => {
    const snap = {
      entries: new Map(entries), lines: new Map(lines), documents: new Map(documents),
      orders: new Map([...orders].map(([k, v]) => [k, { ...v }])),
      parts: parts.map((p) => ({ ...p })),
      items: new Map([...items].map(([k, v]) => [k, { ...v }])),
      parties: new Map(parties),
      periodsById: new Map(periodsById), periodsByName: new Map(periodsByName),
      seqLast: new Map(seqLast),
      docLines: new Map((businessDocument as any).lineStore as Map<string, any>),
      payments: new Map((businessDocument as any).payStore as Map<string, any>),
      movementsLen: movements.length, subledgersLen: subledgers.length,
      eventsLen: events.length, auditLen: auditRows.length,
    };
    try {
      return await fn(prisma);
    } catch (error) {
      for (const [store, saved] of [
        [entries, snap.entries], [lines, snap.lines], [documents, snap.documents],
        [orders, snap.orders], [items, snap.items], [parties, snap.parties],
        [periodsById, snap.periodsById], [periodsByName, snap.periodsByName], [seqLast, snap.seqLast],
        [(businessDocument as any).lineStore, snap.docLines],
        [(businessDocument as any).payStore, snap.payments],
      ] as Array<[Map<string, any>, Map<string, any>]>) {
        store.clear();
        for (const [k, v] of saved) store.set(k, v);
      }
      parts.length = 0;
      for (const p of snap.parts) parts.push(p);
      movements.length = snap.movementsLen;
      subledgers.length = snap.subledgersLen;
      events.length = snap.eventsLen;
      auditRows.length = snap.auditLen;
      throw error;
    }
  });
  const db = prisma as unknown as PrismaService;

  const coa = new ChartOfAccountsService(db);
  const periods = new FiscalPeriodService(db);
  const sequences = new DocumentNumberService(db);
  const audit = new AuditService(db);
  const orchestrator = new TransactionOrchestrator(db);
  const posting = new PostingService(db, coa, periods, sequences, audit, orchestrator);
  const partiesSvc = new PartiesService(db, orchestrator, audit);
  const subledger = new PartySubledgerService(db, partiesSvc, orchestrator, audit);
  const inventory = new InventoryDomainService(db, orchestrator, audit);
  const fsm = new RepairFsmService();
  const domain = new RepairDomainService(db, orchestrator, sequences, audit, partiesSvc, fsm);
  const workshop = new RepairOrchestratorService(db, orchestrator, sequences, inventory, posting, partiesSvc, subledger, audit, fsm);

  return {
    db, coa, domain, workshop, partiesSvc,
    items, movements, orders, parts, subledgers, documents, entries, lines, events,
  };
}

async function seeded() {
  const h = setup();
  await h.coa.seedStandardAccounts();
  return h;
}

function seedScreen(h: Awaited<ReturnType<typeof seeded>>, cost = '40.00', qty = 10) {
  const row = {
    id: 'ci-screen', sku: 'SCREEN-X', name: 'Screen X', category: 'SPARE_PART',
    costPrice: cost, sellingPrice: '60.00', isSerialized: false, isActive: true,
  };
  h.items.set(row.id, row);
  h.movements.push({ id: 'im-seed', itemId: row.id, movementType: 'IN', quantity: qty, unitCost: cost, totalCost: cost, balanceAfterQty: qty, referenceType: 'OPENING_BALANCE', referenceId: 'seed', createdAt: new Date(2026, 0, 1) });
  return row;
}

/** intake → diagnose → quote(labor) → approve → start, ready for parts/work. */
async function readyOrder(h: Awaited<ReturnType<typeof seeded>>, customerId: string, labor = '150.00') {
  const created = await h.domain.createRepairOrder({
    partyId: customerId, deviceType: 'PHONE', brand: 'Xiaomi', model: 'Note 13', reportedIssue: 'Cracked screen',
  });
  await h.domain.diagnoseOrder(created.id, 'Display assembly broken');
  await h.domain.quoteOrder(created.id, labor, labor);
  await h.domain.approveOrder(created.id);
  await h.domain.startRepair(created.id, 'tech-7');
  return h.domain.getRepairOrder(created.id);
}

function legsOf(h: Awaited<ReturnType<typeof seeded>>, journalId: string): Map<string, [string, string]> {
  const map = new Map<string, [string, string]>();
  for (const l of h.lines.values()) {
    if (l.journalEntryId === journalId) map.set(l.accountCode, [l.debit, l.credit]);
  }
  return map;
}

function journalsBy(h: Awaited<ReturnType<typeof seeded>>, needle: string) {
  return [...h.entries.values()].filter((e) => e.description.includes(needle));
}

describe('stage 6.2 repair orchestrator (DIRECTIVE-014)', () => {
  it('walks intake to delivery with WIP, split payments and balanced books', async () => {
    const h = await seeded();
    const customer = await h.partiesSvc.createParty({ name: 'Karim', type: 'CUSTOMER', creditLimit: '5000.00' });
    seedScreen(h);
    const order = await readyOrder(h, customer.id);
    expect(order.orderNumber).toBe('REP000001');

    const part = await h.workshop.consumePart(order.id, 'ci-screen', 2, '60.00', 'u-tech');
    expect(part).toMatchObject({ status: 'CONSUMED', quantity: 2, unitCost: '40.00', totalCost: '80.00', unitPrice: '60.00', totalPrice: '120.00' });
    expect(h.movements[h.movements.length - 1]).toMatchObject({ movementType: 'REPAIR_WIP_CONSUME', quantity: 2, balanceAfterQty: 8 });
    const wip = journalsBy(h, 'Consume part');
    expect(wip).toHaveLength(1);
    expect(legsOf(h, wip[0].id).get('12300')).toEqual(['80.00', '0.00']);
    expect(legsOf(h, wip[0].id).get('12200')).toEqual(['0.00', '80.00']);
    expect((await h.domain.getRepairOrder(order.id)).totalAmount).toBe('270.00');

    await h.domain.markReady(order.id);
    const delivered = await h.workshop.deliverRepairOrder({
      repairOrderId: order.id,
      payments: [
        { paymentMethod: 'CASH', amount: '100.00' },
        { paymentMethod: 'DIGITAL_WALLET', amount: '50.00' },
      ],
      actorUserId: 'u-cashier',
    });
    expect(delivered.order).toMatchObject({ status: 'DELIVERED', businessDocumentId: delivered.document.id });
    expect(delivered.order.deliveredAt).toBeInstanceOf(Date);
    expect(delivered.document).toMatchObject({
      documentNumber: 'INV-000001', type: 'SALE_INVOICE', status: 'POSTED',
      subtotalAmount: '270.00', totalAmount: '270.00', paidAmount: '150.00', outstandingAmount: '120.00',
    });
    expect(delivered.document.partyId).toBe(customer.id);
    const legs = legsOf(h, delivered.journalEntryId);
    expect(legs.get('10000')).toEqual(['100.00', '0.00']);
    expect(legs.get('10100')).toEqual(['50.00', '0.00']);
    expect(legs.get('11000')).toEqual(['120.00', '0.00']);
    expect(legs.get('40200')).toEqual(['0.00', '150.00']);
    expect(legs.get('40000')).toEqual(['0.00', '120.00']);
    expect(legs.get('50100')).toEqual(['80.00', '0.00']);
    expect(legs.get('12300')).toEqual(['0.00', '80.00']);
    // Exact balance proof: ΣDr == ΣCr == 350.00.
    let dr = 0;
    let cr = 0;
    for (const [d, c] of legs.values()) {
      dr += Number(d);
      cr += Number(c);
    }
    expect(dr).toBe(350);
    expect(cr).toBe(350);
    expect((await h.partiesSvc.getPartyBalance(customer.id)).to2dp()).toBe('120.00');
    expect(delivered.journalNumber).toBe('JRN-000002');
  });

  it('returns parts before delivery: WIP credited, stock and totals restored', async () => {
    const h = await seeded();
    const customer = await h.partiesSvc.createParty({ name: 'Karim', type: 'CUSTOMER' });
    seedScreen(h);
    const order = await readyOrder(h, customer.id);
    const part = await h.workshop.consumePart(order.id, 'ci-screen', 1, '60.00');
    expect((await h.domain.getRepairOrder(order.id)).totalAmount).toBe('210.00');

    const returned = await h.workshop.returnPart(order.id, part.id, 'u-tech');
    expect(returned).toMatchObject({ status: 'RETURNED' });
    expect(returned.returnedAt).toBeInstanceOf(Date);
    expect(h.movements[h.movements.length - 1]).toMatchObject({ movementType: 'REPAIR_WIP_RETURN', balanceAfterQty: 10 });
    const reversal = journalsBy(h, 'Return part');
    expect(reversal).toHaveLength(1);
    expect(legsOf(h, reversal[0].id).get('12200')).toEqual(['40.00', '0.00']);
    expect(legsOf(h, reversal[0].id).get('12300')).toEqual(['0.00', '40.00']);
    expect((await h.domain.getRepairOrder(order.id)).totalAmount).toBe('150.00');
    await expect(h.workshop.returnPart(order.id, part.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('cancels with consumed parts: single WIP flush, stock restored, terminal lock', async () => {
    const h = await seeded();
    const customer = await h.partiesSvc.createParty({ name: 'Karim', type: 'CUSTOMER' });
    seedScreen(h);
    const order = await readyOrder(h, customer.id);
    await h.workshop.consumePart(order.id, 'ci-screen', 1, '60.00');
    await h.workshop.consumePart(order.id, 'ci-screen', 2, '60.00');

    const cancelled = await h.workshop.cancelRepairOrder(order.id, 'Customer changed mind', 'u-op');
    expect(cancelled).toMatchObject({ status: 'CANCELLED' });
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);
    expect(h.parts.every((p) => p.status === 'RETURNED')).toBe(true);
    expect(h.movements[h.movements.length - 1].balanceAfterQty).toBe(10);
    const flush = journalsBy(h, 'cancellation');
    expect(flush).toHaveLength(1);
    expect(legsOf(h, flush[0].id).get('12200')).toEqual(['120.00', '0.00']);
    expect(legsOf(h, flush[0].id).get('12300')).toEqual(['0.00', '120.00']);
    await expect(h.workshop.consumePart(order.id, 'ci-screen', 1, '60.00')).rejects.toBeInstanceOf(RepairOrderClosedError);
    await expect(h.domain.markReady(order.id)).rejects.toBeInstanceOf(RepairOrderClosedError);
  });

  it('blocks delivery when the receivable breaches the credit limit, atomically', async () => {
    const h = await seeded();
    const customer = await h.partiesSvc.createParty({ name: 'Small', type: 'CUSTOMER', creditLimit: '50.00' });
    seedScreen(h);
    const order = await readyOrder(h, customer.id);
    await h.domain.markReady(order.id);
    const before = { docs: h.documents.size, journals: h.entries.size, moves: h.movements.length, subs: h.subledgers.length };
    await expect(
      h.workshop.deliverRepairOrder({ repairOrderId: order.id, payments: [] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await h.domain.getRepairOrder(order.id)).status).toBe('READY');
    expect({ docs: h.documents.size, journals: h.entries.size, moves: h.movements.length, subs: h.subledgers.length }).toEqual(before);
  });

  it('rejects mutations on terminal orders', async () => {
    const h = await seeded();
    const customer = await h.partiesSvc.createParty({ name: 'Karim', type: 'CUSTOMER' });
    seedScreen(h);
    const order = await readyOrder(h, customer.id);
    await expect(h.workshop.deliverRepairOrder({ repairOrderId: order.id, payments: [] })).rejects.toBeInstanceOf(InvalidRepairStateTransitionError);
    h.orders.set('ro-cancelled', {
      id: 'ro-cancelled', orderNumber: 'REP000099', partyId: customer.id, status: 'CANCELLED',
      laborPrice: '0.00', partsPriceTotal: '0.00', discountAmount: '0.00',
      totalAmount: '0.00', paidAmount: '0.00', outstandingAmount: '0.00',
    });
    await expect(h.workshop.consumePart('ro-cancelled', 'ci-screen', 1, '60.00')).rejects.toBeInstanceOf(RepairOrderClosedError);
    await expect(h.workshop.returnPart(order.id, 'ghost-part')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
