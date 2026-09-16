import Decimal from 'decimal.js';
import { to2dpString } from '@/features/pos/utils/buildV3Sale';
import type { FloatTransferPayload, TopUpPayload } from '@/api/v3/types';
import { isV3ApiError } from '@/api/v3/client';

/**
 * DIRECTIVE-023 Stage 10.4 — flexy payload builders (pure, testable).
 *
 * Mirrors the backend guards (STAGE-7.2 e2e): cost defaults to face,
 * fee defaults to 0, margin (face + fee − cost) can never be negative,
 * transfer legs must differ with wallet ids exactly on WALLET legs.
 * All math is decimal.js on 2dp strings.
 */

export interface TopUpFormInput {
  walletId: string;
  targetPhoneNumber: string;
  faceAmount: string;
  costAmount?: string;
  feeAmount?: string;
  paymentMethod: 'CASH' | 'ON_ACCOUNT';
  partyId?: string;
}

export function previewTopUpMargin(faceRaw: string, costRaw?: string, feeRaw?: string): { collected: string; margin: string; valid: boolean } {
  try {
    const face = new Decimal(faceRaw.trim() === '' ? '0' : faceRaw.trim());
    const cost = new Decimal(costRaw?.trim() ? costRaw.trim()! : faceRaw.trim() === '' ? '0' : faceRaw.trim());
    const fee = new Decimal(feeRaw?.trim() ? feeRaw.trim()! : '0');
    const collected = face.plus(fee).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const margin = collected.sub(cost).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return {
      collected: collected.toFixed(2),
      margin: margin.toFixed(2),
      valid: face.greaterThan(0) && !cost.isNegative() && !fee.isNegative() && !margin.isNegative(),
    };
  } catch {
    return { collected: '0.00', margin: '0.00', valid: false };
  }
}

export function buildTopUpPayload(input: TopUpFormInput): TopUpPayload {
  if (!input.walletId) throw new Error('اختر المحفظة أولاً');
  if (!input.targetPhoneNumber.trim()) throw new Error('رقم هاتف المستفيد مطلوب');
  const preview = previewTopUpMargin(input.faceAmount, input.costAmount, input.feeAmount);
  if (!preview.valid) throw new Error('مبالغ التعبئة غير صالحة أو الهامش سالب');
  if (input.paymentMethod === 'ON_ACCOUNT' && !input.partyId) {
    throw new Error('التعبئة الآجلة تتطلب زبوناً مسجلاً');
  }
  if (input.paymentMethod === 'CASH' && input.partyId) {
    throw new Error('الزبون مخصص للبيع الآجل فقط');
  }
  return {
    walletId: input.walletId,
    targetPhoneNumber: input.targetPhoneNumber.trim(),
    faceAmount: to2dpString(input.faceAmount),
    costAmount: input.costAmount?.trim() ? to2dpString(input.costAmount) : undefined,
    feeAmount: input.feeAmount?.trim() ? to2dpString(input.feeAmount) : undefined,
    paymentMethod: input.paymentMethod,
    partyId: input.partyId,
  };
}

export type FloatLeg = 'CASH' | 'BANK' | 'WALLET';

export interface FloatTransferFormInput {
  sourceAccountType: FloatLeg;
  sourceWalletId?: string;
  targetAccountType: FloatLeg;
  targetWalletId?: string;
  amount: string;
  reason: string;
}

export function buildFloatTransferPayload(input: FloatTransferFormInput): FloatTransferPayload {
  if (input.sourceAccountType === input.targetAccountType) {
    throw new Error('المصدر والوجهة يجب أن يكونا مختلفين');
  }
  if ((input.sourceAccountType === 'WALLET') !== !!input.sourceWalletId) {
    throw new Error('محفظة المصدر مطلوبة عند التحويل من محفظة فقط');
  }
  if ((input.targetAccountType === 'WALLET') !== !!input.targetWalletId) {
    throw new Error('محفظة الوجهة مطلوبة عند التحويل إلى محفظة فقط');
  }
  let amount: Decimal;
  try {
    amount = new Decimal(input.amount.trim());
  } catch {
    throw new Error('المبلغ غير صالح');
  }
  if (!amount.greaterThan(0)) throw new Error('المبلغ يجب أن يكون أكبر من الصفر');
  if (!input.reason.trim()) throw new Error('سبب التحويل مطلوب');
  return {
    sourceAccountType: input.sourceAccountType,
    sourceWalletId: input.sourceWalletId,
    targetAccountType: input.targetAccountType,
    targetWalletId: input.targetWalletId,
    amount: amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
    reason: input.reason.trim(),
  };
}

/** Arabic mapping for flexy domain errors. */
export function summarizeFlexyError(error: unknown): string {
  if (isV3ApiError(error)) {
    switch (error.code) {
      case 'INSUFFICIENT_WALLET_BALANCE':
        return 'رصيد المحفظة العائمة لا يكفي — اشحن المحفظة أولاً';
      case 'INACTIVE_WALLET':
        return 'المحفظة غير نشطة — لا يمكن تنفيذ العملية';
      case 'WALLET_NOT_FOUND':
        return 'المحفظة غير موجودة — حدّث القائمة وحاول مجدداً';
      case 'INVALID_FLEXY_PRICING':
        return 'أسعار التعبئة غير صالحة (الهامش سالب)';
      case 'INVALID_FLOAT_TRANSFER':
        return 'أرجل التحويل غير صالحة — تحقق من المصدر والوجهة';
      default:
        return error.message || 'فشلت العملية';
    }
  }
  return error instanceof Error ? error.message : 'فشلت العملية';
}

export function summarizeAccountingError(error: unknown): string {
  if (isV3ApiError(error)) {
    switch (error.code) {
      case 'FISCAL_PERIOD_CLOSED':
        return 'الفترة مغلقة — لا يمكن الترحيل أو الإغلاق مجدداً';
      case 'IMBALANCED_STATEMENTS':
        return 'الميزانية غير متوازنة — راجع القيود قبل الإغلاق';
      case 'LEDGER_IMBALANCE':
        return 'القيد غير متوازن — رفضه دفتر الأستاذ';
      default:
        return error.message || 'فشلت العملية المحاسبية';
    }
  }
  return error instanceof Error ? error.message : 'فشلت العملية المحاسبية';
}
