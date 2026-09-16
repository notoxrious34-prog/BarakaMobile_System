import { ChartOfAccountsService } from '../../../accounting/chart-of-accounts.service';
import { FiscalPeriodService } from '../../../accounting/fiscal-period.service';
import { DocumentNumberService } from '../../../core/document-number.service';
import { AuditService } from '../../../core/audit.service';
import { TransactionOrchestrator } from '../../../core/transaction-orchestrator';
import { PostingService } from '../../../accounting/posting.service';
import { CashShiftOrchestratorService } from '../cash-shift-orchestrator.service';
import {
  ActiveShiftExistsError,
  ShiftClosedError,
} from '../shifts.errors';
import type { PrismaService } from '../../../prisma/prisma.service';

/* ------------------------------------------------------------------ */
/* Full-stack fake with snapshot-rollback transactions (Stage 5.1 set).*/
/* ------------------------------------------------------------------ */

function setup() {
  const coaRows = new Map<string, any>();
  const periodsById = new Map<string, any>();
  const periodsByName = new Map<string, any>();
  const entries = new Map<string, any>();
  const lines = new Map<string, any>();
  const registers = new Map<string, any>();
  const shifts = new Map<string, any>();
  const movements: any[] = [];
  const auditRows: any[] = [];
  const seqLast = new Map<string, number>();
  let seq = 0;
  let fpSeq = 0;
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

  const cashRegister = {
    create: jest.fn(async ({ data }: any) => {
      const row = {
        id: `reg-${registers.size + 1}`, isActive: true, currentShiftId: null,
        createdAt: new Date(), updatedAt: new Date(), ...data,
      };
      registers.set(row.id, row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }: any) => registers.get(where.id) ?? null),
    update: jest.fn(async ({ where, data }: any) => {
      const row = registers.get(where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    }),
  };

  const cashShift = {
    create: jest.fn(async ({ data }: any) => {
      const row = {
        id: `sh-${shifts.size + 1}`, status: 'OPEN', openedAt: new Date(), closedAt: null,
        openingCash: '0.00', totalCashIn: '0.00', totalCashOut: '0.00', totalSalesCash: '0.00',
        expectedCash: '0.00', actualCash: null, differenceAmount: '0.00', discrepancyJournalId: null,
        notes: null, createdAt: new Date(), updatedAt: new Date(), ...data,
      };
      shifts.set(row.id, row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }: any) => shifts.get(where.id) ?? null),
    update: jest.fn(async ({ where, data }: any) => {
      const row = shifts.get(where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    }),
  };

  const shiftCashMovement = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `sm-${movements.length + 1}`, journalEntryId: null, createdAt: tick(), ...data };
      movements.push(row);
      return row;
    }),
    findMany: jest.fn(async ({ where }: any = {}) => {
      let rows = [...movements];
      if (where?.shiftId) rows = rows.filter((m) => m.shiftId === where.shiftId);
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

  const prisma: any = {
    chartOfAccount, fiscalPeriod, documentSequence, journalEntry, journalEntryLine,
    cashRegister, cashShift, shiftCashMovement, auditLog,
  };
  prisma.$transaction = jest.fn(async (fn: any) => {
    const snap = {
      entries: new Map(entries), lines: new Map(lines),
      registers: new Map([...registers].map(([k, v]) => [k, { ...v }])),
      shifts: new Map([...shifts].map(([k, v]) => [k, { ...v }])),
      movements: movements.map((m) => ({ ...m })),
      periodsById: new Map(periodsById), periodsByName: new Map(periodsByName),
      seqLast: new Map(seqLast), auditLen: auditRows.length,
    };
    try {
      return await fn(prisma);
    } catch (error) {
      for (const [store, saved] of [
        [entries, snap.entries], [lines, snap.lines],
        [registers, snap.registers], [shifts, snap.shifts],
        [periodsById, snap.periodsById], [periodsByName, snap.periodsByName], [seqLast, snap.seqLast],
      ] as Array<[Map<string, any>, Map<string, any>]>) {
        store.clear();
        for (const [k, v] of saved) store.set(k, v);
      }
      movements.length = 0;
      for (const m of snap.movements) movements.push(m);
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
  const drawer = new CashShiftOrchestratorService(db, orchestrator, sequences, posting, audit);

  return { db, coa, drawer, registers, shifts, movements, entries, lines };
}

async function seeded() {
  const h = setup();
  await h.coa.seedStandardAccounts();
  const register = await (h.db as any).cashRegister.create({ data: { name: 'Main Counter' } });
  return { ...h, register };
}

function legsOf(h: Awaited<ReturnType<typeof seeded>>, journalId: string): Map<string, [string, string]> {
  const map = new Map<string, [string, string]>();
  for (const l of h.lines.values()) {
    if (l.journalEntryId === journalId) map.set(l.accountCode, [l.debit, l.credit]);
  }
  return map;
}

describe('stage 7.1 cash shifts (DIRECTIVE-015)', () => {
  it('walks open -> drawer in -> petty cash -> exact close with no discrepancy', async () => {
    const h = await seeded();
    const shift = await h.drawer.openShift({ registerId: h.register.id, cashierUserId: 'u-sara', openingCash: '200.00' });
    expect(shift).toMatchObject({ shiftNumber: 'SHF-000001', status: 'OPEN', openingCash: '200.00', expectedCash: '200.00' });
    expect((await (h.db as any).cashRegister.findUnique({ where: { id: h.register.id } })).currentShiftId).toBe(shift.id);

    await h.drawer.recordMovement({ shiftId: shift.id, movementType: 'DRAWER_IN', amount: '50.00', reason: 'Change top-up', actorUserId: 'u-sara' });
    expect(((await (h.db as any).cashShift.findUnique({ where: { id: shift.id } })) as any).expectedCash).toBe('250.00');

    const petty = await h.drawer.recordMovement({ shiftId: shift.id, movementType: 'PETTY_CASH', amount: '30.00', reason: 'Cleaning supplies', actorUserId: 'u-sara' });
    expect(petty.journalEntryId).not.toBeNull();
    const pettyLegs = legsOf(h, petty.journalEntryId as string);
    expect(pettyLegs.get('50400')).toEqual(['30.00', '0.00']);
    expect(pettyLegs.get('10000')).toEqual(['0.00', '30.00']);
    const mid = (await (h.db as any).cashShift.findUnique({ where: { id: shift.id } })) as any;
    expect(mid.totalCashOut).toBe('30.00');
    expect(mid.expectedCash).toBe('220.00');

    const journalsBefore = h.entries.size;
    const closed = await h.drawer.closeShift({ shiftId: shift.id, actualCash: '220.00', actorUserId: 'u-sara' });
    expect(closed).toMatchObject({ status: 'CLOSED', actualCash: '220.00', differenceAmount: '0.00', discrepancyJournalId: null });
    expect(closed.closedAt).toBeInstanceOf(Date);
    expect(h.entries.size).toBe(journalsBefore);
    expect((await (h.db as any).cashRegister.findUnique({ where: { id: h.register.id } })).currentShiftId).toBeNull();
  });

  it('closes with a cash overage: Dr 10000 / Cr 40400', async () => {
    const h = await seeded();
    const shift = await h.drawer.openShift({ registerId: h.register.id, cashierUserId: 'u-sara', openingCash: '100.00' });
    const closed = await h.drawer.closeShift({ shiftId: shift.id, actualCash: '130.00', actorUserId: 'u-sara' });
    expect(closed.differenceAmount).toBe('30.00');
    expect(closed.discrepancyJournalId).not.toBeNull();
    const legs = legsOf(h, closed.discrepancyJournalId as string);
    expect(legs.get('10000')).toEqual(['30.00', '0.00']);
    expect(legs.get('40400')).toEqual(['0.00', '30.00']);
    let dr = 0;
    let cr = 0;
    for (const [d, c] of legs.values()) {
      dr += Number(d);
      cr += Number(c);
    }
    expect(dr).toBe(30);
    expect(cr).toBe(30);
    expect(dr).toBe(cr);
  });

  it('closes with a cash shortage: Dr 50300 / Cr 10000', async () => {
    const h = await seeded();
    const shift = await h.drawer.openShift({ registerId: h.register.id, cashierUserId: 'u-sara', openingCash: '100.00' });
    const closed = await h.drawer.closeShift({ shiftId: shift.id, actualCash: '70.00', actorUserId: 'u-sara' });
    expect(closed.differenceAmount).toBe('-30.00');
    expect(closed.discrepancyJournalId).not.toBeNull();
    const legs = legsOf(h, closed.discrepancyJournalId as string);
    expect(legs.get('50300')).toEqual(['30.00', '0.00']);
    expect(legs.get('10000')).toEqual(['0.00', '30.00']);
  });

  it('blocks unknown registers and double-open shifts on one register', async () => {
    const h = await seeded();
    await expect(
      h.drawer.openShift({ registerId: 'ghost', cashierUserId: 'u-sara', openingCash: '0.00' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await h.drawer.openShift({ registerId: h.register.id, cashierUserId: 'u-sara', openingCash: '0.00' });
    await expect(
      h.drawer.openShift({ registerId: h.register.id, cashierUserId: 'u-amine', openingCash: '0.00' }),
    ).rejects.toBeInstanceOf(ActiveShiftExistsError);
  });

  it('locks closed shifts against movements and re-closing', async () => {
    const h = await seeded();
    const shift = await h.drawer.openShift({ registerId: h.register.id, cashierUserId: 'u-sara', openingCash: '50.00' });
    await h.drawer.closeShift({ shiftId: shift.id, actualCash: '50.00', actorUserId: 'u-sara' });
    await expect(
      h.drawer.recordMovement({ shiftId: shift.id, movementType: 'DRAWER_IN', amount: '10.00', reason: 'Late top-up', actorUserId: 'u-sara' }),
    ).rejects.toBeInstanceOf(ShiftClosedError);
    await expect(
      h.drawer.closeShift({ shiftId: shift.id, actualCash: '50.00', actorUserId: 'u-sara' }),
    ).rejects.toBeInstanceOf(ShiftClosedError);
    // The register is free again: a fresh shift opens cleanly after close.
    const next = await h.drawer.openShift({ registerId: h.register.id, cashierUserId: 'u-amine', openingCash: '0.00' });
    expect(next.shiftNumber).toBe('SHF-000002');
  });
});
