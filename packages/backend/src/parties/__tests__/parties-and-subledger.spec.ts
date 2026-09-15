import { ChartOfAccountsService } from '../../accounting/chart-of-accounts.service';
import { FiscalPeriodService } from '../../accounting/fiscal-period.service';
import { DocumentNumberService } from '../../core/document-number.service';
import { AuditService } from '../../core/audit.service';
import { TransactionOrchestrator } from '../../core/transaction-orchestrator';
import { PostingService } from '../../accounting/posting.service';
import { ReconciliationService } from '../../accounting/reconciliation.service';
import { PartiesService } from '../parties.service';
import { PartySubledgerService } from '../party-subledger.service';
import { SubledgerReconciliationService } from '../subledger-reconciliation.service';
import { Money } from '../../core/money';
import type { PrismaService } from '../../prisma/prisma.service';

const SEP_2026 = new Date(2026, 8, 15, 12, 0, 0);

/* ------------------------------------------------------------------ */
/* In-memory Prisma fake — the suite never touches a real database.    */
/* ------------------------------------------------------------------ */

function setup() {
  const coaRows = new Map<string, any>();
  const periodsById = new Map<string, any>();
  const periodsByName = new Map<string, any>();
  const entries = new Map<string, any>();
  const lines = new Map<string, any>();
  const parties = new Map<string, any>();
  const subledgers: any[] = [];
  const auditRows: any[] = [];
  const seqLast = new Map<string, number>();
  let seq = 0;
  let fpSeq = 0;
  let partySeq = 0;
  let subSeq = 0;
  let clock = Date.now();
  const tick = (): Date => new Date((clock += 1));

  const chartOfAccount = {
    upsert: jest.fn(async ({ create, update }: any) => {
      const merged = { isControl: false, isActive: true, ...coaRows.get(create.accountCode), ...create, ...update };
      coaRows.set(create.accountCode, merged);
      return merged;
    }),
    findUnique: jest.fn(async ({ where }: any) => coaRows.get(where.accountCode) ?? null),
    findMany: jest.fn(async ({ where }: any = {}) => {
      let rows = [...coaRows.values()].sort((a, b) => (a.accountCode < b.accountCode ? -1 : 1));
      if (where?.type) rows = rows.filter((r) => r.type === where.type);
      return rows;
    }),
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
    findMany: jest.fn(async ({ where, include }: any = {}) => {
      let rows = [...entries.values()];
      if (where?.status) rows = rows.filter((e) => e.status === where.status);
      if (!include?.lines) return rows;
      return rows.map((e) => ({ ...e, lines: [...lines.values()].filter((l) => l.journalEntryId === e.id) }));
    }),
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
      rows = [...rows].sort((a, b) => (a.accountCode < b.accountCode ? -1 : 1));
      if (include?.account) return rows.map((l) => ({ ...l, account: coaRows.get(l.accountCode) }));
      return rows;
    }),
    count: jest.fn(async () => lines.size),
  };

  const party = {
    create: jest.fn(async ({ data }: any) => {
      partySeq += 1;
      const row = { id: `party-${partySeq}`, phone: null, address: null, creditLimit: '0.00', isActive: true, createdAt: new Date(), updatedAt: new Date(), ...data };
      parties.set(row.id, row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }: any) => parties.get(where.id) ?? null),
    findMany: jest.fn(async ({ where }: any = {}) => {
      let rows = [...parties.values()];
      if (where?.type) rows = rows.filter((p) => p.type === where.type);
      return [...rows].sort((a, b) => (a.name < b.name ? -1 : 1));
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = parties.get(where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data, { updatedAt: new Date() });
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
    findMany: jest.fn(async ({ where }: any = {}) => {
      let rows = [...subledgers];
      if (where?.partyId) rows = rows.filter((s) => s.partyId === where.partyId);
      if (where?.party) {
        rows = rows.filter((s) => {
          const p = parties.get(s.partyId);
          if (!p) return false;
          if (where.party.isActive !== undefined && p.isActive !== where.party.isActive) return false;
          if (where.party.type?.in && !where.party.type.in.includes(p.type)) return false;
          return true;
        });
      }
      rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return rows;
    }),
  };

  const auditLog = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `audit-${auditRows.length + 1}`, createdAt: new Date(), ...data };
      auditRows.push(row);
      return row;
    }),
  };

  const prisma: any = { chartOfAccount, fiscalPeriod, documentSequence, journalEntry, journalEntryLine, party, partySubledgerEntry, auditLog };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  const db = prisma as unknown as PrismaService;

  const coa = new ChartOfAccountsService(db);
  const periods = new FiscalPeriodService(db);
  const sequences = new DocumentNumberService(db);
  const audit = new AuditService(db);
  const orchestrator = new TransactionOrchestrator(db);
  const posting = new PostingService(db, coa, periods, sequences, audit, orchestrator);
  const trialBalance = new ReconciliationService(db);
  const partiesSvc = new PartiesService(db, orchestrator, audit);
  const subledger = new PartySubledgerService(db, partiesSvc, orchestrator, audit);
  const recon = new SubledgerReconciliationService(db, trialBalance);

  return { db, coa, posting, partiesSvc, subledger, recon, auditLog };
}

async function seeded() {
  const h = setup();
  await h.coa.seedStandardAccounts();
  return h;
}

/** getPartyBalance returns Money — assert its 2dp rendering. */
async function balanceOf(h: Awaited<ReturnType<typeof seeded>>, partyId: string): Promise<string> {
  const balance: Money = await h.partiesSvc.getPartyBalance(partyId);
  expect(balance).toBeInstanceOf(Money);
  return balance.to2dp();
}

/** Customer invoice 400 − payment 150 → balance 250 (Alice, limit 1000). */
async function customerFlow(h: Awaited<ReturnType<typeof seeded>>) {
  const alice = await h.partiesSvc.createParty({ name: 'Alice', type: 'CUSTOMER', creditLimit: '1000.00' });
  const invoice = await h.posting.post({
    documentType: 'SALE_INVOICE',
    documentId: 'inv-1',
    description: 'Credit sale',
    postingDate: SEP_2026,
    lines: [
      { accountCode: '11000', debit: '400.00' },
      { accountCode: '40000', credit: '400.00' },
    ],
  });
  const arLine = invoice.lines.find((l) => l.accountCode === '11000');
  if (!arLine) throw new Error('AR line missing');
  await h.subledger.recordSubledgerEntry({ partyId: alice.id, journalLineId: arLine.id, entryType: 'INVOICE_CHARGE', amount: '400.00', isDebit: true });
  const payment = await h.posting.post({
    documentType: 'PAYMENT_VOUCHER',
    documentId: 'pay-1',
    description: 'Customer payment',
    postingDate: SEP_2026,
    lines: [
      { accountCode: '10000', debit: '150.00' },
      { accountCode: '11000', credit: '150.00' },
    ],
  });
  const payLine = payment.lines.find((l) => l.accountCode === '11000');
  if (!payLine) throw new Error('pay line missing');
  await h.subledger.recordSubledgerEntry({ partyId: alice.id, journalLineId: payLine.id, entryType: 'PAYMENT', amount: '150.00', isDebit: false });
  return { alice, invoice, payment };
}

/** Supplier bill 300 − payment 100 → balance 200 (Bob). */
async function supplierFlow(h: Awaited<ReturnType<typeof seeded>>) {
  const bob = await h.partiesSvc.createParty({ name: 'Bob', type: 'SUPPLIER' });
  const bill = await h.posting.post({
    documentType: 'PURCHASE',
    documentId: 'bill-1',
    description: 'Supplier bill',
    postingDate: SEP_2026,
    lines: [
      { accountCode: '50000', debit: '300.00' },
      { accountCode: '20000', credit: '300.00' },
    ],
  });
  const apLine = bill.lines.find((l) => l.accountCode === '20000');
  if (!apLine) throw new Error('AP line missing');
  await h.subledger.recordSubledgerEntry({ partyId: bob.id, journalLineId: apLine.id, entryType: 'INVOICE_CHARGE', amount: '300.00', isDebit: false });
  const pay = await h.posting.post({
    documentType: 'PAYMENT_VOUCHER',
    documentId: 'pay-2',
    description: 'Supplier payment',
    postingDate: SEP_2026,
    lines: [
      { accountCode: '20000', debit: '100.00' },
      { accountCode: '10000', credit: '100.00' },
    ],
  });
  const payLine = pay.lines.find((l) => l.accountCode === '20000');
  if (!payLine) throw new Error('supplier pay line missing');
  await h.subledger.recordSubledgerEntry({ partyId: bob.id, journalLineId: payLine.id, entryType: 'PAYMENT', amount: '100.00', isDebit: true });
  return { bob, bill, pay };
}

describe('stage 4 parties and subledgers (TASK BRIEF-013)', () => {
  it('creates parties with zero initial balance and validates input', async () => {
    const h = await seeded();
    const alice = await h.partiesSvc.createParty({ name: 'Alice', phone: '0555', type: 'CUSTOMER', creditLimit: '1000.00', actorUserId: 'u-admin' });
    expect(alice.creditLimit).toBe('1000.00');
    await expect(balanceOf(h, alice.id)).resolves.toBe('0.00');
    expect(h.auditLog.create).toHaveBeenCalled();
    await expect(h.partiesSvc.createParty({ name: 'X', type: 'CUSTOMER' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(h.partiesSvc.createParty({ name: 'Nope', type: 'FRIEND' as never })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(h.partiesSvc.createParty({ name: 'Neg', type: 'SUPPLIER', creditLimit: '-5.00' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(h.partiesSvc.getParty('ghost')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(h.partiesSvc.listParties('NOPE')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const bob = await h.partiesSvc.createParty({ name: 'Bob', type: 'SUPPLIER' });
    expect((await h.partiesSvc.listParties('SUPPLIER')).map((p) => p.name)).toEqual(['Bob']);
    expect((await h.partiesSvc.listParties()).map((p) => p.name).sort()).toEqual(['Alice', 'Bob']);
  });

  it('tracks customer debit/credit postings with balance snapshots', async () => {
    const h = await seeded();
    const { alice } = await customerFlow(h);
    await expect(balanceOf(h, alice.id)).resolves.toBe('250.00');
  });

  it('enforces credit limits on customer debits (0 = unlimited)', async () => {
    const h = await seeded();
    const { alice, invoice } = await customerFlow(h);
    const extra = await h.posting.post({
      documentType: 'SALE_INVOICE',
      documentId: 'inv-2',
      description: 'Big ticket',
      postingDate: SEP_2026,
      lines: [
        { accountCode: '11000', debit: '800.00' },
        { accountCode: '40000', credit: '800.00' },
      ],
    });
    const arLine = extra.lines.find((l) => l.accountCode === '11000');
    if (!arLine) throw new Error('AR line missing');
    // 250 + 800 = 1050 > 1000 → blocked with exact figures.
    await expect(
      h.subledger.recordSubledgerEntry({ partyId: alice.id, journalLineId: arLine.id, entryType: 'INVOICE_CHARGE', amount: '800.00', isDebit: true }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Credit limit exceeded for customer Alice. Limit: 1000.00, Projected Balance: 1050.00.',
    });
    expect(invoice.entryNumber).toBe('JRN-000001');

    const eve = await h.partiesSvc.createParty({ name: 'Eve', type: 'CUSTOMER', creditLimit: '0.00' });
    const big = await h.posting.post({
      documentType: 'SALE_INVOICE',
      documentId: 'inv-9',
      description: 'Whale',
      postingDate: SEP_2026,
      lines: [
        { accountCode: '11000', debit: '5000.00' },
        { accountCode: '40000', credit: '5000.00' },
      ],
    });
    const bigLine = big.lines.find((l) => l.accountCode === '11000');
    if (!bigLine) throw new Error('big line missing');
    await h.subledger.recordSubledgerEntry({ partyId: eve.id, journalLineId: bigLine.id, entryType: 'INVOICE_CHARGE', amount: '5000.00', isDebit: true });
    await expect(balanceOf(h, eve.id)).resolves.toBe('5000.00');
  });

  it('tracks supplier payables with inverted direction', async () => {
    const h = await seeded();
    const { bob } = await supplierFlow(h);
    await expect(balanceOf(h, bob.id)).resolves.toBe('200.00');
  });

  it('treats BOTH parties receivable-side and filters listings', async () => {
    const h = await seeded();
    const both = await h.partiesSvc.createParty({ name: 'Dual', type: 'BOTH' });
    const invoice = await h.posting.post({
      documentType: 'SALE_INVOICE',
      documentId: 'inv-b',
      description: 'Dual sale',
      postingDate: SEP_2026,
      lines: [
        { accountCode: '11000', debit: '60.00' },
        { accountCode: '40000', credit: '60.00' },
      ],
    });
    const arLine = invoice.lines.find((l) => l.accountCode === '11000');
    if (!arLine) throw new Error('AR line missing');
    await h.subledger.recordSubledgerEntry({ partyId: both.id, journalLineId: arLine.id, entryType: 'INVOICE_CHARGE', amount: '60.00', isDebit: true });
    await expect(balanceOf(h, both.id)).resolves.toBe('60.00');
    expect((await h.partiesSvc.listParties('BOTH')).map((p) => p.name)).toEqual(['Dual']);
  });

  it('rejects duplicate lines, bad types and non-positive amounts', async () => {
    const h = await seeded();
    const { alice, invoice } = await customerFlow(h);
    const arLine = invoice.lines.find((l) => l.accountCode === '11000');
    if (!arLine) throw new Error('AR line missing');
    await expect(
      h.subledger.recordSubledgerEntry({ partyId: alice.id, journalLineId: arLine.id, entryType: 'PAYMENT', amount: '1.00', isDebit: false }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      h.subledger.recordSubledgerEntry({ partyId: alice.id, journalLineId: 'fresh-1', entryType: 'MYSTERY', amount: '1.00', isDebit: true }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      h.subledger.recordSubledgerEntry({ partyId: alice.id, journalLineId: 'fresh-2', entryType: 'PAYMENT', amount: '0.00', isDebit: false }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('updates credit limits with audit', async () => {
    const h = await seeded();
    const alice = await h.partiesSvc.createParty({ name: 'Alice', type: 'CUSTOMER', creditLimit: '1000.00' });
    const updated = await h.partiesSvc.updateCreditLimit(alice.id, '2500.00', 'u-admin');
    expect(updated.creditLimit).toBe('2500.00');
    await expect(h.partiesSvc.updateCreditLimit(alice.id, '-1.00')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(h.partiesSvc.updateCreditLimit('ghost', '5.00')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('reconciles AR and AP control accounts to exact parity', async () => {
    const h = await seeded();
    await customerFlow(h);
    await supplierFlow(h);
    await expect(h.recon.reconcileCustomerReceivables()).resolves.toEqual({
      isBalanced: true,
      glControlBalance: '250.00',
      subledgerSum: '250.00',
      discrepancy: '0.00',
    });
    await expect(h.recon.reconcileSupplierPayables()).resolves.toEqual({
      isBalanced: true,
      glControlBalance: '200.00',
      subledgerSum: '200.00',
      discrepancy: '0.00',
    });
  });

  it('detects subledger/GL drift from bypass writes', async () => {
    const h = await seeded();
    await customerFlow(h);
    // Bypass write with no GL leg (impossible through services — the FK
    // would reject it in production; the fake permits simulating the
    // exact drift state this report exists to catch).
    const carol = await h.partiesSvc.createParty({ name: 'Carol', type: 'CUSTOMER' });
    await h.subledger.recordSubledgerEntry({ partyId: carol.id, journalLineId: 'ghost-line', entryType: 'OPENING_BALANCE', amount: '75.00', isDebit: true });
    await expect(h.recon.reconcileCustomerReceivables()).resolves.toEqual({
      isBalanced: false,
      glControlBalance: '250.00',
      subledgerSum: '325.00',
      discrepancy: '75.00',
    });
  });
});
