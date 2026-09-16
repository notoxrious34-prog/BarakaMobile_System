import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { CoreModule } from '../../../core/core.module';
import { AccountingModule } from '../../../accounting/accounting.module';
import { PartiesModule } from '../../../parties/parties.module';
import { InventoryModule } from '../../../inventory/inventory.module';
import { SessionService } from '../../../core/session.service';
import { FlexyOrchestratorService } from '../../../modules/wallets/flexy-orchestrator.service';
import { V3Module } from '../../v3.module';

/**
 * DIRECTIVE-019 Stage 9.2 — v3 treasury & accounting gateway e2e (real HTTP).
 *
 * Same harness contract as the Stage 9.1 suite: real module graph, no
 * mocks, disposable SQLite file via `migrate deploy` (the shipped
 * `dev.db` is never touched), ephemeral port, global `api` prefix and
 * production ValidationPipe. Flow: shift open → cash in/out → shortage
 * close → overage close → wallet fund → flexy topup (40300 margin) →
 * float transfer (10000 → 10100) → COA / trial balance / P&L / balance
 * sheet → fiscal-period close. Closes the period LAST: afterwards the
 * month rejects postings by design.
 */

jest.setTimeout(180000);

const SCHEMA_PATH = join(__dirname, '..', '..', '..', '..', 'prisma', 'schema.prisma');

let app: INestApplication;
let baseUrl = '';
let prisma: PrismaService;
let tmpDir = '';
let authHeaders: Record<string, string> = {};

async function post(path: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders, ...extraHeaders },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
}

async function get(path: string) {
  const res = await fetch(`${baseUrl}${path}`, { headers: authHeaders });
  return { status: res.status, json: (await res.json()) as any };
}

@Module({
  imports: [PrismaModule, CoreModule, AccountingModule, PartiesModule, InventoryModule, V3Module],
})
class V3TreasuryTestModule {}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'v3-treasury-'));
  const dbFile = join(tmpDir, 'e2e.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  execSync(`npx prisma migrate deploy --schema "${SCHEMA_PATH}"`, {
    env: { ...process.env, DATABASE_URL: `file:${dbFile}` },
    stdio: 'pipe',
  });

  app = await NestFactory.create(V3TreasuryTestModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  const server = await app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api`;

  prisma = app.get(PrismaService);
  const user = await prisma.user.create({
    data: { username: 'e2e-treasury', displayName: 'E2E Treasury', pinHash: 'x', role: 'ADMIN' },
  });
  const sessions = app.get(SessionService);
  const { rawToken } = await sessions.createSession(user.id);
  authHeaders = { 'x-session-token': rawToken };

  await prisma.cashRegister.create({ data: { name: 'E2E-Register-1' } });
  const flexy = app.get(FlexyOrchestratorService);
  const wallet = await flexy.createWallet({ name: 'E2E Mobilis', operator: 'MOBILIS', actorUserId: user.id });
  await flexy.fundWallet({ walletId: wallet.id, amount: '1000.00', sourceAccount: 'CASH', actorUserId: user.id });
});

afterAll(async () => {
  await app?.close();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('v3 treasury & accounting gateway over HTTP (DIRECTIVE-019)', () => {
  let registerId = '';
  let walletId = '';

  it('opens a shift and serves it as the active shift with totals', async () => {
    registerId = (await prisma.cashRegister.findUniqueOrThrow({ where: { name: 'E2E-Register-1' } })).id;
    const opened = await post('/v3/shifts/open', { registerId, openingCash: '200.00', notes: 'E2E morning' });
    expect(opened.status).toBe(201);
    expect(opened.json.success).toBe(true);
    expect(opened.json.data.status).toBe('OPEN');
    const shiftId: string = opened.json.data.id;

    const active = await get(`/v3/shifts/active/${registerId}`);
    expect(active.status).toBe(200);
    expect(active.json.data.shift.id).toBe(shiftId);
    expect(active.json.data.totals.openingCash).toBe('200.00');

    await post(`/v3/shifts/${shiftId}/cash-in`, { amount: '50.00', reason: 'E2E coin top-up' });
    await post(`/v3/shifts/${shiftId}/cash-out`, { amount: '30.00', reason: 'E2E cleaning kit' });
    const details = await get(`/v3/shifts/${shiftId}`);
    expect(details.status).toBe(200);
    expect(details.json.data.movements).toHaveLength(2);
    expect(details.json.data.totals.totalCashIn).toBe('50.00');
    expect(details.json.data.totals.totalCashOut).toBe('30.00');
  });

  it('closes with a shortage: 50300 Dr 5.00 / 10000 Cr 5.00 and releases the register', async () => {
    const active = await get(`/v3/shifts/active/${registerId}`);
    const shiftId: string = active.json.data.shift.id;
    const closed = await post(`/v3/shifts/${shiftId}/close`, { actualCash: '215.00' });
    expect(closed.status).toBe(201);
    expect(closed.json.data.status).toBe('CLOSED');
    expect(closed.json.data.differenceAmount).toBe('-5.00');
    expect(closed.json.data.discrepancyJournalId).toBeTruthy();

    const legs = await prisma.journalEntryLine.findMany({ where: { journalEntryId: closed.json.data.discrepancyJournalId } });
    const byCode = new Map(legs.map((l) => [l.accountCode, [l.debit, l.credit]]));
    expect(byCode.get('50300')).toEqual(['5.00', '0.00']);
    expect(byCode.get('10000')).toEqual(['0.00', '5.00']);

    const after = await get(`/v3/shifts/active/${registerId}`);
    expect(after.json.data).toBeNull();
  });

  it('closes with an overage into 40400', async () => {
    const opened = await post('/v3/shifts/open', { registerId, openingCash: '100.00' });
    const shiftId: string = opened.json.data.id;
    const closed = await post(`/v3/shifts/${shiftId}/close`, { actualCash: '110.00' });
    expect(closed.json.data.differenceAmount).toBe('10.00');
    const legs = await prisma.journalEntryLine.findMany({ where: { journalEntryId: closed.json.data.discrepancyJournalId } });
    const byCode = new Map(legs.map((l) => [l.accountCode, [l.debit, l.credit]]));
    expect(byCode.get('10000')).toEqual(['10.00', '0.00']);
    expect(byCode.get('40400')).toEqual(['0.00', '10.00']);
  });

  it('lists wallets, tops up with margin into 40300, and transfers float 10000 → 10100', async () => {
    const listed = await get('/v3/flexy/wallets');
    expect(listed.status).toBe(200);
    expect(listed.json.data.length).toBeGreaterThanOrEqual(1);
    walletId = listed.json.data[0].id;
    expect(listed.json.data[0].balance).toBe('1000.00');

    const topup = await post('/v3/flexy/topup', {
      walletId,
      targetPhoneNumber: '0550123456',
      faceAmount: '100.00',
      costAmount: '90.00',
      feeAmount: '5.00',
      paymentMethod: 'CASH',
    });
    expect(topup.status).toBe(201);
    expect(topup.json.data.transaction.marginAmount).toBe('15.00');
    const topupLegs = await prisma.journalEntryLine.findMany({ where: { journalEntryId: topup.json.data.journalEntryId } });
    expect(topupLegs.find((l) => l.accountCode === '40300')?.credit).toBe('15.00');

    const moved = await post('/v3/flexy/float-transfer', {
      sourceAccountType: 'CASH',
      targetAccountType: 'WALLET',
      targetWalletId: walletId,
      amount: '200.00',
      reason: 'E2E dealer float top-up',
    });
    expect(moved.status).toBe(201);
    const wallet = await prisma.topUpWallet.findUniqueOrThrow({ where: { id: walletId } });
    expect(wallet.balance).toBe('1110.00');
    const moveLegs = await prisma.journalEntryLine.findMany({ where: { journalEntryId: moved.json.data.journalEntryId } });
    const byCode = new Map(moveLegs.map((l) => [l.accountCode, [l.debit, l.credit]]));
    expect(byCode.get('10100')).toEqual(['200.00', '0.00']);
    expect(byCode.get('10000')).toEqual(['0.00', '200.00']);
  });

  it('returns deterministic error envelopes: 422 float, 404 shift, 400 money', async () => {
    const poor = await post('/v3/flexy/topup', {
      walletId,
      targetPhoneNumber: '0550999888',
      faceAmount: '5000.00',
      paymentMethod: 'CASH',
    });
    expect(poor.status).toBe(422);
    expect(poor.json.error.code).toBe('INSUFFICIENT_WALLET_BALANCE');

    const missing = await get('/v3/shifts/does-not-exist');
    expect(missing.status).toBe(404);
    expect(missing.json.success).toBe(false);

    const bad = await post('/v3/flexy/float-transfer', {
      sourceAccountType: 'CASH',
      targetAccountType: 'WALLET',
      targetWalletId: walletId,
      amount: 'not-money',
      reason: 'E2E',
    });
    expect(bad.status).toBe(400);
    expect(bad.json.success).toBe(false);
  });

  it('serves COA, trial balance, P&L and a balanced sheet, then closes the period', async () => {
    const coa = await get('/v3/accounting/chart-of-accounts');
    expect(coa.status).toBe(200);
    expect(coa.json.data.length).toBeGreaterThanOrEqual(25);
    expect(coa.json.data.find((a: any) => a.accountCode === '40300')?.netBalance).toBe('15.00');

    const trial = await get('/v3/accounting/trial-balance');
    expect(trial.json.data.isBalanced).toBe(true);

    const pnl = await get('/v3/accounting/income-statement?startDate=2000-01-01T00:00:00.000Z&endDate=2100-01-01T00:00:00.000Z');
    expect(pnl.status).toBe(200);
    expect(pnl.json.data.totalRevenue).toBe('25.00');
    expect(pnl.json.data.totalExpenses).toBe('5.00');
    expect(pnl.json.data.netIncome).toBe('20.00');

    const sheet = await get('/v3/accounting/balance-sheet');
    expect(sheet.json.data.balanced).toBe(true);
    const equation = Number(sheet.json.data.totalLiabilities) + Number(sheet.json.data.totalEquity);
    expect(Number(sheet.json.data.totalAssets)).toBeCloseTo(equation, 2);

    const period = await prisma.fiscalPeriod.findFirstOrThrow({ where: { status: 'OPEN' } });
    const closed = await post('/v3/accounting/fiscal-periods/close', { periodId: period.id });
    expect(closed.status).toBe(201);
    expect(closed.json.data.status).toBe('CLOSED');
    expect(closed.json.data.netIncome).toBe('20.00');
    const closings = await prisma.journalEntry.count({ where: { documentType: 'PERIOD_CLOSING' } });
    expect(closings).toBe(1);
  });
});
