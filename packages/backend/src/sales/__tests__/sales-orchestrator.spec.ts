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
import { SalesOrchestratorService } from '../sales-orchestrator.service';
import type { PrismaService } from '../../prisma/prisma.service';

/* ------------------------------------------------------------------ */
/* Full-stack fake with snapshot-rollback transactions. The fake       */
/* $transaction snapshots every mutable store and restores it on       */
/* error — emulating real atomicity so failure tests can assert        */
/* zero partial writes. The suite never touches a real database.       */
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
    findUnique: jest.fn(async ({ where, include }: any) => {
      const entry = entries.get(where.id) ?? null;
      if (!entry) return null;
      if (include?.lines) return { ...entry, lines: [...lines.values()].filter((l) => l.journalEntryId === entry.id) };
      return entry;
    }),
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
  const sales = new SalesOrchestratorService(db, orchestrator, idempotency, sequences, inventory, serials, posting, partiesSvc, subledger, audit);

  return {
    db, coa, posting, partiesSvc, subledger, inventory, serials, idempotency, sales,
    items, devices, movements, subledgers, documents, entries, lines, events,
  };
}

async function seeded() {
  const h = setup();
  await h.coa.seedStandardAccounts();
  return h;
}

function seedBulk(h: Awaited<ReturnType<typeof seeded>>, sku: string, cost: string, qty: number, overrides: any = {}) {
  const row = {
    id: `item-${sku}`, sku, name: sku, category: 'ACCESSORY', costPrice: cost, sellingPrice: cost,
    isSerialized: false, isActive: true, ...overrides,
  };
  h.items.set(row.id, row);
  h.movements.push({ id: `im-seed-${sku}`, itemId: row.id, movementType: 'IN', quantity: qty, unitCost: cost, totalCost: cost, balanceAfterQty: qty, referenceType: 'OPENING_BALANCE', referenceId: 'seed', createdAt: new Date(2026, 0, 1) });
  return row;
}

function seedSerialDevice(h: Awaited<ReturnType<typeof seeded>>, imei: string, acquisitionCost: string) {
  const item = { id: 'item-phone', sku: 'PHONE-X', name: 'Phone X', category: 'DEVICE', costPrice: '0.00', sellingPrice: '500.00', isSerialized: true, isActive: true };
  h.items.set(item.id, item);
  const device = { id: `si-${imei}`, imei1: imei, imei2: null, itemId: item.id, acquisitionCost, currentStatus: 'IN_STOCK', warrantyMonths: 12, warrantyEndsAt: new Date(2027, 0, 1) };
  h.devices.set(device.id, device);
  return { item, device };
}

/** accountCode → [debit, credit, partyId] for one journal entry. */
function legsOf(h: Awaited<ReturnType<typeof seeded>>, journalId: string): Map<string, [string, string, string | null]> {
  const map = new Map<string, [string, string, string | null]>();
  for (const l of h.lines.values()) {
    if (l.journalEntryId === journalId) map.set(l.accountCode, [l.debit, l.credit, l.partyId ?? null]);
  }
  return map;
}

describe('stage 5.1 sales orchestrator (TASK BRIEF-014)', () => {
  it('executes a full cash sale: stock, balanced journal, zero outstanding', async () => {
    const h = await seeded();
    const item = seedBulk(h, 'CABLE-U', '60.00', 10);
    const result = await h.sales.executeSale({
      lines: [{ itemId: item.id, quantity: 2, unitPrice: '100.00' }],
      payments: [{ paymentMethod: 'CASH', amount: '200.00' }],
      actorUserId: 'u-admin',
    });
    expect(result.document).toMatchObject({
      documentNumber: 'INV-000001', type: 'SALE_INVOICE', status: 'POSTED',
      subtotalAmount: '200.00', discountAmount: '0.00', totalAmount: '200.00',
      paidAmount: '200.00', outstandingAmount: '0.00',
    });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ quantity: 2, unitCost: '60.00', unitPrice: '100.00', lineTotal: '200.00' });
    expect(result.payments).toHaveLength(1);
    expect(result.journalNumber).toBe('JRN-000001');
    expect(h.movements[h.movements.length - 1]).toMatchObject({ movementType: 'OUT', quantity: 2, balanceAfterQty: 8 });
    const legs = legsOf(h, result.journalEntryId);
    expect(legs.get('10000')).toEqual(['200.00', '0.00', null]);
    expect(legs.get('40000')).toEqual(['0.00', '200.00', null]);
    expect(legs.get('50000')).toEqual(['120.00', '0.00', null]);
    expect(legs.get('12000')).toEqual(['0.00', '120.00', null]);
    expect(h.subledgers).toHaveLength(0);
  });

  it('executes a credit sale with subledger posting and enforces limits atomically', async () => {
    const h = await seeded();
    seedBulk(h, 'CABLE-U', '60.00', 10);
    const alice = await h.partiesSvc.createParty({ name: 'Alice', type: 'CUSTOMER', creditLimit: '1000.00' });
    const item = h.items.get('item-CABLE-U');
    const result = await h.sales.executeSale({
      partyId: alice.id,
      lines: [{ itemId: item.id, quantity: 1, unitPrice: '500.00' }],
      payments: [],
    });
    expect(result.document.outstandingAmount).toBe('500.00');
    const legs = legsOf(h, result.journalEntryId);
    expect(legs.get('11000')).toEqual(['500.00', '0.00', alice.id]);
    expect((await h.partiesSvc.getPartyBalance(alice.id)).to2dp()).toBe('500.00');
    expect(h.subledgers).toHaveLength(1);
    expect(h.subledgers[0]).toMatchObject({ entryType: 'INVOICE_CHARGE', amount: '500.00', balanceBefore: '0.00', balanceAfter: '500.00' });

    // Limit breach rolls back the ENTIRE sale (no doc, journal, movement, subledger).
    const bob = await h.partiesSvc.createParty({ name: 'Bob', type: 'CUSTOMER', creditLimit: '100.00' });
    const before = { docs: h.documents.size, journals: h.entries.size, moves: h.movements.length, subs: h.subledgers.length };
    await expect(
      h.sales.executeSale({ partyId: bob.id, lines: [{ itemId: item.id, quantity: 1, unitPrice: '500.00' }], payments: [] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect({ docs: h.documents.size, journals: h.entries.size, moves: h.movements.length, subs: h.subledgers.length }).toEqual(before);
  });

  it('splits Cash + Bank + Customer Credit across a balanced multi-leg journal', async () => {
    const h = await seeded();
    seedBulk(h, 'CABLE-U', '60.00', 20);
    const charlie = await h.partiesSvc.createParty({ name: 'Charlie', type: 'CUSTOMER', creditLimit: '2000.00' });
    const item = h.items.get('item-CABLE-U');
    const result = await h.sales.executeSale({
      partyId: charlie.id,
      lines: [{ itemId: item.id, quantity: 5, unitPrice: '100.00' }],
      payments: [
        { paymentMethod: 'CASH', amount: '100.00' },
        { paymentMethod: 'BANK_TRANSFER', amount: '100.00' },
      ],
    });
    expect(result.document).toMatchObject({ paidAmount: '200.00', outstandingAmount: '300.00' });
    expect(result.payments.map((p) => [p.paymentMethod, p.amount])).toEqual([['CASH', '100.00'], ['BANK_TRANSFER', '100.00']]);
    const legs = legsOf(h, result.journalEntryId);
    expect(legs.get('10000')).toEqual(['100.00', '0.00', null]);
    expect(legs.get('10200')).toEqual(['100.00', '0.00', null]);
    expect(legs.get('11000')).toEqual(['300.00', '0.00', charlie.id]);
    expect(legs.get('40000')).toEqual(['0.00', '500.00', null]);
    expect(legs.get('50000')).toEqual(['300.00', '0.00', null]);
    expect(legs.get('12000')).toEqual(['0.00', '300.00', null]);
    expect((await h.partiesSvc.getPartyBalance(charlie.id)).to2dp()).toBe('300.00');
  });

  it('sells a serialized device at specific identification cost', async () => {
    const h = await seeded();
    const { device } = seedSerialDevice(h, '490154203237518', '250.00');
    const item = h.items.get('item-phone');
    const result = await h.sales.executeSale({
      lines: [{ itemId: item.id, serialId: device.id, quantity: 1, unitPrice: '400.00' }],
      payments: [{ paymentMethod: 'CASH', amount: '400.00' }],
    });
    expect(h.devices.get(device.id).currentStatus).toBe('SOLD');
    expect(h.events[h.events.length - 1]).toMatchObject({ eventType: 'SALE_OUT', referenceType: 'SALE' });
    expect(result.lines[0]).toMatchObject({ serialId: device.id, unitCost: '250.00', lineTotal: '400.00' });
    const legs = legsOf(h, result.journalEntryId);
    expect(legs.get('50000')).toEqual(['250.00', '0.00', null]);
    expect(legs.get('12000')).toEqual(['0.00', '250.00', null]);
  });

  it('rejects overpayment and party-less credit with zero side effects', async () => {
    const h = await seeded();
    const item = seedBulk(h, 'CABLE-U', '60.00', 10);
    await expect(
      h.sales.executeSale({ lines: [{ itemId: item.id, quantity: 1, unitPrice: '100.00' }], payments: [{ paymentMethod: 'CASH', amount: '150.00' }] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: 'Overpayment is not permitted in POS sale.' });
    await expect(
      h.sales.executeSale({ lines: [{ itemId: item.id, quantity: 1, unitPrice: '100.00' }], payments: [] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: 'A registered customer (partyId) is required for credit sales.' });
    expect(h.documents.size).toBe(0);
    expect(h.entries.size).toBe(0);
    expect(h.movements).toHaveLength(1);
  });

  it('replays idempotent retries without duplicate mutations', async () => {
    const h = await seeded();
    const item = seedBulk(h, 'CABLE-U', '60.00', 10);
    const command = {
      lines: [{ itemId: item.id, quantity: 2, unitPrice: '100.00' }],
      payments: [{ paymentMethod: 'CASH' as const, amount: '200.00' }],
      idempotencyKey: 'pos-retry-1',
    };
    const first = await h.sales.executeSale(command);
    expect(first.document.documentNumber).toBe('INV-000001');
    const second = await h.sales.executeSale(command);
    expect(second.document.id).toBe(first.document.id);
    expect(second.journalNumber).toBe(first.journalNumber);
    expect(h.documents.size).toBe(1);
    expect(h.entries.size).toBe(1);
    expect(h.movements.filter((m) => m.referenceType === 'SALE')).toHaveLength(1);
    expect(h.movements[h.movements.length - 1].balanceAfterQty).toBe(8);
  });

  it('enforces serial line guards and rolls back failed sales', async () => {
    const h = await seeded();
    const bulk = seedBulk(h, 'CABLE-U', '60.00', 10);
    const { item, device } = seedSerialDevice(h, '490154203237518', '250.00');
    const other = { id: 'item-other', sku: 'PHONE-Y', name: 'Phone Y', category: 'DEVICE', costPrice: '0.00', sellingPrice: '450.00', isSerialized: true, isActive: true };
    h.items.set(other.id, other);
    const cash = (total: string) => [{ paymentMethod: 'CASH' as const, amount: total }];
    const cases = [
      { lines: [{ itemId: item.id, serialId: device.id, quantity: 2, unitPrice: '400.00' }], payments: cash('800.00') },
      { lines: [{ itemId: item.id, quantity: 1, unitPrice: '400.00' }], payments: cash('400.00') },
      { lines: [{ itemId: bulk.id, serialId: device.id, quantity: 1, unitPrice: '10.00' }], payments: cash('10.00') },
      // Wrong-item serial: device belongs to PHONE-X, line claims PHONE-Y.
      { lines: [{ itemId: other.id, serialId: device.id, quantity: 1, unitPrice: '10.00' }], payments: cash('10.00') },
    ];
    for (const command of cases) {
      await expect(h.sales.executeSale(command)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    // Sell the device once, then again → ConflictError, second sale fully rolled back.
    await h.sales.executeSale({ lines: [{ itemId: item.id, serialId: device.id, quantity: 1, unitPrice: '400.00' }], payments: cash('400.00') });
    await expect(
      h.sales.executeSale({ lines: [{ itemId: item.id, serialId: device.id, quantity: 1, unitPrice: '400.00' }], payments: cash('400.00') }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(h.documents.size).toBe(1);
    expect(h.devices.get(device.id).currentStatus).toBe('SOLD');
  });
});
