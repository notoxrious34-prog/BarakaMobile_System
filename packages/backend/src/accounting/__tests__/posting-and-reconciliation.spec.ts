import { ChartOfAccountsService } from '../chart-of-accounts.service';
import { FiscalPeriodService } from '../fiscal-period.service';
import { DocumentNumberService } from '../../core/document-number.service';
import { AuditService } from '../../core/audit.service';
import { TransactionOrchestrator } from '../../core/transaction-orchestrator';
import { PostingService } from '../posting.service';
import { ReversalService } from '../reversal.service';
import { ReconciliationService } from '../reconciliation.service';
import type { PrismaService } from '../../prisma/prisma.service';

/* ------------------------------------------------------------------ */
/* In-memory Prisma fake — the suite never touches a real database.    */
/* ------------------------------------------------------------------ */

const SEP_2026 = new Date(2026, 8, 15, 12, 0, 0);

function setup() {
  const coaRows = new Map<string, any>();
  const periodsById = new Map<string, any>();
  const periodsByName = new Map<string, any>();
  const entries = new Map<string, any>();
  const lines = new Map<string, any>();
  const auditRows: any[] = [];
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

  const seqLast = new Map<string, number>();
  const documentSequence = {
    upsert: jest.fn(async ({ where, update, create }: any): Promise<{ prefix: string; lastNumber: number; updatedAt: Date }> => {
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
      if (include?.lines) {
        return { ...entry, lines: [...lines.values()].filter((l) => l.journalEntryId === entry.id) };
      }
      return entry;
    }),
    findMany: jest.fn(async ({ where, include }: any = {}) => {
      let rows = [...entries.values()];
      if (where?.status) rows = rows.filter((e) => e.status === where.status);
      if (where?.id) rows = rows.filter((e) => e.id === where.id);
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
  const reversal = new ReversalService(db, posting, orchestrator);
  const reconciliation = new ReconciliationService(db);

  return { db, coa, coaRows, periods, posting, reversal, reconciliation, auditLog, auditRows };
}

async function seeded() {
  const harness = setup();
  await harness.coa.seedStandardAccounts();
  return harness;
}

describe('stage 2.2 posting, reversals and reconciliation (TASK BRIEF-010)', () => {
  it('posts a balanced entry with gapless JRN numbering and audit trail', async () => {
    const h = await seeded();
    const first = await h.posting.post({
      documentType: 'SALE_INVOICE',
      documentId: 'inv-1',
      description: 'Counter sale',
      postingDate: SEP_2026,
      actorUserId: 'u-admin',
      lines: [
        { accountCode: '10000', debit: '250.00' },
        { accountCode: '40000', credit: '250.00' },
      ],
    });
    expect(first.entryNumber).toBe('JRN-000001');
    expect(first.status).toBe('POSTED');
    expect(first.lines).toHaveLength(2);
    expect(first.lines.map((l) => [l.accountCode, l.debit, l.credit])).toEqual([
      ['10000', '250.00', '0.00'],
      ['40000', '0.00', '250.00'],
    ]);
    expect(first.fiscalPeriodId).toBeTruthy();
    expect(h.auditLog.create).toHaveBeenCalledTimes(1);

    const second = await h.posting.post({
      documentType: 'MANUAL',
      description: 'Second entry',
      postingDate: SEP_2026,
      lines: [
        { accountCode: '50200', debit: 75.5 },
        { accountCode: '10000', credit: 75.5 },
      ],
    });
    expect(second.entryNumber).toBe('JRN-000002');
    expect(second.lines[0].debit).toBe('75.50');
  });

  it('rejects unbalanced entries with LedgerImbalanceError', async () => {
    const h = await seeded();
    await expect(
      h.posting.post({
        documentType: 'SALE_INVOICE',
        description: 'Unbalanced',
        postingDate: SEP_2026,
        lines: [
          { accountCode: '10000', debit: '100.00' },
          { accountCode: '40000', credit: '90.00' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'LEDGER_IMBALANCE', message: expect.stringContaining('Debits: 100.00, Credits: 90.00') });
  });

  it('rejects single-line and zero-amount entries', async () => {
    const h = await seeded();
    await expect(
      h.posting.post({
        documentType: 'MANUAL',
        description: 'Solo',
        postingDate: SEP_2026,
        lines: [{ accountCode: '10000', debit: '10.00' }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      h.posting.post({
        documentType: 'MANUAL',
        description: 'Zeros',
        postingDate: SEP_2026,
        lines: [
          { accountCode: '10000', debit: '0.00' },
          { accountCode: '40000', credit: '0.00' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects lines carrying both debit and credit, negatives, and unknown/inactive accounts', async () => {
    const h = await seeded();
    const base = { documentType: 'MANUAL', description: 'X', postingDate: SEP_2026 };
    await expect(
      h.posting.post({ ...base, lines: [{ accountCode: '10000', debit: '5.00', credit: '5.00' }, { accountCode: '40000', credit: '5.00' }] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      h.posting.post({ ...base, lines: [{ accountCode: '10000', debit: '-5.00' }, { accountCode: '40000', credit: '5.00' }] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      h.posting.post({ ...base, lines: [{ accountCode: '99999', debit: '5.00' }, { accountCode: '40000', credit: '5.00' }] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    h.coaRows.get('40400').isActive = false;
    await expect(
      h.posting.post({ ...base, lines: [{ accountCode: '10000', debit: '5.00' }, { accountCode: '40400', credit: '5.00' }] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('forbids MANUAL posting to control accounts but allows subledger flows', async () => {
    const h = await seeded();
    await expect(
      h.posting.post({
        documentType: 'MANUAL',
        description: 'Sneaky',
        postingDate: SEP_2026,
        lines: [
          { accountCode: '11000', debit: '50.00' },
          { accountCode: '40000', credit: '50.00' },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Direct manual posting to control account 11000 is forbidden.',
    });
    // Same control account via a subledger document type posts fine.
    const entry = await h.posting.post({
      documentType: 'SALE_INVOICE',
      description: 'Credit sale',
      postingDate: SEP_2026,
      lines: [
        { accountCode: '11000', debit: '50.00' },
        { accountCode: '40000', credit: '50.00' },
      ],
    });
    expect(entry.entryNumber).toBe('JRN-000001');
  });

  it('blocks posting into CLOSED periods', async () => {
    const h = await seeded();
    const october = await h.periods.getOrCreatePeriodForDate(new Date(2026, 9, 5));
    expect(october.periodName).toBe('2026-10');
    await h.periods.closePeriod(october.id);
    await expect(
      h.posting.post({
        documentType: 'EXPENSE',
        description: 'Late bill',
        postingDate: new Date(2026, 9, 20),
        lines: [
          { accountCode: '50200', debit: '20.00' },
          { accountCode: '10000', credit: '20.00' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'FISCAL_PERIOD_CLOSED' });
  });

  it('reverses automatically: inverted lines, linkage, REVERSED mark, net-zero trial balance', async () => {
    const h = await seeded();
    const original = await h.posting.post({
      documentType: 'SALE_INVOICE',
      documentId: 'inv-9',
      description: 'Sale to reverse',
      postingDate: SEP_2026,
      lines: [
        { accountCode: '10000', debit: '250.00' },
        { accountCode: '40000', credit: '250.00' },
      ],
    });
    const reversal = await h.reversal.reverse(original.id, 'Customer returned goods', 'u-admin');
    expect(reversal.entryNumber).toBe('JRN-000002');
    expect(reversal.reversalOfId).toBe(original.id);
    expect(reversal.documentId).toBe('inv-9');
    expect(reversal.description).toBe(`Reversal of ${original.entryNumber}: Customer returned goods`);
    expect(reversal.lines.map((l) => [l.accountCode, l.debit, l.credit])).toEqual([
      ['10000', '0.00', '250.00'],
      ['40000', '250.00', '0.00'],
    ]);
    const stored = await h.db.journalEntry.findUnique({ where: { id: original.id } });
    expect(stored?.status).toBe('REVERSED');
    // Double reversal is rejected.
    await expect(h.reversal.reverse(original.id, 'Again')).rejects.toMatchObject({ code: 'CONFLICT' });

    const trial = await h.reconciliation.getTrialBalance(new Date(2026, 11, 31));
    expect(trial.isBalanced).toBe(true);
    expect(trial.imbalanceAmount).toBe('0.00');
    expect(trial.totalDebits).toBe('250.00');
    expect(trial.totalCredits).toBe('250.00');
    // TB covers POSTED lines only: the REVERSED original drops out, so the
    // report shows the reversal's mirror image — the exact inverse of the
    // original posting (net-zero PAIR impact, still balanced overall).
    const cash = trial.accounts.find((a) => a.accountCode === '10000');
    const revenue = trial.accounts.find((a) => a.accountCode === '40000');
    expect(cash).toMatchObject({ totalDebit: '0.00', totalCredit: '250.00', netBalance: '-250.00' });
    expect(revenue).toMatchObject({ totalDebit: '250.00', totalCredit: '0.00', netBalance: '-250.00' });
  });

  it('reports a healthy ledger: balanced trial balance and integrity', async () => {
    const h = await seeded();
    const original = await h.posting.post({
      documentType: 'SALE_INVOICE',
      description: 'Sale',
      postingDate: SEP_2026,
      lines: [
        { accountCode: '10000', debit: '100.00' },
        { accountCode: '40000', credit: '100.00' },
      ],
    });
    await h.reversal.reverse(original.id, 'Void sale');
    const trial = await h.reconciliation.getTrialBalance(new Date(2026, 11, 31));
    expect(trial.isBalanced).toBe(true);
    expect(trial.imbalanceAmount).toBe('0.00');
    const integrity = await h.reconciliation.verifyLedgerIntegrity();
    expect(integrity).toMatchObject({
      isHealthy: true,
      totalJournalEntries: 2,
      totalJournalLines: 4,
      unbalancedEntriesCount: 0,
      trialBalanceDiscrepancy: '0.00',
    });
    expect(integrity.checkedAt).toBeInstanceOf(Date);
  });
});
