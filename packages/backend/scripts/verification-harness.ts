/**
 * TASK-BRIEF-004 — Phase 3 verification harness (zero external dependencies).
 *
 * Standalone TypeScript script (no Jest/Vitest/Playwright): boots the
 * COMPILED backend (`dist/main.js`) on an isolated port against an isolated
 * temporary SQLite copy of `production-seed.db`, then drives real HTTP
 * business cycles + the RBAC enforcement matrix with `fetch` (Node built-in),
 * `node:assert` and `decimal.js`.
 *
 * Build (strict type-check, no tsconfig change, no src pollution):
 *   pnpm --filter backend exec tsc scripts/verification-harness.ts \
 *     --outDir <tmp> --module commonjs --target es2021 \
 *     --moduleResolution node --esModuleInterop --skipLibCheck --strict
 * Run:
 *   BM_BACKEND_DIR=<abs packages/backend> BM_PORT=3188 node <tmp>/verification-harness.js
 *
 * Rule 15: NEVER touches dev.db / production-seed.db — read-only copy into
 * os.tmpdir(), deleted in teardown (finally block, crash-safe intent).
 */
import assert from 'node:assert/strict';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, rmSync, readFileSync, writeFileSync, openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type DecimalType from 'decimal.js';
import type { PrismaClient as PrismaClientType } from '@prisma/client';

// ---------------------------------------------------------------- config ---
const BACKEND_DIR = process.env.BM_BACKEND_DIR ?? '';
if (!BACKEND_DIR) throw new Error('BM_BACKEND_DIR env required (absolute packages/backend path)');
const PORT = Number(process.env.BM_PORT ?? '3188');
const BASE = `http://127.0.0.1:${PORT}/api`;
const SFX = Date.now().toString(36);
const DB_FILE = join(tmpdir(), `bm004-${SFX}.db`);
const BOOT_LOG = join(tmpdir(), `bm004-${SFX}.log`);

// Absolute requires: the emitted JS lives in tmpdir, so bare specifiers
// would not resolve — existing project deps loaded by absolute path.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Decimal = require(join(BACKEND_DIR, 'node_modules', 'decimal.js')) as typeof DecimalType;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require(join(BACKEND_DIR, 'node_modules', '@prisma', 'client')) as typeof import('@prisma/client');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isOpeningBalanceUniqueViolation } = require(join(
  BACKEND_DIR, 'dist', 'customers', 'opening-balance-errors.js',
)) as typeof import('../src/customers/opening-balance-errors');

const D = (s: string): InstanceType<typeof DecimalType> => new Decimal(s);
const MONEY_RE = /^\d+\.\d{2}$/;
function money(s: string, what: string): void {
  assert.ok(typeof s === 'string' && MONEY_RE.test(s), `${what} must be "0.00"-shaped string, got ${JSON.stringify(s)}`);
}

// ---------------------------------------------------------------- helpers --
const httpFetch: (url: string, init?: Record<string, unknown>) => Promise<{
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}> = (globalThis as unknown as { fetch: typeof httpFetch }).fetch.bind(globalThis);

async function api(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['x-session-token'] = token;
  const res = await httpFetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text };
  }
  return { status: res.status, data };
}

function step(name: string): void {
  console.log(`\n=== ${name} ===`);
}
function pass(msg: string): void {
  console.log(`  PASS ${msg}`);
}

let child: ChildProcess | null = null;
function killBackend(): void {
  const proc = child;
  child = null;
  if (!proc || proc.exitCode !== null) return;
  try {
    proc.kill('SIGTERM');
  } catch { /* best effort */ }
  const deadline = Date.now() + 8000;
  while (proc.exitCode === null && Date.now() < deadline) {
    execSync('ping -n 1 -w 500 127.0.0.1 >NUL 2>&1 || true', { stdio: 'ignore' });
  }
  if (proc.exitCode === null && proc.pid) {
    try {
      if (process.platform === 'win32') execSync(`taskkill /F /PID ${proc.pid}`, { stdio: 'ignore' });
      else proc.kill('SIGKILL');
    } catch { /* best effort */ }
  }
}

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + 60000;
  for (;;) {
    try {
      const r = await api('GET', '/health');
      if (r.status === 200) return;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) {
      const tail = existsSync(BOOT_LOG) ? readFileSync(BOOT_LOG, 'utf8').split('\n').slice(-25).join('\n') : '(no log)';
      throw new Error(`backend failed to become healthy within 60s.\n--- boot log tail ---\n${tail}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function tableCount(prisma: PrismaClientType, table: string): Promise<number> {
  const rows = (await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM "${table}"`)) as Array<{ c: number | bigint }>;
  return Number(rows[0].c);
}

async function stockOf(itemId: string, token: string): Promise<number> {
  const r = await api('GET', `/inventory/movements/${itemId}`, token);
  assert.equal(r.status, 200, `movements read must be 200 (got ${r.status})`);
  assert.ok(Array.isArray(r.data), 'movements payload must be an array');
  let qty = 0;
  for (const m of r.data as Array<{ type: string; quantity: number }>) {
    if (m.type === 'IN') qty += m.quantity;
    else if (m.type === 'OUT') qty -= m.quantity;
  }
  return qty;
}

// ------------------------------------------------------------------- main --
async function main(): Promise<void> {
  // ---- isolated DB setup (Rule 15: seed copied, never modified in place)
  const seed = join(BACKEND_DIR, 'prisma', 'production-seed.db');
  assert.ok(existsSync(seed), 'production-seed.db must exist');
  copyFileSync(seed, DB_FILE);
  for (const ext of ['-wal', '-shm']) {
    const f = `${seed}${ext}`;
    if (existsSync(f)) copyFileSync(f, `${DB_FILE}${ext}`);
  }
  console.log(`isolated DB: ${DB_FILE}`);

  const distMain = join(BACKEND_DIR, 'dist', 'main.js');
  assert.ok(existsSync(distMain), 'backend dist/main.js must be built (run tsc -b first)');
  writeFileSync(BOOT_LOG, '', 'utf8');
  const logFd = openSync(BOOT_LOG, 'a');
  child = spawn(process.execPath, [distMain], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_URL: `file:${DB_FILE.replace(/\\/g, '/')}`,
      PRISMA_MIGRATIONS_DIR: join(BACKEND_DIR, 'prisma', 'migrations'),
    },
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
  });
  await waitForHealth();
  console.log(`backend healthy on :${PORT}`);
  const bootLog = readFileSync(BOOT_LOG, 'utf8');
  assert.ok(!/BootMigration\] FAILED|FATAL/.test(bootLog), 'boot log must show no migration failure');
  pass('atomic boot on isolated DB (0 pending expected on current seed)');

  const prisma = (() => {
    process.env.DATABASE_URL = `file:${DB_FILE.replace(/\\/g, '/')}`;
    return new PrismaClient();
  })();
  try {
    // ---- auth bootstrap: admin PIN 0000 (seed) -> create role operators
    step('auth bootstrap (ADMIN/CASHIER/TECHNICIAN sessions)');
    const adminLogin = await api('POST', '/auth/pin-login', undefined, { pin: '0000' });
    assert.equal(adminLogin.status, 201, `admin pin-login must be 201 (got ${adminLogin.status})`);
    const ADMIN = adminLogin.data.token as string;
    assert.ok(ADMIN, 'admin token present');
    const mkUser = async (username: string, role: string, pin: string): Promise<string> => {
      const c = await api('POST', '/users', ADMIN, { username, displayName: username, pin, role });
      assert.equal(c.status, 201, `create ${role} must be 201 (got ${c.status})`);
      const l = await api('POST', '/auth/pin-login', undefined, { username, pin });
      assert.equal(l.status, 201, `${role} login must be 201 (got ${l.status})`);
      return l.data.token as string;
    };
    const CASHIER = await mkUser(`bm004_cashier_${SFX}`.slice(0, 24), 'CASHIER', '1111');
    const TECH = await mkUser(`bm004_tech_${SFX}`.slice(0, 24), 'TECHNICIAN', '2222');
    pass('three role sessions established');
    const anonUsers = await api('GET', '/users');
    assert.equal(anonUsers.status, 401, `GET /users without token must be 401 (got ${anonUsers.status})`);
    pass('unauthenticated admin route -> 401');

    // ---- CYCLE 1: POS & sales
    step('CYCLE 1 — POS sale (stock, cash, Decimal precision)');
    const itemRes = await api('POST', '/inventory/items', ADMIN, {
      name: `BM004-POS-ITEM-${SFX}`, costPrice: '60.00', sellingPrice: '100.00', sku: `BM004-POS-${SFX}`,
    });
    assert.equal(itemRes.status, 201, `create item must be 201 (got ${itemRes.status})`);
    const itemId = itemRes.data.id as string;
    const intake = await api('POST', '/inventory/movements', ADMIN, { itemId, type: 'IN', quantity: 10, note: 'BM004 intake' });
    assert.equal(intake.status, 201, `stock intake must be 201 (got ${intake.status})`);
    assert.equal(await stockOf(itemId, ADMIN), 10, 'stock after intake = 10');
    const custRes = await api('POST', '/customers', ADMIN, { name: `BM004-POS-CUST-${SFX}` });
    assert.equal(custRes.status, 201, `create customer must be 201 (got ${custRes.status})`);
    const accountId = (custRes.data.accounts as Array<{ id: string }>)[0].id as string;
    const cashBefore = (await api('GET', '/cash/balance', ADMIN)).data.currentBalance as string;
    money(cashBefore, 'cash before sale');
    const sale = await api('POST', '/transactions/sale', ADMIN, {
      type: 'SALE', accountId, amount: '200.00', amountPaidNow: '200.00',
      itemLines: [{ itemId, quantity: 2, unitPrice: '100.00' }],
    });
    assert.equal(sale.status, 201, `POS sale must be 201 (got ${sale.status}: ${JSON.stringify(sale.data).slice(0, 300)})`);
    const txId = sale.data.id as string;
    assert.ok(txId, 'sale returns transaction id');
    assert.equal(await stockOf(itemId, ADMIN), 8, 'stock decremented 10 -> 8');
    const cashAfter = (await api('GET', '/cash/balance', ADMIN)).data.currentBalance as string;
    money(cashAfter, 'cash after sale');
    assert.ok(D(cashAfter).minus(D(cashBefore)).equals(D('200.00')), `cash increments exactly 200.00 (${cashBefore} -> ${cashAfter})`);
    const ledger = await api('GET', `/reports/accounts/${accountId}/ledger`, ADMIN);
    assert.equal(ledger.status, 200, 'account ledger readable');
    const txEntries = (Array.isArray(ledger.data) ? ledger.data : (ledger.data.entries ?? [])) as Array<{ transactionId: string; amount: string }>;
    const ours = txEntries.filter((e) => e.transactionId === txId);
    assert.ok(ours.length >= 2, `sale posts >=2 ledger entries (got ${ours.length})`);
    for (const e of ours) money(e.amount, 'ledger entry amount');
    pass(`POS sale ${sale.data.invoiceNumber}: stock 10->8, cash +200.00 exact, ${ours.length} ledger entries`);

    // ---- CYCLE 2: repair soft-delete + AD-34
    step('CYCLE 2 — repair part soft-delete, stock reversal, AD-34 isolation');
    const txCount0 = await tableCount(prisma, 'Transaction');
    const leCount0 = await tableCount(prisma, 'LedgerEntry');
    const cdCount0 = await tableCount(prisma, 'CustomerDebtLedgerEntry');
    const rcust = await api('POST', '/customers', ADMIN, { name: `BM004-REPAIR-CUST-${SFX}` });
    assert.equal(rcust.status, 201, 'repair contact created');
    const partItem = await api('POST', '/inventory/items', ADMIN, {
      name: `BM004-REPAIR-PART-${SFX}`, costPrice: '25.00', sellingPrice: '40.00', sku: `BM004-RP-${SFX}`,
    });
    const partItemId = partItem.data.id as string;
    await api('POST', '/inventory/movements', ADMIN, { itemId: partItemId, type: 'IN', quantity: 5, note: 'BM004 part intake' });
    assert.equal(await stockOf(partItemId, ADMIN), 5, 'part stock = 5');
    const ticketRes = await api('POST', '/repair', ADMIN, {
      contactId: rcust.data.id, deviceType: 'PHONE', deviceBrand: 'BM004', deviceModel: 'T1', problemDescription: 'BM004 harness ticket',
    });
    assert.equal(ticketRes.status, 201, `ticket created (got ${ticketRes.status})`);
    const ticketId = ticketRes.data.id as string;
    const ticketNumber = ticketRes.data.ticketNumber as string;
    const addRes = await api('POST', `/repair/${ticketId}/parts`, ADMIN, { inventoryItemId: partItemId, quantity: 2 });
    assert.equal(addRes.status, 201, `addPart 201 (got ${addRes.status})`);
    assert.equal(await stockOf(partItemId, ADMIN), 3, 'part stock consumed 5 -> 3');
    const partRow = (await prisma.$queryRawUnsafe(
      'SELECT id, isActive, reversalMovementId, stockMovementId FROM RepairPartItem WHERE ticketId = ?', ticketId,
    )) as Array<{ id: string; isActive: number; reversalMovementId: string | null; stockMovementId: string }>;
    assert.equal(partRow.length, 1, 'one part row');
    const partId = partRow[0].id;
    const delRes = await api('DELETE', `/repair/${ticketId}/parts/${partId}`, ADMIN);
    assert.equal(delRes.status, 200, `removePart 200 (got ${delRes.status})`);
    assert.deepEqual((delRes.data.parts as unknown[]).length, 0, 'soft-deleted part hidden from ticket');
    const after = (await prisma.$queryRawUnsafe(
      'SELECT isActive, reversalMovementId FROM RepairPartItem WHERE id = ?', partId,
    )) as Array<{ isActive: number | boolean; reversalMovementId: string | null }>;
    assert.equal(after.length, 1, 'part row retained (Rule 4: no hard delete)');
    assert.ok(after[0].isActive === 0 || after[0].isActive === false, `isActive = false (got ${after[0].isActive})`);
    assert.ok(after[0].reversalMovementId, 'reversalMovementId set');
    const reversal = (await prisma.$queryRawUnsafe(
      'SELECT type, quantity, reference FROM StockMovement WHERE id = ?', after[0].reversalMovementId,
    )) as Array<{ type: string; quantity: number; reference: string }>;
    assert.equal(reversal.length, 1, 'reversal movement exists');
    assert.equal(reversal[0].type, 'IN', 'reversal is IN');
    assert.equal(reversal[0].quantity, 2, 'reversal restores 2 units');
    assert.equal(await stockOf(partItemId, ADMIN), 5, 'stock restored 3 -> 5');
    assert.equal(await tableCount(prisma, 'Transaction'), txCount0, 'AD-34: zero Transaction rows created');
    assert.equal(await tableCount(prisma, 'LedgerEntry'), leCount0, 'AD-34: zero LedgerEntry rows created');
    assert.equal(await tableCount(prisma, 'CustomerDebtLedgerEntry'), cdCount0, 'AD-34: zero debt-ledger rows created');
    pass(`ticket ${ticketNumber}: soft-delete + reversal OK, financial side-effect deltas all 0`);

    // ExpenseCategory soft-delete invariant (Rule 4)
    const catRes = await api('POST', '/expenses/categories', ADMIN, { name: `BM004-CAT-${SFX}` });
    assert.equal(catRes.status, 201, 'category created');
    const catId = catRes.data.id as string;
    const catDel = await api('DELETE', `/expenses/categories/${catId}`, ADMIN);
    assert.equal(catDel.status, 200, 'admin category delete 200');
    const catRow = (await prisma.$queryRawUnsafe('SELECT isActive FROM ExpenseCategory WHERE id = ?', catId)) as Array<{ isActive: number | boolean }>;
    assert.equal(catRow.length, 1, 'category row retained');
    assert.ok(catRow[0].isActive === 0 || catRow[0].isActive === false, `category isActive = false (got ${catRow[0].isActive})`);
    pass('ExpenseCategory soft-delete retains record');

    // ---- CYCLE 3: opening-balance guards (customer + supplier)
    step('CYCLE 3 — opening-balance partial-unique guards (409 wiring)');
    const obCust = await api('POST', '/customers', ADMIN, { name: `BM004-OB-CUST-${SFX}` });
    const obCustId = obCust.data.id as string;
    const ob1 = await api('POST', `/customers/${obCustId}/opening-balance`, ADMIN, { amount: '500.00', direction: 'DEBIT' });
    assert.equal(ob1.status, 201, `first opening balance 201 (got ${ob1.status})`);
    const debt1 = await api('GET', `/customers/${obCustId}/debt`, ADMIN);
    assert.equal(debt1.data.balance, '500.00', 'debt balance = 500.00');
    const ob2 = await api('POST', `/customers/${obCustId}/opening-balance`, ADMIN, { amount: '50.00', direction: 'DEBIT' });
    assert.equal(ob2.status, 400, `sequential duplicate stopped by app guard with 400 (got ${ob2.status})`);
    // Race backstop: duplicate through the Prisma client (exactly as
    // DebtLedgerService.recordOpeningBalance does) must surface P2002 and
    // map through the exact service guard fn to the 409 path.
    let dupErr: unknown = null;
    try {
      await prisma.customerDebtLedgerEntry.create({
        data: { customerId: obCustId, type: 'OPENING_BALANCE', amount: '50.00', balanceBefore: '500.00', balanceAfter: '550.00' },
      });
    } catch (e) {
      dupErr = e;
    }
    assert.ok(dupErr, 'duplicate OPENING_BALANCE must violate the constraint');
    assert.ok(isOpeningBalanceUniqueViolation(dupErr), 'service 409-guard fn matches (customer)');
    pass('customer: 400 app guard + DB partial-unique -> 409 wiring proven');
    const obSup = await api('POST', '/suppliers', ADMIN, { name: `BM004-OB-SUP-${SFX}` });
    const obSupId = obSup.data.id as string;
    const sob1 = await api('POST', `/suppliers/${obSupId}/opening-balance`, ADMIN, { amount: '300.00', direction: 'CREDIT' });
    assert.equal(sob1.status, 201, `supplier opening balance 201 (got ${sob1.status})`);
    const sob2 = await api('POST', `/suppliers/${obSupId}/opening-balance`, ADMIN, { amount: '30.00', direction: 'CREDIT' });
    assert.equal(sob2.status, 400, `supplier sequential duplicate -> 400 (got ${sob2.status})`);
    let supErr: unknown = null;
    try {
      await prisma.supplierDebtLedgerEntry.create({
        data: { contactId: obSupId, type: 'OPENING_BALANCE', amount: '30.00', balanceBefore: '-300.00', balanceAfter: '-330.00' },
      });
    } catch (e) {
      supErr = e;
    }
    assert.ok(supErr && isOpeningBalanceUniqueViolation(supErr), 'service 409-guard fn matches (supplier)');
    pass('supplier: 400 app guard + DB partial-unique -> 409 wiring proven');

    // ---- CYCLE 4: treasury voucher + append-only ledger
    step('CYCLE 4 — treasury receipt voucher, append-only ledger');
    const tCust = await api('POST', '/customers', ADMIN, { name: `BM004-TREAS-CUST-${SFX}` });
    const tCustId = tCust.data.id as string;
    await api('POST', `/customers/${tCustId}/opening-balance`, ADMIN, { amount: '1000.00', direction: 'DEBIT' });
    const entriesBefore = (await prisma.$queryRawUnsafe(
      'SELECT id, amount, balanceAfter FROM CustomerDebtLedgerEntry WHERE customerId = ? ORDER BY createdAt', tCustId,
    )) as Array<{ id: string; amount: string; balanceAfter: string }>;
    assert.equal(entriesBefore.length, 1, 'one opening entry');
    const cashT0 = (await api('GET', '/cash/balance', ADMIN)).data.currentBalance as string;
    const voucher = await api('POST', `/customers/${tCustId}/payments`, ADMIN, { amount: '400.00', notes: 'BM004 voucher' });
    assert.equal(voucher.status, 201, `voucher 201 (got ${voucher.status})`);
    assert.equal(voucher.data.currentBalance, '600.00', 'voucher returns 600.00');
    money(voucher.data.currentBalance, 'voucher balance');
    const debtAfter = await api('GET', `/customers/${tCustId}/debt`, ADMIN);
    assert.equal(debtAfter.data.balance, '600.00', 'debt 1000.00 -> 600.00');
    const cashT1 = (await api('GET', '/cash/balance', ADMIN)).data.currentBalance as string;
    assert.ok(D(cashT1).minus(D(cashT0)).equals(D('400.00')), `treasury +400.00 exact (${cashT0} -> ${cashT1})`);
    const entriesAfter = (await prisma.$queryRawUnsafe(
      'SELECT id, amount, balanceAfter, type FROM CustomerDebtLedgerEntry WHERE customerId = ? ORDER BY createdAt', tCustId,
    )) as Array<{ id: string; amount: string; balanceAfter: string; type: string }>;
    assert.equal(entriesAfter.length, 2, 'ledger append-only: 1 -> 2 rows');
    assert.deepEqual(
      { id: entriesAfter[0].id, amount: entriesAfter[0].amount, balanceAfter: entriesAfter[0].balanceAfter },
      { id: entriesBefore[0].id, amount: entriesBefore[0].amount, balanceAfter: entriesBefore[0].balanceAfter },
      'prior entry untouched (no UPDATE)',
    );
    assert.equal(entriesAfter[1].type, 'PAYMENT', 'second entry is PAYMENT');
    assert.equal(entriesAfter[1].balanceAfter, '600.00', 'payment balanceAfter 600.00');
    pass('voucher 400.00: debt 1000->600, treasury +400.00, ledger append-only');

    // ---- PHASE 3: RBAC mirror matrix (ground-truth backend enforcement)
    step('PHASE 3 — RBAC matrix (ADMIN / CASHIER / TECHNICIAN / anonymous)');
    // ADMIN full access
    assert.equal((await api('GET', '/users', ADMIN)).status, 200, 'admin GET /users 200');
    const rbacCat = await api('POST', '/expenses/categories', ADMIN, { name: `BM004-RBAC-${SFX}` });
    assert.equal(rbacCat.status, 201, 'admin create category 201');
    const rbacCatId = rbacCat.data.id as string;
    assert.equal((await api('GET', '/reports/profit?startDate=2026-01-01&endDate=2026-12-31', ADMIN)).status, 200, 'admin profit 200');
    assert.equal((await api('GET', '/backup/status', ADMIN)).status, 200, 'admin backup status 200');
    assert.equal((await api('PUT', '/watchdog/settings', ADMIN, { repairGraceDays: 3, warrantyAlertDays: 7 })).status, 200, 'admin watchdog settings 200');
    pass('ADMIN: 200/201 on users, categories, profit, backup, watchdog');
    // CASHIER: POS ok, sensitive -> 403, costs masked
    const cSale = await api('POST', '/transactions/sale', CASHIER, {
      type: 'SALE', accountId, amount: '100.00', amountPaidNow: '100.00',
      itemLines: [{ itemId, quantity: 1, unitPrice: '100.00' }],
    });
    assert.equal(cSale.status, 201, `cashier POS sale 201 (got ${cSale.status})`);
    pass('CASHIER: POS sale 201');
    for (const [m, p, b] of [
      ['GET', '/users', undefined],
      ['POST', '/users', { username: 'x', displayName: 'x', pin: '1234' }],
      ['DELETE', `/expenses/categories/${rbacCatId}`, undefined],
      ['GET', '/reports/profit?startDate=2026-01-01&endDate=2026-12-31', undefined],
      ['GET', '/backup/status', undefined],
      ['PUT', '/watchdog/settings', { repairGraceDays: 3, warrantyAlertDays: 7 }],
    ] as Array<[string, string, unknown]>) {
      const r = await api(m, p, CASHIER, b);
      assert.equal(r.status, 403, `cashier ${m} ${p} must be 403 (got ${r.status})`);
    }
    pass('CASHIER: 403 on users, category delete, profit, backup, watchdog');
    const cItems = await api('GET', '/inventory/items', CASHIER);
    assert.equal(cItems.status, 200, 'cashier items 200');
    const cRow = (cItems.data as Array<{ id: string; costPrice: string }>).find((r) => r.id === itemId);
    assert.ok(cRow && cRow.costPrice === 'MASKED', 'cashier costPrice MASKED');
    pass('CASHIER: inventory costs masked (data-level RBAC)');
    // TECHNICIAN: repair ok + costs visible, financial/admin -> 403
    assert.equal((await api('GET', '/repair', TECH)).status, 200, 'tech repair list 200');
    const stPatch = await api('PATCH', `/repair/${ticketId}/status`, TECH, { status: 'IN_REPAIR' });
    assert.equal(stPatch.status, 200, `tech status update 200 (got ${stPatch.status})`);
    pass('TECHNICIAN: repair read + status update 200');
    for (const [m, p, b] of [
      ['GET', '/users', undefined],
      ['DELETE', `/expenses/categories/${rbacCatId}`, undefined],
      ['GET', '/reports/profit?startDate=2026-01-01&endDate=2026-12-31', undefined],
      ['GET', '/backup/status', undefined],
    ] as Array<[string, string, unknown]>) {
      const r = await api(m, p, TECH, b);
      assert.equal(r.status, 403, `technician ${m} ${p} must be 403 (got ${r.status})`);
    }
    pass('TECHNICIAN: 403 on users, category delete, profit, backup');
    const tItems = await api('GET', '/inventory/items', TECH);
    const tRow = (tItems.data as Array<{ id: string; costPrice: string }>).find((r) => r.id === itemId);
    assert.ok(tRow && MONEY_RE.test(tRow.costPrice), `tech sees real costPrice (got ${tRow?.costPrice})`);
    pass('TECHNICIAN: inventory costs visible (canViewCosts)');
    // Anonymous: 401 on guarded routes
    for (const [m, p] of [
      ['GET', '/users'],
      ['DELETE', `/expenses/categories/${rbacCatId}`],
      ['GET', '/reports/profit?startDate=2026-01-01&endDate=2026-12-31'],
    ] as Array<[string, string]>) {
      const r = await api(m, p);
      assert.equal(r.status, 401, `anonymous ${m} ${p} must be 401 (got ${r.status})`);
    }
    pass('anonymous: 401 on users, category delete, profit');
    // Admin cleanup of probe category (soft-delete path again)
    assert.equal((await api('DELETE', `/expenses/categories/${rbacCatId}`, ADMIN)).status, 200, 'admin cleanup delete 200');

    console.log('\nALL BM004 CHECKS PASSED');
  } finally {
    await prisma.$disconnect().catch(() => null);
    killBackend();
    for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`, `${DB_FILE}-journal`, BOOT_LOG]) {
      try {
        if (existsSync(f)) rmSync(f, { force: true });
      } catch { /* best effort */ }
    }
    console.log(`teardown: isolated DB removed (${existsSync(DB_FILE) ? 'FAILED' : 'ok'})`);
  }
}

main().catch((e) => {
  console.error('HARNESS FAILED:', e);
  try {
    killBackend();
  } catch { /* best effort */ }
  process.exit(1);
});
