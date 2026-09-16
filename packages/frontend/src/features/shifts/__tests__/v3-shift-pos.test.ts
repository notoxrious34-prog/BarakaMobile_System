/**
 * DIRECTIVE-021 Stage 10.2 — shift lifecycle + POS payload unit tests.
 *
 * Zero-dependency tsx harness (same convention as the v3-client suite):
 * pure reducer transitions, payload mapping, discrepancy preview and
 * error summarization. Run via `pnpm --filter frontend test`.
 */
import { nextShiftLifecycle, type ShiftLifecycle } from '../store/shiftUiStore';
import { buildV3SalePayload, previewDiscrepancy, summarizeV3SaleError } from '../../pos/utils/buildV3Sale';
import { V3ApiError } from '@/api/v3/client';

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

function lifecycle(): void {
  let s: ShiftLifecycle = 'NONE';
  s = nextShiftLifecycle(s, { type: 'BEGIN_OPEN' });
  check('none→opening', s, 'OPENING');
  s = nextShiftLifecycle(s, { type: 'BEGIN_CLOSE' });
  check('opening ignores close', s, 'OPENING');
  s = nextShiftLifecycle(s, { type: 'OPENED' });
  check('opening→active', s, 'ACTIVE');
  s = nextShiftLifecycle(s, { type: 'BEGIN_CLOSE' });
  check('active→closing', s, 'CLOSING');
  s = nextShiftLifecycle(s, { type: 'CANCEL' });
  check('closing cancel→active', s, 'ACTIVE');
  s = nextShiftLifecycle('CLOSING', { type: 'CLOSED' });
  check('closing→none', s, 'NONE');
  check('stray closed ignored', nextShiftLifecycle('ACTIVE', { type: 'CLOSED' }), 'ACTIVE');
}

function payload(): void {
  const sale = buildV3SalePayload({
    lines: [
      { itemId: 'item-1', quantity: 2, unitPrice: '150.0' },
      { itemId: 'item-2', quantity: 1, unitPrice: '40.00', serialIds: ['ser-a', 'ser-b'] },
    ],
    payments: [
      { method: 'CASH', amount: '100' },
      { method: 'BANK', amount: '50.00' },
      { method: 'WALLET', amount: '30.00' },
    ],
    discountAmount: '5',
  });
  check('bulk line', sale.lines[0], { itemId: 'item-1', quantity: 2, unitPrice: '150.00' });
  check('serial split count', sale.lines.length, 3);
  check('serial line', sale.lines[1], { itemId: 'item-2', serialId: 'ser-a', quantity: 1, unitPrice: '40.00' });
  check('method mapping', sale.payments.map((p) => p.paymentMethod), ['CASH', 'BANK_TRANSFER', 'DIGITAL_WALLET']);
  check('discount 2dp', sale.discountAmount, '5.00');

  const credit = buildV3SalePayload({
    lines: [{ itemId: 'item-1', quantity: 1, unitPrice: '200.00' }],
    payments: [{ method: 'CASH', amount: '10.00' }],
    partyId: 'party-1',
  });
  check('credit party', credit.partyId, 'party-1');
  check('credit payments exclude on-account', credit.payments, [{ paymentMethod: 'CASH', amount: '10.00' }]);

  let threw = '';
  try {
    buildV3SalePayload({ lines: [], payments: [] });
  } catch (e) {
    threw = e instanceof Error ? e.message : '';
  }
  check('empty basket throws', threw.length > 0, true);

  let creditThrew = '';
  try {
    buildV3SalePayload({
      lines: [{ itemId: 'i', quantity: 1, unitPrice: '10.00' }],
      payments: [{ method: 'ON_ACCOUNT', amount: '10.00' }],
    });
  } catch (e) {
    creditThrew = e instanceof Error ? e.message : '';
  }
  check('on-account without party throws', creditThrew.length > 0, true);
}

function discrepancy(): void {
  check('match', previewDiscrepancy('220.00', '220.00'), { difference: '0.00', tone: 'match' });
  check('surplus', previewDiscrepancy('225.50', '220.00'), { difference: '5.50', tone: 'surplus' });
  check('deficit', previewDiscrepancy('215', '220.00'), { difference: '-5.00', tone: 'deficit' });
  check('empty', previewDiscrepancy('', '220.00'), { difference: '0.00', tone: 'none' });
  check('invalid', previewDiscrepancy('abc', '220.00'), { difference: '0.00', tone: 'none' });
}

function errors(): void {
  check(
    'credit limit Arabic',
    summarizeV3SaleError(new V3ApiError('VALIDATION_ERROR', 'Credit limit exceeded for customer X.', 422)),
    'تجاوز سقف الدين المسموح لهذا الزبون — خفّض المبلغ الآجل أو ارفع السقف',
  );
  check('422 generic', summarizeV3SaleError(new V3ApiError('INSUFFICIENT_STOCK', 'No stock.', 422)).length > 0, true);
  check('404 message', summarizeV3SaleError(new V3ApiError('NOT_FOUND', 'Gone.', 404)).length > 0, true);
  check('plain error passthrough', summarizeV3SaleError(new Error('boom')), 'boom');
}

lifecycle();
payload();
discrepancy();
errors();

console.log(`v3-shift-pos tests: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
