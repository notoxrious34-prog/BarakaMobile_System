import { ChartOfAccountsService } from '../chart-of-accounts.service';
import { FiscalPeriodService } from '../fiscal-period.service';
import { DocumentNumberService } from '../../core/document-number.service';
import { AuditService } from '../../core/audit.service';
import { TransactionOrchestrator } from '../../core/transaction-orchestrator';
import { PostingService } from '../posting.service';
import { ReconciliationService } from '../reconciliation.service';
import { FinancialStatementsService } from '../financial-statements.service';
import { PeriodClosingService } from '../period-closing.service';
import type { PrismaService } from '../../prisma/prisma.service';

/* ------------------------------------------------------------------ */
/* In-memory Prisma fake — mirrors the Stage 2.2 suite conventions,   */
/* plus documentType negation for the closing-entry exclusion.         */
/* ------------------------------------------------------------------ */

const SEP_2026 = new Date(2026, 8, 15, 12, 0, 0);
const SEP_START = new Date(2026, 8, 1, 0, 0, 0, 0);
const SEP_END = new Date(2026, 8, 30, 23, 59, 59, 999);

function setup() {
  const coaRows = new Map<string, any>();
  const periodsById = new Map<string, any>();
  const periodsByName = new Map<string, any>();
  const entries = new Map<string, any>();
  const lines = new Map<string, any>();
  const auditRows: any[] = [];
  const seqLast = new Map<string, number>();
  let seq = 0;
  let fpSeq = 0;

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
          if (je.postingDate?.gte && entry.postingDate < je.postingDate.gte) return false;
          if (typeof je.documentType === 'string' && entry.documentType !== je.documentType) return false;
          if (je.documentType?.not && entry.documentType === je.documentType.not) return false;
          return true;
        });
      }
      rows = [...rows].sort((a, b) => (a.accountCode < b.accountCode ? -1 : 1));
      if (include?.account) return rows.map((l) => ({ ...l, account: coaRows.get(l.accountCode) }));
      return rows;
    }),
    count: jest.fn(async () => lines.size),
  };

  const auditLog = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `audit-${auditRows.length + 1}`, createdAt: new Date(), ...data };
      auditRows.push(row);
      return row;
    }),
  };

  const prisma: any = { chartOfAccount, fiscalPeriod, documentSequence, journalEntry, journalEntryLine, auditLog };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  const db = prisma as unknown as PrismaService;

  const coa = new ChartOfAccountsService(db);
  const periods = new FiscalPeriodService(db);
  const sequences = new DocumentNumberService(db);
  const audit = new AuditService(db);
  const orchestrator = new TransactionOrchestrator(db);
  const posting = new PostingService(db, coa, periods, sequences, audit, orchestrator);
  const reconciliation = new ReconciliationService(db);
  const statements = new FinancialStatementsService(db, periods);
  const closing = new PeriodClosingService(db, orchestrator, periods, posting, reconciliation, audit);

  return { db, coa, periods, posting, reconciliation, statements, closing, entries, lines, auditRows };
}

async function seeded() {
  const h = setup();
  await h.coa.seedStandardAccounts();
  return h;
}

/** Posts the profitable September scenario shared by tests 1-4. */
async function postProfitableSeptember(h: Awaited<ReturnType<typeof seeded>>) {
  const post = (documentType: string, description: string, legs: Array<[string, string, string]>) =>
    h.posting.post({
      documentType,
      description,
      postingDate: SEP_2026,
      actorUserId: 'u-cashier',
      lines: legs.map(([accountCode, side, amount]) =>
        side === 'Dr' ? { accountCode, debit: amount } : { accountCode, credit: amount },
      ),
    });
  await post('MANUAL', 'Stock purchase', [['12000', 'Dr', '1000.00'], ['10200', 'Cr', '1000.00']]);
  await post('MANUAL', 'Parts purchase', [['12200', 'Dr', '500.00'], ['10200', 'Cr', '500.00']]);
  await post('SALE_INVOICE', 'Device sale', [['10000', 'Dr', '1000.00'], ['40000', 'Cr', '1000.00']]);
  await post('SALE_INVOICE', 'Repair labor', [['10000', 'Dr', '500.00'], ['40200', 'Cr', '500.00']]);
  await post('SALE_INVOICE', 'Flexy margin', [['10000', 'Dr', '150.00'], ['40300', 'Cr', '150.00']]);
  await post('SALE_INVOICE', 'Goods COGS', [['50000', 'Dr', '600.00'], ['12000', 'Cr', '600.00']]);
  await post('SALE_INVOICE', 'Consumed parts', [['50100', 'Dr', '200.00'], ['12200', 'Cr', '200.00']]);
  await post('EXPENSE', 'General expenses', [['50400', 'Dr', '100.00'], ['10000', 'Cr', '100.00']]);
}

describe('stage 8 financial statements and period closing (DIRECTIVE-017)', () => {
  it('builds an exact income statement: revenue 1650, COGS 800, gross 850, expenses 100, net 750', async () => {
    const h = await seeded();
    await postProfitableSeptember(h);
    const report = await h.statements.getIncomeStatement({ startDate: SEP_START, endDate: SEP_END });
    expect(report.revenues.map((l) => [l.accountCode, l.balance])).toEqual([
      ['40000', '1000.00'],
      ['40200', '500.00'],
      ['40300', '150.00'],
    ]);
    expect(report.totalRevenue).toBe('1650.00');
    expect(report.cogs.map((l) => [l.accountCode, l.balance])).toEqual([
      ['50000', '600.00'],
      ['50100', '200.00'],
    ]);
    expect(report.totalCogs).toBe('800.00');
    expect(report.grossProfit).toBe('850.00');
    expect(report.expenses.map((l) => [l.accountCode, l.balance])).toEqual([['50400', '100.00']]);
    expect(report.totalExpenses).toBe('100.00');
    expect(report.netIncome).toBe('750.00');
  });

  it('builds a balanced sheet: assets 750 == liabilities 0 + equity 750', async () => {
    const h = await seeded();
    await postProfitableSeptember(h);
    const sheet = await h.statements.getBalanceSheet({ asOfDate: SEP_END });
    expect(sheet.balanced).toBe(true);
    expect(sheet.totalAssets).toBe('750.00');
    expect(sheet.totalLiabilities).toBe('0.00');
    expect(sheet.currentNetIncome).toBe('750.00');
    expect(sheet.totalEquity).toBe('750.00');
    const byCode = new Map(sheet.assets.map((l) => [l.accountCode, l.balance]));
    expect(byCode.get('10000')).toBe('1550.00');
    expect(byCode.get('12000')).toBe('400.00');
  });

  it('closes a profitable period: nominals zeroed, 30100 credited 750, status CLOSED', async () => {
    const h = await seeded();
    await postProfitableSeptember(h);
    const period = await h.periods.getOrCreatePeriodForDate(SEP_2026);
    const result = await h.closing.closeFiscalPeriod({ periodId: period.id, actorUserId: 'u-admin' });
    expect(result.netIncome).toBe('750.00');
    expect(result.status).toBe('CLOSED');
    expect(result.hadNominalActivity).toBe(true);
    expect(result.closingJournalEntryId).toBeTruthy();
    expect(result.closingJournalNumber).toMatch(/^JRN-/);

    const closingEntry = [...h.entries.values()].find((e: any) => e.documentType === 'PERIOD_CLOSING');
    expect(closingEntry.description).toContain('2026-09');
    const closingLegs = [...h.lines.values()]
      .filter((l: any) => l.journalEntryId === closingEntry.id)
      .map((l: any) => [l.accountCode, l.debit, l.credit])
      .sort();
    let dr = 0;
    let cr = 0;
    for (const [, d, c] of closingLegs) {
      dr += Number(d);
      cr += Number(c);
    }
    expect(dr).toBe(cr);
    expect(closingLegs).toContainEqual(['30100', '0.00', '750.00']);

    const after = await h.statements.getIncomeStatement({ periodId: period.id });
    expect(after.totalRevenue).toBe('0.00');
    expect(after.totalCogs).toBe('0.00');
    expect(after.totalExpenses).toBe('0.00');
    expect(after.netIncome).toBe('0.00');

    const trial = await h.reconciliation.getTrialBalance(SEP_END);
    expect(trial.isBalanced).toBe(true);
    expect(trial.accounts.find((a) => a.accountCode === '30100')?.netBalance).toBe('750.00');

    const sheet = await h.statements.getBalanceSheet({ periodId: period.id });
    expect(sheet.balanced).toBe(true);
    expect(sheet.retainedEarnings).toBe('750.00');
    expect(sheet.totalAssets).toBe(sheet.totalEquity);
  });

  it('rejects postings into a closed period with FISCAL_PERIOD_CLOSED', async () => {
    const h = await seeded();
    await postProfitableSeptember(h);
    const period = await h.periods.getOrCreatePeriodForDate(SEP_2026);
    await h.closing.closeFiscalPeriod({ periodId: period.id });
    await expect(
      h.posting.post({
        documentType: 'SALE_INVOICE',
        description: 'Late sale',
        postingDate: SEP_2026,
        lines: [
          { accountCode: '10000', debit: '10.00' },
          { accountCode: '40000', credit: '10.00' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'FISCAL_PERIOD_CLOSED' });
    await expect(h.closing.closeFiscalPeriod({ periodId: period.id })).rejects.toMatchObject({
      code: 'FISCAL_PERIOD_CLOSED',
    });
  });

  it('closes a loss period: 30100 debited 400 and the sheet still balances', async () => {
    const h = await seeded();
    await h.posting.post({
      documentType: 'SALE_INVOICE',
      description: 'Tiny sale',
      postingDate: SEP_2026,
      lines: [
        { accountCode: '10000', debit: '100.00' },
        { accountCode: '40400', credit: '100.00' },
      ],
    });
    await h.posting.post({
      documentType: 'EXPENSE',
      description: 'Heavy expenses',
      postingDate: SEP_2026,
      lines: [
        { accountCode: '50400', debit: '500.00' },
        { accountCode: '10000', credit: '500.00' },
      ],
    });
    const period = await h.periods.getOrCreatePeriodForDate(SEP_2026);
    const result = await h.closing.closeFiscalPeriod({ periodId: period.id, actorUserId: 'u-admin' });
    expect(result.netIncome).toBe('-400.00');

    const closingEntry = [...h.entries.values()].find((e: any) => e.documentType === 'PERIOD_CLOSING');
    const closingLegs = [...h.lines.values()]
      .filter((l: any) => l.journalEntryId === closingEntry.id)
      .map((l: any) => [l.accountCode, l.debit, l.credit]);
    expect(closingLegs).toContainEqual(['30100', '400.00', '0.00']);

    const trial = await h.reconciliation.getTrialBalance(SEP_END);
    expect(trial.isBalanced).toBe(true);
    expect(trial.accounts.find((a) => a.accountCode === '30100')?.netBalance).toBe('-400.00');

    const sheet = await h.statements.getBalanceSheet({ periodId: period.id });
    expect(sheet.balanced).toBe(true);
    expect(sheet.totalAssets).toBe(sheet.totalEquity);
  });
});
