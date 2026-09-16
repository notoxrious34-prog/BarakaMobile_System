import { ChartOfAccountsService } from '../../../accounting/chart-of-accounts.service';
import { FiscalPeriodService } from '../../../accounting/fiscal-period.service';
import { DocumentNumberService } from '../../../core/document-number.service';
import { AuditService } from '../../../core/audit.service';
import { TransactionOrchestrator } from '../../../core/transaction-orchestrator';
import { PostingService } from '../../../accounting/posting.service';
import { PartiesService } from '../../../parties/parties.service';
import { PartySubledgerService } from '../../../parties/party-subledger.service';
import { FlexyOrchestratorService } from '../flexy-orchestrator.service';
import { InsufficientWalletBalanceError } from '../wallets.errors';
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
  const wallets = new Map<string, any>();
  const topups: any[] = [];
  const transfers: any[] = [];
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

  const topUpWallet = {
    create: jest.fn(async ({ data }: any) => {
      const row = {
        id: `w-${wallets.size + 1}`, phoneNumber: null, balance: '0.00', minBalanceAlert: '0.00',
        isActive: true, createdAt: new Date(), updatedAt: new Date(), ...data,
      };
      wallets.set(row.id, row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }: any) => wallets.get(where.id) ?? null),
    update: jest.fn(async ({ where, data }: any) => {
      const row = wallets.get(where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    }),
  };

  const digitalServiceTransaction = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `flx-${topups.length + 1}`, createdAt: new Date(), ...data };
      topups.push(row);
      return row;
    }),
  };

  const floatTransferRecord = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `trf-${transfers.length + 1}`, createdAt: new Date(), ...data };
      transfers.push(row);
      return row;
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
    party, partySubledgerEntry, topUpWallet, digitalServiceTransaction, floatTransferRecord, auditLog,
  };
  prisma.$transaction = jest.fn(async (fn: any) => {
    const snap = {
      entries: new Map(entries), lines: new Map(lines),
      wallets: new Map([...wallets].map(([k, v]) => [k, { ...v }])),
      parties: new Map(parties),
      periodsById: new Map(periodsById), periodsByName: new Map(periodsByName),
      seqLast: new Map(seqLast),
      topupsLen: topups.length, transfersLen: transfers.length,
      subledgersLen: subledgers.length, auditLen: auditRows.length,
    };
    try {
      return await fn(prisma);
    } catch (error) {
      for (const [store, saved] of [
        [entries, snap.entries], [lines, snap.lines],
        [wallets, snap.wallets], [parties, snap.parties],
        [periodsById, snap.periodsById], [periodsByName, snap.periodsByName], [seqLast, snap.seqLast],
      ] as Array<[Map<string, any>, Map<string, any>]>) {
        store.clear();
        for (const [k, v] of saved) store.set(k, v);
      }
      topups.length = snap.topupsLen;
      transfers.length = snap.transfersLen;
      subledgers.length = snap.subledgersLen;
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
  const flexy = new FlexyOrchestratorService(db, orchestrator, sequences, posting, partiesSvc, subledger, audit);

  return { db, coa, flexy, partiesSvc, wallets, topups, transfers, subledgers, entries, lines };
}

async function seeded() {
  const h = setup();
  await h.coa.seedStandardAccounts();
  return h;
}

async function funded(h: Awaited<ReturnType<typeof seeded>>, balance = '1000.00') {
  const wallet = await h.flexy.createWallet({ name: 'Mobilis SIM 01', operator: 'MOBILIS', phoneNumber: '0550123456' });
  await h.flexy.fundWallet({ walletId: wallet.id, amount: balance, sourceAccount: 'CASH', actorUserId: 'u-op' });
  return (await (h.db as any).topUpWallet.findUnique({ where: { id: wallet.id } })) as any;
}

function legsOf(h: Awaited<ReturnType<typeof seeded>>, journalId: string): Map<string, [string, string]> {
  const map = new Map<string, [string, string]>();
  for (const l of h.lines.values()) {
    if (l.journalEntryId === journalId) map.set(l.accountCode, [l.debit, l.credit]);
  }
  return map;
}

function assertBalanced(legs: Map<string, [string, string]>): void {
  let dr = 0;
  let cr = 0;
  for (const [d, c] of legs.values()) {
    dr += Number(d);
    cr += Number(c);
  }
  expect(dr).toBeGreaterThan(0);
  expect(dr).toBe(cr);
}

describe('stage 7.2 flexy wallets (DIRECTIVE-016)', () => {
  it('runs a cash top-up with margin: Dr 10000 / Cr 10100 + Cr 40300', async () => {
    const h = await seeded();
    const wallet = await funded(h);
    const result = await h.flexy.processTopUp({
      walletId: wallet.id,
      targetPhoneNumber: '0550987654',
      faceAmount: '100.00',
      costAmount: '90.00',
      feeAmount: '5.00',
      paymentMethod: 'CASH',
      actorUserId: 'u-cashier',
    });
    expect(result.transaction).toMatchObject({
      transactionNumber: 'FLX-000001', serviceType: 'FLEXY',
      faceAmount: '100.00', costAmount: '90.00', feeAmount: '5.00',
      collectedAmount: '105.00', marginAmount: '15.00', paymentMethod: 'CASH',
    });
    expect(result.transaction.journalEntryId).toBe(result.journalEntryId);
    const legs = legsOf(h, result.journalEntryId);
    expect(legs.get('10000')).toEqual(['105.00', '0.00']);
    expect(legs.get('10100')).toEqual(['0.00', '90.00']);
    expect(legs.get('40300')).toEqual(['0.00', '15.00']);
    assertBalanced(legs);
    expect(result.wallet.balance).toBe('910.00');
  });

  it('runs an on-account top-up: AR leg, subledger charge, credit-limit gate', async () => {
    const h = await seeded();
    const customer = await h.partiesSvc.createParty({ name: 'Karim', type: 'CUSTOMER', creditLimit: '5000.00' });
    const wallet = await funded(h, '20000.00');
    const result = await h.flexy.processTopUp({
      walletId: wallet.id,
      targetPhoneNumber: '0550111222',
      faceAmount: '200.00',
      paymentMethod: 'ON_ACCOUNT',
      partyId: customer.id,
      actorUserId: 'u-cashier',
    });
    const legs = legsOf(h, result.journalEntryId);
    expect(legs.get('11000')).toEqual(['200.00', '0.00']);
    expect(legs.get('10100')).toEqual(['0.00', '200.00']);
    expect(legs.get('40300')).toBeUndefined();
    assertBalanced(legs);
    expect((await h.partiesSvc.getPartyBalance(customer.id)).to2dp()).toBe('200.00');

    const before = { topups: h.topups.length, journals: h.entries.size, subs: h.subledgers.length };
    await expect(
      h.flexy.processTopUp({
        walletId: wallet.id,
        targetPhoneNumber: '0550333444',
        faceAmount: '6000.00',
        paymentMethod: 'ON_ACCOUNT',
        partyId: customer.id,
        actorUserId: 'u-cashier',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect({ topups: h.topups.length, journals: h.entries.size, subs: h.subledgers.length }).toEqual(before);
    expect(((await (h.db as any).topUpWallet.findUnique({ where: { id: wallet.id } })) as any).balance).toBe('19800.00');
  });

  it('rejects top-ups the float cannot cover', async () => {
    const h = await seeded();
    const wallet = await funded(h, '50.00');
    await expect(
      h.flexy.processTopUp({
        walletId: wallet.id,
        targetPhoneNumber: '0550555666',
        faceAmount: '100.00',
        paymentMethod: 'CASH',
        actorUserId: 'u-cashier',
      }),
    ).rejects.toBeInstanceOf(InsufficientWalletBalanceError);
    expect(h.topups).toHaveLength(0);
  });

  it('funds a wallet from the cash drawer: Dr 10100 / Cr 10000', async () => {
    const h = await seeded();
    const wallet = await h.flexy.createWallet({ name: 'Djezzy Dealer', operator: 'DJEZZY' });
    expect(wallet.balance).toBe('0.00');
    const result = await h.flexy.fundWallet({ walletId: wallet.id, amount: '500.00', sourceAccount: 'CASH', notes: 'Morning float', actorUserId: 'u-op' });
    expect(result.wallet.balance).toBe('500.00');
    const legs = legsOf(h, result.journalEntryId);
    expect(legs.get('10100')).toEqual(['500.00', '0.00']);
    expect(legs.get('10000')).toEqual(['0.00', '500.00']);
    assertBalanced(legs);
  });

  it('moves float between till, bank and wallets with balanced journals', async () => {
    const h = await seeded();
    const wallet = await h.flexy.createWallet({ name: 'Mobilis SIM 01', operator: 'MOBILIS' });

    const bankToCash = await h.flexy.transferFloat({
      sourceAccountType: 'BANK', targetAccountType: 'CASH',
      amount: '300.00', reason: 'ATM withdrawal for change', actorUserId: 'u-op',
    });
    expect(bankToCash.record.transferNumber).toBe('TRF-000001');
    const legs1 = legsOf(h, bankToCash.journalEntryId);
    expect(legs1.get('10000')).toEqual(['300.00', '0.00']);
    expect(legs1.get('10200')).toEqual(['0.00', '300.00']);
    assertBalanced(legs1);

    const cashToWallet = await h.flexy.transferFloat({
      sourceAccountType: 'CASH', targetAccountType: 'WALLET', targetWalletId: wallet.id,
      amount: '200.00', reason: 'Dealer float top-up', actorUserId: 'u-op',
    });
    expect(cashToWallet.record.transferNumber).toBe('TRF-000002');
    const legs2 = legsOf(h, cashToWallet.journalEntryId);
    expect(legs2.get('10100')).toEqual(['200.00', '0.00']);
    expect(legs2.get('10000')).toEqual(['0.00', '200.00']);
    assertBalanced(legs2);
    expect(((await (h.db as any).topUpWallet.findUnique({ where: { id: wallet.id } })) as any).balance).toBe('200.00');

    await expect(
      h.flexy.transferFloat({
        sourceAccountType: 'CASH', targetAccountType: 'CASH',
        amount: '10.00', reason: 'No-op', actorUserId: 'u-op',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FLOAT_TRANSFER' });
  });
});
