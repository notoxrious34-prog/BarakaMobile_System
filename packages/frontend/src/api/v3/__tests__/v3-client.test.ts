/**
 * DIRECTIVE-020 Stage 10.1 — v3 client unit tests (zero-dependency harness).
 *
 * Runs on plain Node via tsx (no test framework is installed in this
 * package, and Rule ⑨ forbids adding one): `tsx
 * src/api/v3/__tests__/v3-client.test.ts`. The stubbed `fetchFn` records
 * every call and replays scripted responses; any assertion failure sets
 * a non-zero exit code with the exact mismatch printed.
 */
import { createV3Client, isV3ApiError, V3ApiError } from '../client';
import { createSalesV3Api } from '../commercial';
import { createAccountingV3Api } from '../accounting';

type RecordedCall = { url: string; init: RequestInit };
type ScriptedResponse = { status: number; body: unknown };

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL ${name}\n  expected: ${e}\n  received: ${a}`);
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function stubFetch(script: ScriptedResponse[], calls: RecordedCall[]): typeof fetch {
  return ((url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    const next = script.shift() ?? { status: 500, body: { success: false, error: { code: 'EMPTY', message: 'No scripted response.' } } };
    return Promise.resolve(jsonResponse(next.status, next.body));
  }) as unknown as typeof fetch;
}

async function main(): Promise<void> {
  // 1. Success envelope unwraps to `data`.
  {
    const calls: RecordedCall[] = [];
    const client = createV3Client({
      baseUrl: 'http://t/api',
      getSessionToken: () => 'tok-1',
      generateIdempotencyKey: () => 'key-1',
      fetchFn: stubFetch([{ status: 200, body: { success: true, data: { id: 's-1' } } }], calls),
    });
    const data = await client.get<{ id: string }>('/v3/sales/s-1');
    check('unwrap data', data, { id: 's-1' });
    check('get url', calls[0].url, 'http://t/api/v3/sales/s-1');
    check('session header', (calls[0].init.headers as Record<string, string>)['x-session-token'], 'tok-1');
    check('no idempotency on GET', 'x-idempotency-key' in (calls[0].init.headers as Record<string, string>), false);
  }

  // 2. POST auto-injects a generated idempotency key.
  {
    const calls: RecordedCall[] = [];
    const client = createV3Client({
      baseUrl: 'http://t/api',
      getSessionToken: () => null,
      generateIdempotencyKey: () => 'auto-key-9',
      fetchFn: stubFetch([{ status: 201, body: { success: true, data: { ok: true } } }], calls),
    });
    await client.post('/v3/sales', { lines: [] });
    const headers = calls[0].init.headers as Record<string, string>;
    check('auto idempotency key', headers['x-idempotency-key'], 'auto-key-9');
    check('post method', calls[0].init.method, 'POST');
    check('post body', JSON.parse(String(calls[0].init.body)), { lines: [] });
  }

  // 3. Explicit caller key wins over the generator.
  {
    const calls: RecordedCall[] = [];
    let generated = 0;
    const client = createV3Client({
      baseUrl: 'http://t/api',
      fetchFn: stubFetch([{ status: 201, body: { success: true, data: {} } }], calls),
      generateIdempotencyKey: () => {
        generated += 1;
        return 'should-not-appear';
      },
    });
    await client.post('/v3/sales', {}, { idempotencyKey: 'caller-key' });
    check('explicit key', (calls[0].init.headers as Record<string, string>)['x-idempotency-key'], 'caller-key');
    check('generator untouched', generated, 0);
  }

  // 4. HTTP error statuses throw typed V3ApiError with the machine code.
  for (const [status, code] of [[400, 'VALIDATION_ERROR'], [404, 'NOT_FOUND'], [409, 'CONFLICT'], [422, 'VALIDATION_ERROR'], [500, 'LEDGER_IMBALANCE']] as Array<[number, string]>) {
    const calls: RecordedCall[] = [];
    const client = createV3Client({
      baseUrl: 'http://t/api',
      fetchFn: stubFetch([{ status, body: { success: false, error: { code, message: `m-${status}` } } }], calls),
    });
    try {
      await client.post('/v3/sales', {});
      check(`throws on ${status}`, 'no-throw', 'throw');
    } catch (error) {
      check(`isV3ApiError ${status}`, isV3ApiError(error), true);
      check(`code ${status}`, (error as V3ApiError).code, code);
      check(`message ${status}`, (error as V3ApiError).message, `m-${status}`);
      check(`status ${status}`, (error as V3ApiError).status, status);
    }
  }

  // 5. Failure envelope on HTTP 200 still throws.
  {
    const client = createV3Client({
      baseUrl: 'http://t/api',
      fetchFn: stubFetch([{ status: 200, body: { success: false, error: { code: 'X', message: 'boom', details: { a: 1 } } } }], []),
    });
    try {
      await client.get('/v3/sales/x');
      check('throws on 200-failure', 'no-throw', 'throw');
    } catch (error) {
      check('200-failure code', (error as V3ApiError).code, 'X');
      check('200-failure details', (error as V3ApiError).details, { a: 1 });
    }
  }

  // 6. Network failure becomes NETWORK_ERROR with status 0.
  {
    const client = createV3Client({
      baseUrl: 'http://t/api',
      fetchFn: (() => Promise.reject(new Error('down'))) as unknown as typeof fetch,
    });
    try {
      await client.get('/v3/sales/x');
      check('throws on network', 'no-throw', 'throw');
    } catch (error) {
      check('network code', (error as V3ApiError).code, 'NETWORK_ERROR');
      check('network status', (error as V3ApiError).status, 0);
    }
  }

  // 7. Domain SDKs hit the right routes with query strings.
  {
    const calls: RecordedCall[] = [];
    const fetchFn = stubFetch(
      [
        { status: 201, body: { success: true, data: { document: { documentNumber: 'INV-1' } } } },
        { status: 200, body: { success: true, data: { netIncome: '20.00' } } },
      ],
      calls,
    );
    const sales = createSalesV3Api(createV3Client({ baseUrl: 'http://t/api', fetchFn }));
    const created = await sales.createSale({ lines: [], payments: [] });
    check('sale route', calls[0].url, 'http://t/api/v3/sales');
    check('sale payload passthrough', created, { document: { documentNumber: 'INV-1' } });
    const accounting = createAccountingV3Api(createV3Client({ baseUrl: 'http://t/api', fetchFn }));
    const pnl = await accounting.getIncomeStatement({ startDate: '2026-01-01', endDate: '2026-12-31' });
    check('pnl route', calls[1].url.startsWith('http://t/api/v3/accounting/income-statement?'), true);
    check('pnl query', calls[1].url.includes('startDate=2026-01-01') && calls[1].url.includes('endDate=2026-12-31'), true);
    check('pnl data', pnl, { netIncome: '20.00' });
  }

  console.log(`v3-client tests: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

void main().catch((error: unknown) => {
  console.error('HARNESS ERROR', error);
  process.exit(1);
});
