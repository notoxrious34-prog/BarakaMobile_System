import { ChartOfAccountsService } from '../../accounting/chart-of-accounts.service';
import { FiscalPeriodService } from '../../accounting/fiscal-period.service';
import { DocumentNumberService } from '../../core/document-number.service';
import { AuditService } from '../../core/audit.service';
import { TransactionOrchestrator } from '../../core/transaction-orchestrator';
import { IdempotencyEngine } from '../../core/idempotency';
import { PostingService } from '../../accounting/posting.service';
import { PartiesService } from '../../parties/parties.service';
import { PartySubledgerService } from '../../parties/party-subledger.service';
import { InventoryDomainService } from '../../inventory/inventory-domain.service';
import { SerializedInventoryService } from '../../inventory/serialized-inventory.service';
import { PurchasesOrchestratorService } from '../purchases-orchestrator.service';
import type { PrismaService } from '../../prisma/prisma.service';

const IMEI_A = '490154203237518';
const IMEI_B = '111111111111119'; // Luhn-valid second IMEI (check digit 9).

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
  const devices = new Map<string, any>();
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

  const serializedItem = {
    findUnique: jest.fn(async ({ where }: any) => devices.get(where.id) ?? null),
    findFirst: jest.fn(async ({ where }: any) => {
      const ors: any[] = where?.OR ?? [];
      return [...devices.values()].find((d) => ors.some((c: any) => (c.imei1 !== undefined && d.imei1 === c.imei1) || (c.imei2 !== undefined && d.imei2 === c.imei2))) ?? null;
    }),
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `si-${devices.size + 1}`, imei2: null, warrantyEndsAt: null, ...data };
      devices.set(row.id, row);
      return row;
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
      const row = { id: `sle-${events.length + 1}`, createdAt: tick(), ...data };
      events.push(row);
      return row;
    }),
  };

  const businessDocument = {
    create: jest.fn(async ({ data, include }: any) => {
      docSeq += 1;
      const doc: any = {
        id: `doc-${docSeq}`,
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
        id: `dl-${docSeq}-${index}`,
        documentId: doc.id,
        itemId: l.itemId,
        serialId: l.serialId ?? null,
        quantity: l.quantity,
        unitCost: l.unitCost,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
      }));
      const paymentRows = (data.payments?.create ?? []).map((p: any, index: number) => ({
        id: `pa-${docSeq}-${index}`,
        documentId: doc.id,
        repairOrderId: null,
        paymentMethod: p.paymentMethod,
        amount: p.amount,
        walletId: p.walletId ?? null,
        createdAt: new Date(),
      }));
      documents.set(doc.id, doc);
      for (const l of docLineRows) docLines.set(l.id, l);
      for (const p of paymentRows) payments.set(p.id, p);
      const out: any = { ...doc };
      if (include?.lines) out.lines = docLineRows;
      if (include?.payments) out.payments = paymentRows;
      return out;
    }),
  };

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
    serializedItem, serializedLifecycleEvent, businessDocument, auditLog,
  };
  prisma.$transaction = jest.fn(async (fn: any) => {
    const snap = {
      entries: new Map(entries), lines: new Map(lines), documents: new Map(documents),
      docLines: new Map(docLines), payments: new Map(payments),
      items: new Map([...items].map(([k, v]) => [k, { ...v }])),
      devices: new Map([...devices].map(([k, v]) => [k, { ...v }])),
      parties: new Map(parties),
      periodsById: new Map(periodsById), periodsByName: new Map(periodsByName),
      seqLast: new Map(seqLast),
      movementsLen: movements.length, subledgersLen: subledgers.length,
      eventsLen: events.length, auditLen: auditRows.length,
    };
    try {
      return await fn(prisma);
    } catch (error) {
      for (const [store, saved] of [
        [entries, snap.entries], [lines, snap.lines], [documents, snap.documents],
        [docLines, snap.docLines], [payments, snap.payments], [items, snap.items],
        [devices, snap.devices], [parties, snap.parties],
        [periodsById, snap.periodsById], [periodsByName, snap.periodsByName], [seqLast, snap.seqLast],
      ] as Array<[Map<string, any>, Map<string, any>]>) {
        store.clear();
        for (const [k, v] of saved) store.set(k, v);
      }
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
  const serials = new SerializedInventoryService(db, orchestrator, audit);
  const idempotency = new IdempotencyEngine();
  const purchases = new PurchasesOrchestratorService(db, orchestrator, idempotency, sequences, inventory, serials, posting, partiesSvc, subledger, audit);

  return {
    db, coa, posting, partiesSvc, subledger, purchases,
    items, devices, movements, subledgers, documents, entries, lines, events,
  };
}

async function seeded() {
  const h = setup();
  await h.coa.seedStandardAccounts();
  return h;
}

function seedBulk(h: Awaited<ReturnType<typeof seeded>>, sku: string, cost: string, overrides: any = {}) {
  const row = {
    id: `item-${sku}`, sku, name: sku, category: 'ACCESSORY', costPrice: cost, sellingPrice: cost,
    isSerialized: false, isActive: true, ...overrides,
  };
  h.items.set(row.id, row);
  return row;
}

function legsOf(h: Awaited<ReturnType<typeof seeded>>, journalId: string): Map<string, [string, string, string | null]> {
  const map = new Map<string, [string, string, string | null]>();
  for (const l of h.lines.values()) {
    if (l.journalEntryId === journalId) map.set(l.accountCode, [l.debit, l.credit, l.partyId ?? null]);
  }
  return map;
}

describe('stage 5.2 purchases orchestrator (TASK BRIEF-015)', () => {
  it('buys bulk stock for cash: average cost, balanced journal, PUR numbering', async () => {
    const h = await seeded();
    const item = seedBulk(h, 'CABLE-U', '100.00');
    const sam = await h.partiesSvc.createParty({ name: 'Sam', type: 'SUPPLIER' });
    const result = await h.purchases.executePurchase({
      partyId: sam.id,
      lines: [{ itemId: item.id, quantity: 10, unitCost: '120.00' }],
      payments: [{ paymentMethod: 'CASH', amount: '1200.00' }],
      actorUserId: 'u-admin',
    });
    expect(result.document).toMatchObject({
      documentNumber: 'PUR-000001', type: 'PURCHASE_INVOICE', status: 'POSTED',
      totalAmount: '1200.00', paidAmount: '1200.00', outstandingAmount: '0.00',
    });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ quantity: 10, unitCost: '120.00', unitPrice: '120.00', lineTotal: '1200.00' });
    expect(h.items.get(item.id).costPrice).toBe('120.00');
    expect(h.movements[h.movements.length - 1]).toMatchObject({ movementType: 'IN', quantity: 10, balanceAfterQty: 10 });
    const legs = legsOf(h, result.journalEntryId);
    expect(legs.get('12000')).toEqual(['1200.00', '0.00', null]);
    expect(legs.get('10000')).toEqual(['0.00', '1200.00', null]);
    expect(legs.size).toBe(2);
    expect(h.subledgers).toHaveLength(0);
    expect(result.journalNumber).toBe('JRN-000001');

    // Second receipt re-averages: (10×120 + 10×100) / 20 = 110.00.
    await h.purchases.executePurchase({
      partyId: sam.id,
      lines: [{ itemId: item.id, quantity: 10, unitCost: '100.00' }],
      payments: [{ paymentMethod: 'CASH', amount: '1000.00' }],
    });
    expect(h.items.get(item.id).costPrice).toBe('110.00');
  });

  it('buys on credit: AP leg, supplier subledger, payable balance', async () => {
    const h = await seeded();
    const item = seedBulk(h, 'CABLE-U', '200.00');
    const sam = await h.partiesSvc.createParty({ name: 'Sam', type: 'SUPPLIER' });
    const result = await h.purchases.executePurchase({
      partyId: sam.id,
      lines: [{ itemId: item.id, quantity: 5, unitCost: '200.00' }],
      payments: [],
    });
    expect(result.document).toMatchObject({ totalAmount: '1000.00', paidAmount: '0.00', outstandingAmount: '1000.00' });
    const legs = legsOf(h, result.journalEntryId);
    expect(legs.get('12000')).toEqual(['1000.00', '0.00', null]);
    expect(legs.get('20000')).toEqual(['0.00', '1000.00', sam.id]);
    expect((await h.partiesSvc.getPartyBalance(sam.id)).to2dp()).toBe('1000.00');
    expect(h.subledgers[0]).toMatchObject({ entryType: 'INVOICE_CHARGE', amount: '1000.00', balanceAfter: '1000.00' });
  });

  it('registers serialized units with PURCHASE_IN events and per-unit lines', async () => {
    const h = await seeded();
    const item = seedBulk(h, 'PHONE-X', '0.00', { category: 'DEVICE', isSerialized: true });
    const sam = await h.partiesSvc.createParty({ name: 'Sam', type: 'SUPPLIER' });
    const result = await h.purchases.executePurchase({
      partyId: sam.id,
      lines: [{ itemId: item.id, quantity: 2, unitCost: '300.00', serials: [{ imei1: IMEI_A }, { imei1: IMEI_B }] }],
      payments: [{ paymentMethod: 'BANK_TRANSFER', amount: '600.00' }],
    });
    expect(h.devices.size).toBe(2);
    for (const device of h.devices.values()) {
      expect(device).toMatchObject({ currentStatus: 'IN_STOCK', acquisitionCost: '300.00' });
    }
    expect(h.events.filter((e) => e.eventType === 'PURCHASE_IN')).toHaveLength(2);
    expect(result.lines).toHaveLength(2);
    expect(result.lines.every((l) => l.quantity === 1 && l.serialId && l.unitCost === '300.00')).toBe(true);
    expect(h.movements[h.movements.length - 1]).toMatchObject({ movementType: 'IN', quantity: 2, balanceAfterQty: 2 });
    const legs = legsOf(h, result.journalEntryId);
    expect(legs.get('10200')).toEqual(['0.00', '600.00', null]);

    // Duplicate IMEI is rejected and rolls the whole purchase back.
    const before = { docs: h.documents.size, journals: h.entries.size, devices: h.devices.size, moves: h.movements.length };
    await expect(
      h.purchases.executePurchase({
        partyId: sam.id,
        lines: [{ itemId: item.id, quantity: 1, unitCost: '300.00', serials: [{ imei1: IMEI_A }] }],
        payments: [{ paymentMethod: 'CASH', amount: '300.00' }],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect({ docs: h.documents.size, journals: h.entries.size, devices: h.devices.size, moves: h.movements.length }).toEqual(before);
  });

  it('enforces supplier, payment and serial guards with zero side effects', async () => {
    const h = await seeded();
    const item = seedBulk(h, 'CABLE-U', '60.00');
    const customer = await h.partiesSvc.createParty({ name: 'Retail', type: 'CUSTOMER' });
    const sam = await h.partiesSvc.createParty({ name: 'Sam', type: 'SUPPLIER' });
    const line = { itemId: item.id, quantity: 1, unitCost: '60.00' };
    const cash = [{ paymentMethod: 'CASH' as const, amount: '60.00' }];
    await expect(
      h.purchases.executePurchase({ partyId: customer.id, lines: [line], payments: cash }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      h.purchases.executePurchase({ partyId: '', lines: [line], payments: cash }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      h.purchases.executePurchase({ partyId: sam.id, lines: [line], payments: [{ paymentMethod: 'CASH', amount: '100.00' }] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: 'Overpayment is not permitted in purchase invoice.' });
    const serialized = seedBulk(h, 'PHONE-X', '0.00', { isSerialized: true });
    await expect(
      h.purchases.executePurchase({ partyId: sam.id, lines: [{ itemId: serialized.id, quantity: 2, unitCost: '300.00', serials: [{ imei1: IMEI_A }] }], payments: cash }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      h.purchases.executePurchase({ partyId: sam.id, lines: [{ itemId: item.id, quantity: 1, unitCost: '-5.00' }], payments: [] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(h.documents.size).toBe(0);
    expect(h.entries.size).toBe(0);
    expect(h.movements).toHaveLength(0);
  });
});
