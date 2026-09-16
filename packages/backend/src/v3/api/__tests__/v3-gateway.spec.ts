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
import { V3Module } from '../../v3.module';

/**
 * DIRECTIVE-018 Stage 9.1 — v3 gateway end-to-end suite (real HTTP).
 *
 * Boots the real module graph (no mocks) against a disposable SQLite
 * file (`migrate deploy` into a tmp dir — the shipped `dev.db` is never
 * touched), binds an ephemeral port, and drives every v3 controller over
 * HTTP with the global `api` prefix and production ValidationPipe:
 * purchase → sale → idempotent replay → validation/Auth failures →
 * credit-limit 422 → return → full repair workshop walk → WIP clearance.
 * No supertest dependency: plain global `fetch` against `listen(0)`.
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

async function patch(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...authHeaders },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
}

async function get(path: string, withAuth = true) {
  const res = await fetch(`${baseUrl}${path}`, { headers: withAuth ? authHeaders : {} });
  return { status: res.status, json: (await res.json()) as any };
}

@Module({
  imports: [PrismaModule, CoreModule, AccountingModule, PartiesModule, InventoryModule, V3Module],
})
class V3GatewayTestModule {}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'v3-gateway-'));
  const dbFile = join(tmpDir, 'e2e.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  execSync(`npx prisma migrate deploy --schema "${SCHEMA_PATH}"`, {
    env: { ...process.env, DATABASE_URL: `file:${dbFile}` },
    stdio: 'pipe',
  });

  const moduleRef = V3GatewayTestModule;
  app = await NestFactory.create(moduleRef, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  const server = await app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api`;

  prisma = app.get(PrismaService);
  const user = await prisma.user.create({
    data: { username: 'e2e-admin', displayName: 'E2E Admin', pinHash: 'x', role: 'ADMIN' },
  });
  const sessions = app.get(SessionService);
  const { rawToken } = await sessions.createSession(user.id);
  authHeaders = { 'x-session-token': rawToken };

  await prisma.catalogItem.create({
    data: { sku: 'E2E-PHONE', name: 'E2E Phone', category: 'devices', costPrice: '100.00', sellingPrice: '150.00' },
  });
  await prisma.catalogItem.create({
    data: { sku: 'E2E-SCREEN', name: 'E2E Screen', category: 'spares', costPrice: '20.00', sellingPrice: '40.00' },
  });
});

afterAll(async () => {
  await app?.close();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('v3 commercial gateway over HTTP (DIRECTIVE-018)', () => {
  let supplierId = '';
  let customerId = '';
  let phoneItemId = '';
  let screenItemId = '';
  let saleDocumentId = '';
  let saleLineId = '';
  let saleNumber = '';

  it('seeds supplier, customer and resolves catalog items', async () => {
    const supplier = await prisma.party.create({ data: { name: 'E2E Supplier', type: 'SUPPLIER', creditLimit: '0.00' } });
    const customer = await prisma.party.create({ data: { name: 'E2E Customer', type: 'CUSTOMER', creditLimit: '10000.00' } });
    supplierId = supplier.id;
    customerId = customer.id;
    phoneItemId = (await prisma.catalogItem.findUniqueOrThrow({ where: { sku: 'E2E-PHONE' } })).id;
    screenItemId = (await prisma.catalogItem.findUniqueOrThrow({ where: { sku: 'E2E-SCREEN' } })).id;
    expect(supplierId).toBeTruthy();
  });

  it('rejects unauthenticated access with 401', async () => {
    const res = await get('/v3/sales/whatever', false);
    expect(res.status).toBe(401);
    expect(res.json.success).toBe(false);
  });

  it('rejects invalid payloads with a 400 envelope', async () => {
    const res = await post('/v3/sales', { lines: [] });
    expect(res.status).toBe(400);
    expect(res.json.success).toBe(false);
    expect(res.json.error.code).toBe('VALIDATION_ERROR');
  });

  it('purchases stock: POST /v3/purchases → 201 envelope with document + journal', async () => {
    const res = await post('/v3/purchases', {
      partyId: supplierId,
      lines: [
        { itemId: phoneItemId, quantity: 2, unitCost: '100.00' },
        { itemId: screenItemId, quantity: 5, unitCost: '20.00' },
      ],
      payments: [{ paymentMethod: 'CASH', amount: '300.00' }],
    });
    expect(res.status).toBe(201);
    expect(res.json.success).toBe(true);
    expect(res.json.data.document.documentNumber).toMatch(/^PUR-/);
    expect(res.json.data.journalEntryId).toBeTruthy();
    const details = await get(`/v3/purchases/${res.json.data.document.id}`);
    expect(details.status).toBe(200);
    expect(details.json.data.journalEntry).toBeTruthy();
    expect(details.json.data.lines).toHaveLength(2);
  });

  it('sells for cash: POST /v3/sales → 201, GET shows lines + journal link', async () => {
    const res = await post('/v3/sales', {
      partyId: customerId,
      lines: [{ itemId: phoneItemId, quantity: 1, unitPrice: '150.00' }],
      payments: [{ paymentMethod: 'CASH', amount: '150.00' }],
    });
    expect(res.status).toBe(201);
    expect(res.json.success).toBe(true);
    saleDocumentId = res.json.data.document.id;
    saleNumber = res.json.data.document.documentNumber;
    const details = await get(`/v3/sales/${saleDocumentId}`);
    expect(details.status).toBe(200);
    expect(details.json.data.document.documentNumber).toBe(saleNumber);
    expect(details.json.data.journalEntry.lines.length).toBeGreaterThanOrEqual(2);
    saleLineId = details.json.data.lines[0].id;
  });

  it('replays the same x-idempotency-key without duplicating the sale', async () => {
    const before = await prisma.businessDocument.count({ where: { type: 'SALE_INVOICE' } });
    const payload = {
      partyId: customerId,
      lines: [{ itemId: phoneItemId, quantity: 1, unitPrice: '150.00' }],
      payments: [{ paymentMethod: 'CASH', amount: '150.00' }],
    };
    const first = await post('/v3/sales', payload, { 'x-idempotency-key': 'e2e-key-1' });
    const second = await post('/v3/sales', payload, { 'x-idempotency-key': 'e2e-key-1' });
    expect(first.status).toBe(201);
    expect(second.json.success).toBe(true);
    expect(second.json.data.document.documentNumber).toBe(first.json.data.document.documentNumber);
    const after = await prisma.businessDocument.count({ where: { type: 'SALE_INVOICE' } });
    expect(after).toBe(before + 1);
  });

  it('rejects credit beyond the customer limit with 422', async () => {
    const limited = await prisma.party.create({ data: { name: 'E2E Limited', type: 'CUSTOMER', creditLimit: '50.00' } });
    const res = await post('/v3/sales', {
      partyId: limited.id,
      lines: [{ itemId: screenItemId, quantity: 5, unitPrice: '40.00' }],
      payments: [{ paymentMethod: 'CASH', amount: '10.00' }],
    });
    expect(res.status).toBe(422);
    expect(res.json.success).toBe(false);
  });

  it('returns 404 envelope for unknown documents', async () => {
    const res = await get('/v3/sales/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.json.success).toBe(false);
    expect(res.json.error.code).toMatch(/NOT_FOUND/);
  });

  it('processes a sales return over HTTP and reads it back', async () => {
    const created = await post('/v3/returns/sales', {
      originalDocumentId: saleDocumentId,
      lines: [{ documentLineId: saleLineId, quantity: 1, condition: 'RESTOCKED_INVENTORY' }],
      refundMethod: 'CASH',
      reason: 'E2E defective unit',
    });
    expect(created.status).toBe(201);
    expect(created.json.success).toBe(true);
    const details = await get(`/v3/returns/${created.json.data.returnDocument.id}`);
    expect(details.status).toBe(200);
    expect(details.json.data.journalEntry).toBeTruthy();
  });

  it('walks the repair workshop: intake → diagnose → quote → approve → IN_PROGRESS → part → ready → deliver', async () => {
    const created = await post('/v3/repairs', {
      partyId: customerId,
      deviceType: 'PHONE',
      brand: 'E2E',
      model: 'X1',
      reportedIssue: 'Cracked screen',
    });
    expect(created.status).toBe(201);
    const orderId: string = created.json.data.id;

    const illegal = await patch(`/v3/repairs/${orderId}/status`, { status: 'READY' });
    expect(illegal.status).toBe(409);
    expect(illegal.json.error.code).toBe('INVALID_REPAIR_TRANSITION');

    expect((await patch(`/v3/repairs/${orderId}/status`, { status: 'DIAGNOSING', diagnosisNotes: 'Screen broken' })).status).toBe(200);
    expect(
      (await patch(`/v3/repairs/${orderId}/status`, { status: 'QUOTED', laborPrice: '50.00', estimatedCost: '90.00' })).status,
    ).toBe(200);
    expect((await patch(`/v3/repairs/${orderId}/status`, { status: 'APPROVED' })).status).toBe(200);
    expect((await patch(`/v3/repairs/${orderId}/status`, { status: 'IN_PROGRESS', technicianId: 'tech-1' })).status).toBe(200);

    const part = await post(`/v3/repairs/${orderId}/parts`, { itemId: screenItemId, quantity: 1, unitPrice: '40.00' });
    expect(part.status).toBe(201);

    expect((await patch(`/v3/repairs/${orderId}/status`, { status: 'READY' })).status).toBe(200);
    const delivered = await post(`/v3/repairs/${orderId}/deliver`, {
      payments: [{ paymentMethod: 'CASH', amount: '90.00' }],
    });
    expect(delivered.status).toBe(201);
    expect(delivered.json.data.order.status).toBe('DELIVERED');

    const details = await get(`/v3/repairs/${orderId}`);
    expect(details.status).toBe(200);
    expect(details.json.data.parts).toHaveLength(1);
    expect(details.json.data.status).toBe('DELIVERED');

    const wipLines = await prisma.journalEntryLine.findMany({ where: { accountCode: '12300' } });
    let debit = 0;
    let credit = 0;
    for (const line of wipLines) {
      debit += Number(line.debit);
      credit += Number(line.credit);
    }
    expect(`${debit.toFixed(2)}:${credit.toFixed(2)}`).toBe('20.00:20.00');
  });
});
