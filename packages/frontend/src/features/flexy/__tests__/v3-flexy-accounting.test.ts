/**
 * DIRECTIVE-023 Stage 10.4 — flexy & accounting unit tests (tsx harness).
 *
 * Pure-logic coverage: top-up margin math + validation, float-transfer
 * leg validation, balance-equation invariant, close gating, and Arabic
 * error mapping. Run via `pnpm --filter frontend test`.
 */
import {
  buildFloatTransferPayload,
  buildTopUpPayload,
  previewTopUpMargin,
  summarizeAccountingError,
  summarizeFlexyError,
} from '../utils/v3FlexyPayload';
import { canClosePeriod, checkBalanceEquation, sumDecimalStrings } from '../../accounting/utils/v3StatementChecks';
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

function topup(): void {
  check('margin preview', previewTopUpMargin('100.00', '90.00', '5.00'), { collected: '105.00', margin: '15.00', valid: true });
  check('default cost=face', previewTopUpMargin('200', undefined, undefined), { collected: '200.00', margin: '0.00', valid: true });
  check('negative margin invalid', previewTopUpMargin('100.00', '120.00', undefined).valid, false);

  const payload = buildTopUpPayload({ walletId: 'w-1', targetPhoneNumber: '0550123456', faceAmount: '100', paymentMethod: 'CASH' });
  check('payload 2dp', [payload.faceAmount, payload.paymentMethod], ['100.00', 'CASH']);

  let noPhone = '';
  try {
    buildTopUpPayload({ walletId: 'w-1', targetPhoneNumber: '  ', faceAmount: '100.00', paymentMethod: 'CASH' });
  } catch (e) {
    noPhone = e instanceof Error ? e.message : '';
  }
  check('phone required', noPhone.length > 0, true);

  let noParty = '';
  try {
    buildTopUpPayload({ walletId: 'w-1', targetPhoneNumber: '0550', faceAmount: '100.00', paymentMethod: 'ON_ACCOUNT' });
  } catch (e) {
    noParty = e instanceof Error ? e.message : '';
  }
  check('on-account needs party', noParty.length > 0, true);
}

function transfer(): void {
  const ok = buildFloatTransferPayload({
    sourceAccountType: 'CASH',
    targetAccountType: 'WALLET',
    targetWalletId: 'w-1',
    amount: '200',
    reason: 'Dealer float',
  });
  check('transfer amount 2dp', ok.amount, '200.00');

  const cases: Array<[string, () => void]> = [
    ['same legs', () => buildFloatTransferPayload({ sourceAccountType: 'CASH', targetAccountType: 'CASH', amount: '10.00', reason: 'x' })],
    ['missing target wallet', () => buildFloatTransferPayload({ sourceAccountType: 'CASH', targetAccountType: 'WALLET', amount: '10.00', reason: 'x' })],
    ['stray source wallet', () => buildFloatTransferPayload({ sourceAccountType: 'BANK', sourceWalletId: 'w-1', targetAccountType: 'CASH', amount: '10.00', reason: 'x' })],
    ['zero amount', () => buildFloatTransferPayload({ sourceAccountType: 'CASH', targetAccountType: 'BANK', amount: '0.00', reason: 'x' })],
    ['empty reason', () => buildFloatTransferPayload({ sourceAccountType: 'CASH', targetAccountType: 'BANK', amount: '10.00', reason: '  ' })],
  ];
  for (const [name, fn] of cases) {
    let threw = false;
    try {
      fn();
    } catch {
      threw = true;
    }
    check(`transfer rejects: ${name}`, threw, true);
  }
}

function invariant(): void {
  check('sums', sumDecimalStrings(['100.00', '50.50', '-25.25']), '125.25');
  const good = checkBalanceEquation('750.00', '0.00', '750.00');
  check('balanced equation', good.balanced, true);
  const bad = checkBalanceEquation('750.00', '0.00', '700.00');
  check('imbalanced equation', bad.balanced, false);
  check('close gate open', canClosePeriod('OPEN'), true);
  check('close gate closed', canClosePeriod('CLOSED'), false);
  check('close gate locked', canClosePeriod('LOCKED'), false);
}

function errors(): void {
  check('wallet balance', summarizeFlexyError(new V3ApiError('INSUFFICIENT_WALLET_BALANCE', 'low', 422)), 'رصيد المحفظة العائمة لا يكفي — اشحن المحفظة أولاً');
  check('float legs', summarizeFlexyError(new V3ApiError('INVALID_FLOAT_TRANSFER', 'bad', 400)), 'أرجل التحويل غير صالحة — تحقق من المصدر والوجهة');
  check('period closed', summarizeAccountingError(new V3ApiError('FISCAL_PERIOD_CLOSED', 'shut', 409)), 'الفترة مغلقة — لا يمكن الترحيل أو الإغلاق مجدداً');
  check('imbalanced', summarizeAccountingError(new V3ApiError('IMBALANCED_STATEMENTS', 'off', 500)), 'الميزانية غير متوازنة — راجع القيود قبل الإغلاق');
}

topup();
transfer();
invariant();
errors();

console.log(`v3-flexy-accounting tests: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
