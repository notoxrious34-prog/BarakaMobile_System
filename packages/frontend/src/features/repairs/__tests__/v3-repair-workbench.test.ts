/**
 * DIRECTIVE-022 Stage 10.3 — repair workbench unit tests (tsx harness).
 *
 * Pure-logic coverage: FSM edge table (allowed vs disallowed buttons),
 * delivery settlement math (discount waterfall, split payments,
 * outstanding gating), and error mapping (terminal 409, stock 422).
 * Run via `pnpm --filter frontend test`.
 */
import { allowedV3Transitions, canV3Transition, isV3Terminal, normalizeRepairStatus } from '../utils/v3RepairFsm';
import { buildDeliverRepairPayload } from '../utils/v3RepairSettlement';
import { summarizeV3SaleError } from '@/features/pos/utils/buildV3Sale';
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

function fsm(): void {
  check('received edges', allowedV3Transitions('RECEIVED'), ['DIAGNOSING', 'CANCELLED']);
  check('diagnosing edges', allowedV3Transitions('DIAGNOSING'), ['QUOTED', 'CANCELLED']);
  check('quoted edges', allowedV3Transitions('QUOTED'), ['APPROVED', 'CANCELLED']);
  check('approved edges', allowedV3Transitions('APPROVED'), ['IN_REPAIR', 'CANCELLED']);
  check('in-repair edges', allowedV3Transitions('IN_REPAIR'), ['READY', 'CANCELLED']);
  check('ready edges', allowedV3Transitions('READY'), ['DELIVERED', 'CANCELLED']);
  check('delivered terminal', allowedV3Transitions('DELIVERED'), []);
  check('cancelled terminal', allowedV3Transitions('CANCELLED'), []);
  check('no skip diagnosing→approved', canV3Transition('DIAGNOSING', 'APPROVED'), false);
  check('no reopen delivered', canV3Transition('DELIVERED', 'IN_REPAIR'), false);
  check('alias in-progress', normalizeRepairStatus('IN_PROGRESS'), 'IN_REPAIR');
  check('alias edges', allowedV3Transitions('IN_PROGRESS'), ['READY', 'CANCELLED']);
  check('terminal delivered', isV3Terminal('DELIVERED'), true);
  check('non-terminal ready', isV3Terminal('READY'), false);
}

function settlement(): void {
  const full = buildDeliverRepairPayload({
    laborPrice: '50.00',
    partsTotal: '40.00',
    discountAmount: '10.00',
    payments: [
      { method: 'CASH', amount: '50.00' },
      { method: 'BANK', amount: '30.00' },
    ],
    hasRegisteredCustomer: false,
  });
  check('total 80', full.total, '80.00');
  check('paid 80', full.paid, '80.00');
  check('outstanding 0', full.outstanding, '0.00');
  check('legs', full.payload.payments, [
    { paymentMethod: 'CASH', amount: '50.00' },
    { paymentMethod: 'BANK_TRANSFER', amount: '30.00' },
  ]);

  const credit = buildDeliverRepairPayload({
    laborPrice: '50.00',
    partsTotal: '40.00',
    payments: [{ method: 'CASH', amount: '20.00' }],
    hasRegisteredCustomer: true,
  });
  check('credit outstanding', credit.outstanding, '70.00');
  check('on-account dropped from legs', credit.payload.payments, [{ paymentMethod: 'CASH', amount: '20.00' }]);

  let discountThrew = '';
  try {
    buildDeliverRepairPayload({ laborPrice: '10.00', partsTotal: '5.00', discountAmount: '20.00', payments: [], hasRegisteredCustomer: true });
  } catch (e) {
    discountThrew = e instanceof Error ? e.message : '';
  }
  check('discount waterfall', discountThrew.length > 0, true);

  let overpayThrew = '';
  try {
    buildDeliverRepairPayload({ laborPrice: '10.00', partsTotal: '0.00', payments: [{ method: 'CASH', amount: '99.00' }], hasRegisteredCustomer: true });
  } catch (e) {
    overpayThrew = e instanceof Error ? e.message : '';
  }
  check('overpay rejected', overpayThrew.length > 0, true);

  let walkinThrew = '';
  try {
    buildDeliverRepairPayload({ laborPrice: '10.00', partsTotal: '0.00', payments: [], hasRegisteredCustomer: false });
  } catch (e) {
    walkinThrew = e instanceof Error ? e.message : '';
  }
  check('walk-in credit rejected', walkinThrew.length > 0, true);
}

function errors(): void {
  check(
    'terminal 409',
    summarizeV3SaleError(new V3ApiError('REPAIR_ORDER_CLOSED', 'Order is DELIVERED.', 409)).length > 0,
    true,
  );
  check(
    'stock 422',
    summarizeV3SaleError(new V3ApiError('INSUFFICIENT_STOCK', 'No stock.', 422)),
    'تعذّر إتمام البيع: مخزون غير كافٍ أو رصيد عائم ناقص',
  );
}

fsm();
settlement();
errors();

console.log(`v3-repair-workbench tests: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
