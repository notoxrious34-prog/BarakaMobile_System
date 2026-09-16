import Decimal from 'decimal.js';
import type { SalePayload } from '@/api/v3/types';
import { isV3ApiError } from '@/api/v3/client';

/**
 * DIRECTIVE-021 Stage 10.2 — v3 POS checkout bridge (pure logic).
 *
 * `buildV3SalePayload` maps ticket lines + UI payment methods onto the
 * `POST /v3/sales` contract. Backend truth (STAGE-9.1 e2e): methods are
 * CASH | DIGITAL_WALLET | BANK_TRANSFER; credit is an underpayment with
 * `partyId` (the subledger enforces the limit → HTTP 422). UI aliases:
 * BANK → BANK_TRANSFER, WALLET → DIGITAL_WALLET, ON_ACCOUNT → outstanding
 * (requires a registered customer). All math is decimal.js on 2dp
 * strings — no floats cross this module.
 */

export type UiPaymentMethod = 'CASH' | 'BANK' | 'WALLET' | 'ON_ACCOUNT';

export interface TicketLineInput {
  itemId: string;
  quantity: number;
  unitPrice: string;
  serialIds?: string[];
}

export interface UiPaymentInput {
  method: UiPaymentMethod;
  amount: string;
}

export interface CheckoutInput {
  lines: TicketLineInput[];
  payments: UiPaymentInput[];
  partyId?: string;
  discountAmount?: string;
}

const BACKEND_METHOD: Record<'CASH' | 'BANK' | 'WALLET', 'CASH' | 'BANK_TRANSFER' | 'DIGITAL_WALLET'> = {
  CASH: 'CASH',
  BANK: 'BANK_TRANSFER',
  WALLET: 'DIGITAL_WALLET',
};

export function to2dpString(value: string): string {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/** Maps a UI payment method to its backend leg; ON_ACCOUNT has no leg (outstanding). */
export function mapUiPaymentToBackend(method: UiPaymentMethod): 'CASH' | 'BANK_TRANSFER' | 'DIGITAL_WALLET' | null {
  if (method === 'ON_ACCOUNT') return null;
  return BACKEND_METHOD[method];
}

export function buildV3SalePayload(input: CheckoutInput): SalePayload {
  if (input.lines.length === 0) {
    throw new Error('لا يمكن إتمام البيع بسلة فارغة');
  }
  const onAccount = input.payments.some((p) => p.method === 'ON_ACCOUNT');
  if (onAccount && !input.partyId) {
    throw new Error('البيع بالدين يتطلب اختيار زبون مسجل');
  }
  return {
    partyId: input.partyId,
    lines: input.lines.flatMap((line) => {
      if (line.serialIds && line.serialIds.length > 0) {
        return line.serialIds.map((serialId) => ({
          itemId: line.itemId,
          serialId,
          quantity: 1,
          unitPrice: to2dpString(line.unitPrice),
        }));
      }
      return [
        {
          itemId: line.itemId,
          quantity: line.quantity,
          unitPrice: to2dpString(line.unitPrice),
        },
      ];
    }),
    discountAmount: input.discountAmount ? to2dpString(input.discountAmount) : undefined,
    payments: input.payments
      .filter((p) => p.method !== 'ON_ACCOUNT')
      .map((p) => ({
        paymentMethod: BACKEND_METHOD[p.method as 'CASH' | 'BANK' | 'WALLET'],
        amount: to2dpString(p.amount),
      })),
  };
}

/** Discrepancy preview for the close-shift modal: counted − expected. */
export function previewDiscrepancy(countedRaw: string, expectedRaw: string): { difference: string; tone: 'match' | 'surplus' | 'deficit' | 'none' } {
  if (countedRaw.trim() === '') return { difference: '0.00', tone: 'none' };
  let counted: Decimal;
  try {
    counted = new Decimal(countedRaw.trim());
  } catch {
    return { difference: '0.00', tone: 'none' };
  }
  const difference = counted.sub(new Decimal(expectedRaw)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (difference.isZero()) return { difference: '0.00', tone: 'match' };
  return {
    difference: difference.toFixed(2),
    tone: difference.greaterThan(0) ? 'surplus' : 'deficit',
  };
}

/** Friendly Arabic message for a failed v3 sale submission. */
export function summarizeV3SaleError(error: unknown): string {
  if (isV3ApiError(error)) {
    if (error.status === 422 && /credit limit/i.test(error.message)) {
      return 'تجاوز سقف الدين المسموح لهذا الزبون — خفّض المبلغ الآجل أو ارفع السقف';
    }
    if (error.status === 422) return 'تعذّر إتمام البيع: مخزون غير كافٍ أو رصيد عائم ناقص';
    if (error.status === 404) return 'لم يتم العثور على صنف أو مستند — حدّث البيانات وحاول مجدداً';
    if (error.status === 409) return 'تعارض أثناء التسجيل — أعد المحاولة (مفتاح عدم التكرار يحمي من الازدواج)';
    return error.message || 'فشل إتمام البيع';
  }
  return error instanceof Error ? error.message : 'فشل إتمام البيع';
}
