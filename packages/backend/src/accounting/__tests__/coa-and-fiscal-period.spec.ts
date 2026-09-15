import { ChartOfAccountsService, STANDARD_ACCOUNTS } from '../chart-of-accounts.service';
import { FiscalPeriodService } from '../fiscal-period.service';
import { FiscalPeriodClosedError } from '../../core/result';
import type { PrismaService } from '../../prisma/prisma.service';

/* ------------------------------------------------------------------ */
/* In-memory Prisma fakes — the suite never touches a real database.   */
/* ------------------------------------------------------------------ */

function makeCoaPrisma() {
  const rows = new Map<string, any>();
  const chartOfAccount = {
    rows,
    upsert: jest.fn(async ({ create, update }: any) => {
      const merged = { isControl: false, isActive: true, ...rows.get(create.accountCode), ...create, ...update };
      rows.set(create.accountCode, merged);
      return merged;
    }),
    findUnique: jest.fn(async ({ where }: any) => rows.get(where.accountCode) ?? null),
    findMany: jest.fn(async ({ where }: any) => {
      const all = [...rows.values()].sort((a, b) => (a.accountCode < b.accountCode ? -1 : 1));
      if (where?.type) return all.filter((r) => r.type === where.type);
      return all;
    }),
  };
  return { chartOfAccount } as unknown as PrismaService;
}

function makeFiscalPrisma() {
  const byId = new Map<string, any>();
  const byName = new Map<string, any>();
  let seq = 0;
  const fiscalPeriod = {
    findUnique: jest.fn(async ({ where }: any) => {
      if (where.id) return byId.get(where.id) ?? null;
      if (where.periodName) return byName.get(where.periodName) ?? null;
      return null;
    }),
    create: jest.fn(async ({ data }: any) => {
      if (byName.has(data.periodName)) {
        const dup: any = new Error(`Unique constraint failed on the fields: (periodName)`);
        dup.code = 'P2002';
        throw dup;
      }
      seq += 1;
      const row = { id: `fp-${seq}`, status: 'OPEN', closedAt: null, ...data };
      byId.set(row.id, row);
      byName.set(row.periodName, row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = byId.get(where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    }),
  };
  return { fiscalPeriod } as unknown as PrismaService;
}

describe('stage 2.1 COA and fiscal periods (TASK BRIEF-009)', () => {
  describe('ChartOfAccountsService', () => {
    it('seeds exactly the 25 standard accounts, idempotently', async () => {
      const prisma = makeCoaPrisma();
      const svc = new ChartOfAccountsService(prisma);
      expect(await svc.seedStandardAccounts()).toBe(25);
      const first = await svc.listAccounts();
      expect(first).toHaveLength(25);
      expect(await svc.seedStandardAccounts()).toBe(25);
      const second = await svc.listAccounts();
      expect(second).toHaveLength(25);
      expect(second).toEqual(first);
      expect(new Set(second.map((a) => a.accountCode)).size).toBe(25);
    });

    it('classifies the mandated code skeleton per class', async () => {
      const svc = new ChartOfAccountsService(makeCoaPrisma());
      await svc.seedStandardAccounts();
      const codes = async (type: string) => (await svc.listAccounts(type)).map((a) => a.accountCode);
      expect(await codes('ASSET')).toEqual(['10000', '10100', '10200', '10300', '11000', '12000', '12100', '12200']);
      expect(await codes('LIABILITY')).toEqual(['20000', '21000', '22000']);
      expect(await codes('EQUITY')).toEqual(['30000', '30100', '30200', '30300']);
      expect(await codes('REVENUE')).toEqual(['40000', '40100', '40200', '40300', '40400']);
      expect(await codes('EXPENSE')).toEqual(['50000', '50100', '50200', '50300', '50400']);
      expect(STANDARD_ACCOUNTS).toHaveLength(25);
    });

    it('applies normal-balance rules and control flags', async () => {
      const svc = new ChartOfAccountsService(makeCoaPrisma());
      await svc.seedStandardAccounts();
      for (const type of ['ASSET', 'EXPENSE']) {
        for (const account of await svc.listAccounts(type)) {
          expect(account.normalBalance).toBe('DEBIT');
        }
      }
      for (const type of ['LIABILITY', 'EQUITY', 'REVENUE']) {
        for (const account of await svc.listAccounts(type)) {
          expect(account.normalBalance).toBe('CREDIT');
        }
      }
      expect(await svc.isControlAccount('11000')).toBe(true);
      expect(await svc.isControlAccount('20000')).toBe(true);
      expect(await svc.isControlAccount('10000')).toBe(false);
      expect(await svc.isControlAccount('40000')).toBe(false);
      const all = await svc.listAccounts();
      expect(all.filter((a) => a.isControl).map((a) => a.accountCode).sort()).toEqual(['11000', '20000']);
    });

    it('getAccount resolves, rejects unknown codes and bad filters', async () => {
      const svc = new ChartOfAccountsService(makeCoaPrisma());
      await svc.seedStandardAccounts();
      expect((await svc.getAccount('10100')).name).toBe('Digital Wallets Float');
      await expect(svc.getAccount('99999')).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(svc.listAccounts('NOPE')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  describe('FiscalPeriodService', () => {
    it('auto-creates the OPEN month covering the given date', async () => {
      const svc = new FiscalPeriodService(makeFiscalPrisma());
      const period = await svc.getOrCreatePeriodForDate(new Date(2026, 8, 15, 12, 0, 0));
      expect(period.periodName).toBe('2026-09');
      expect(period.status).toBe('OPEN');
      expect(period.startDate).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0));
      expect(period.endDate).toEqual(new Date(2026, 8, 30, 23, 59, 59, 999));
      // Second call returns the same row, no duplicate.
      const again = await svc.getOrCreatePeriodForDate(new Date(2026, 8, 28));
      expect(again.id).toBe(period.id);
    });

    it('walks OPEN -> CLOSED -> LOCKED and blocks posting once closed', async () => {
      const svc = new FiscalPeriodService(makeFiscalPrisma());
      const period = await svc.getOrCreatePeriodForDate(new Date(2026, 0, 10));
      await expect(svc.assertPeriodOpenForPosting(period.id)).resolves.toMatchObject({ status: 'OPEN' });

      const closed = await svc.closePeriod(period.id);
      expect(closed.status).toBe('CLOSED');
      expect(closed.closedAt).toBeInstanceOf(Date);
      await expect(svc.assertPeriodOpenForPosting(period.id)).rejects.toBeInstanceOf(FiscalPeriodClosedError);

      const locked = await svc.lockPeriod(period.id);
      expect(locked.status).toBe('LOCKED');
      await expect(svc.assertPeriodOpenForPosting(period.id)).rejects.toBeInstanceOf(FiscalPeriodClosedError);
    });

    it('rejects locking an OPEN period and closing a LOCKED one', async () => {
      const svc = new FiscalPeriodService(makeFiscalPrisma());
      const period = await svc.getOrCreatePeriodForDate(new Date(2026, 1, 10));
      await expect(svc.lockPeriod(period.id)).rejects.toMatchObject({ code: 'CONFLICT' });
      await svc.closePeriod(period.id);
      await svc.lockPeriod(period.id);
      await expect(svc.closePeriod(period.id)).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('reopens CLOSED -> OPEN but never LOCKED', async () => {
      const svc = new FiscalPeriodService(makeFiscalPrisma());
      const period = await svc.getOrCreatePeriodForDate(new Date(2026, 2, 10));
      await svc.closePeriod(period.id);
      const reopened = await svc.reopenPeriod(period.id);
      expect(reopened.status).toBe('OPEN');
      expect(reopened.closedAt).toBeNull();
      await expect(svc.assertPeriodOpenForPosting(period.id)).resolves.toBeDefined();

      await svc.closePeriod(period.id);
      await svc.lockPeriod(period.id);
      await expect(svc.reopenPeriod(period.id)).rejects.toBeInstanceOf(FiscalPeriodClosedError);
      // Still locked afterwards.
      await expect(svc.assertPeriodOpenForPosting(period.id)).rejects.toBeInstanceOf(FiscalPeriodClosedError);
    });
  });
});
