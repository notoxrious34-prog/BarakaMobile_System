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
import { SalesOrchestratorService } from '../../sales/sales-orchestrator.service';
import { ReturnsOrchestratorService } from '../returns-orchestrator.service';
import type { PrismaService } from '../../prisma/prisma.service';

/* ------------------------------------------------------------------ */
/* Full-stack fake with snapshot-rollback transactions (see Stage 5.1) */
/* plus BusinessDocument reads for return validation.                  */
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
    findUnique: jest.fn(async ({ where, include }: any) => {
      const doc = documents.get(where.id) ?? null;
      if (!doc) return null;
      const out: any = { ...doc };
      if (include?.lines) out.lines = [...docLines.values()].filter((l) => l.documentId === doc.id);
      if (include?.payments) out.payments = [...payments.values()].filter((p) => p.documentId === doc.id);
      if (include?.party) out.party = doc.partyId ? parties.get(doc.partyId) ?? null : null;
      return out;
    }),
    findMany: jest.fn(async ({ where, include }: any = {}) => {
      let rows = [...documents.values()];
      if (where?.type) rows = rows.filter((d) => d.type === where.type);
      if (where?.reversalDocumentId) rows = rows.filter((d) => d.reversalDocumentId === where.reversalDocumentId);
      if (!include?.lines) return rows;
      return rows.map((d) => ({ ...d, lines: [...docLines.values()].filter((l) => l.documentId === d.id) }));
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
  const returns = new ReturnsOrchestratorService(db, orchestrator, idempotency, sequences, inventory, serials, posting, subledger, audit);

  return {
    db, coa, sales, returns, partiesSvc,
    items, devices, movements, subledgers, documents, entries, lines, events,
  };
}

async function seeded() {
  const h = setup();
  await h.coa.seedStandardAccounts();
  return h;
}

function seedBulk(h: Awaited<ReturnType<typeof seeded>>, sku: string, cost: string, qty: number) {
  const row = {
    id: `item-${sku}`, sku, name: sku, category: 'ACCESSORY', costPrice: cost, sellingPrice: cost,
    isSerialized: false, isActive: true,
  };
  h.items.set(row.id, row);
  h.movements.push({ id: `im-seed-${sku}`, itemId: row.id, movementType: 'IN', quantity: qty, unitCost: cost, totalCost: cost, balanceAfterQty: qty, referenceType: 'OPENING_BALANCE', referenceId: 'seed', createdAt: new Date(2026, 0, 1) });
  return row;
}

function legsOf(h: Awaited<ReturnType<typeof seeded>>, journalId: string): Map<string, [string, string, string | null]> {
  const map = new Map<string, [string, string, string | null]>();
  for (const l of h.lines.values()) {
    if (l.journalEntryId === journalId) map.set(l.accountCode, [l.debit, l.credit, l.partyId ?? null]);
  }
  return map;
}

describe('stage 5.2 returns orchestrator (TASK BRIEF-015)', () => {
  it('returns cash sale items: revenue reversal, cash refund, stock and COGS restore', async () => {
    const h = await seeded();
    const item = seedBulk(h, 'CABLE-U', '60.00', 10);
    const sale = await h.sales.executeSale({
      lines: [{ itemId: item.id, quantity: 5, unitPrice: '100.00' }],
      payments: [{ paymentMethod: 'CASH', amount: '500.00' }],
    });
    const saleLine = sale.lines[0];
    const ret = await h.returns.executeSalesReturn({
      originalDocumentId: sale.document.id,
      lines: [{ documentLineId: saleLine.id, quantity: 2, condition: 'RESTOCKED_INVENTORY' }],
      refundMethod: 'CASH',
      reason: 'Customer changed mind',
      actorUserId: 'u-admin',
    });
    expect(ret.returnDocument).toMatchObject({
      documentNumber: 'RET-000001', type: 'SALES_RETURN', status: 'POSTED',
      totalAmount: '200.00', paidAmount: '200.00', outstandingAmount: '0.00',
      reversalDocumentId: sale.document.id,
    });
    expect(ret.lines).toHaveLength(1);
    expect(ret.lines[0]).toMatchObject({ quantity: 2, unitPrice: '100.00', unitCost: '60.00', lineTotal: '200.00' });
    const legs = legsOf(h, ret.journalEntryId);
    expect(legs.get('40000')).toEqual(['200.00', '0.00', null]);
    expect(legs.get('10000')).toEqual(['0.00', '200.00', null]);
    expect(legs.get('12000')).toEqual(['120.00', '0.00', null]);
    expect(legs.get('50000')).toEqual(['0.00', '120.00', null]);
    expect(h.movements[h.movements.length - 1]).toMatchObject({ movementType: 'IN', quantity: 2, balanceAfterQty: 7 });
    expect(ret.journalNumber).toBe('JRN-000002');
  });

  it('reduces customer debt on CUSTOMER_CREDIT_REDUCTION against GL 11000', async () => {
    const h = await seeded();
    const item = seedBulk(h, 'CABLE-U', '60.00', 10);
    const dana = await h.partiesSvc.createParty({ name: 'Dana', type: 'CUSTOMER', creditLimit: '5000.00' });
    const sale = await h.sales.executeSale({
      partyId: dana.id,
      lines: [{ itemId: item.id, quantity: 3, unitPrice: '200.00' }],
      payments: [],
    });
    expect((await h.partiesSvc.getPartyBalance(dana.id)).to2dp()).toBe('600.00');
    const ret = await h.returns.executeSalesReturn({
      originalDocumentId: sale.document.id,
      lines: [{ documentLineId: sale.lines[0].id, quantity: 1, condition: 'RESTOCKED_INVENTORY' }],
      refundMethod: 'CUSTOMER_CREDIT_REDUCTION',
      reason: 'Partial return',
    });
    const legs = legsOf(h, ret.journalEntryId);
    expect(legs.get('11000')).toEqual(['0.00', '200.00', dana.id]);
    expect((await h.partiesSvc.getPartyBalance(dana.id)).to2dp()).toBe('400.00');
    expect(h.subledgers[h.subledgers.length - 1]).toMatchObject({ entryType: 'RETURN_CREDIT', amount: '200.00', balanceAfter: '400.00' });
  });

  it('restocks serialized devices and quarantines defective ones', async () => {
    const h = await seeded();
    const item = { id: 'item-phone', sku: 'PHONE-X', name: 'Phone X', category: 'DEVICE', costPrice: '0.00', sellingPrice: '400.00', isSerialized: true, isActive: true };
    h.items.set(item.id, item);
    const mkDevice = (imei: string) => {
      const device = { id: `si-${imei}`, imei1: imei, imei2: null, itemId: item.id, acquisitionCost: '250.00', currentStatus: 'IN_STOCK', warrantyMonths: 12, warrantyEndsAt: new Date(2027, 0, 1) };
      h.devices.set(device.id, device);
      return device;
    };
    const devA = mkDevice('490154203237518');
    const devB = mkDevice('111111111111119');
    const saleA = await h.sales.executeSale({
      lines: [{ itemId: item.id, serialId: devA.id, quantity: 1, unitPrice: '400.00' }],
      payments: [{ paymentMethod: 'CASH', amount: '400.00' }],
    });
    const saleB = await h.sales.executeSale({
      lines: [{ itemId: item.id, serialId: devB.id, quantity: 1, unitPrice: '400.00' }],
      payments: [{ paymentMethod: 'CASH', amount: '400.00' }],
    });

    const restock = await h.returns.executeSalesReturn({
      originalDocumentId: saleA.document.id,
      lines: [{ documentLineId: saleA.lines[0].id, quantity: 1, condition: 'RESTOCKED_INVENTORY' }],
      refundMethod: 'CASH',
      reason: 'Unopened box',
    });
    expect(h.devices.get(devA.id).currentStatus).toBe('IN_STOCK');
    const typesA = h.events.filter((e) => e.serialId === devA.id).map((e) => e.eventType);
    expect(typesA).toContain('RETURN_RESTOCK');
    const legsA = legsOf(h, restock.journalEntryId);
    expect(legsA.get('12000')).toEqual(['250.00', '0.00', null]);
    expect(legsA.get('50000')).toEqual(['0.00', '250.00', null]);

    const quarantine = await h.returns.executeSalesReturn({
      originalDocumentId: saleB.document.id,
      lines: [{ documentLineId: saleB.lines[0].id, quantity: 1, condition: 'DEFECTIVE_QUARANTINE' }],
      refundMethod: 'CASH',
      reason: 'Cracked on arrival',
    });
    expect(h.devices.get(devB.id).currentStatus).toBe('DEFECTIVE');
    const typesB = h.events.filter((e) => e.serialId === devB.id).map((e) => e.eventType);
    expect(typesB).toContain('DEFECT_QUARANTINE');
    // Quarantined cost stays expensed: no inventory/COGS legs.
    const legsB = legsOf(h, quarantine.journalEntryId);
    expect(legsB.has('12000')).toBe(false);
    expect(legsB.has('50000')).toBe(false);
    expect(legsB.get('40000')).toEqual(['400.00', '0.00', null]);
    expect(legsB.get('10000')).toEqual(['0.00', '400.00', null]);
  });

  it('rejects over-returns with zero side effects', async () => {
    const h = await seeded();
    const item = seedBulk(h, 'CABLE-U', '60.00', 10);
    const sale = await h.sales.executeSale({
      lines: [{ itemId: item.id, quantity: 5, unitPrice: '100.00' }],
      payments: [{ paymentMethod: 'CASH', amount: '500.00' }],
    });
    const lineId = sale.lines[0].id;
    await expect(
      h.returns.executeSalesReturn({ originalDocumentId: sale.document.id, lines: [{ documentLineId: lineId, quantity: 6, condition: 'RESTOCKED_INVENTORY' }], refundMethod: 'CASH', reason: 'Too many' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await h.returns.executeSalesReturn({ originalDocumentId: sale.document.id, lines: [{ documentLineId: lineId, quantity: 2, condition: 'RESTOCKED_INVENTORY' }], refundMethod: 'CASH', reason: 'First' });
    await expect(
      h.returns.executeSalesReturn({ originalDocumentId: sale.document.id, lines: [{ documentLineId: lineId, quantity: 4, condition: 'RESTOCKED_INVENTORY' }], refundMethod: 'CASH', reason: 'Second' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(h.documents.size).toBe(2); // sale + first return only
    expect(h.movements[h.movements.length - 1].balanceAfterQty).toBe(7);
  });
});
