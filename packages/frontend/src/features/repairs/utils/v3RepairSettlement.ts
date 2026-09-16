import Decimal from 'decimal.js';
import { mapUiPaymentToBackend, to2dpString, type UiPaymentMethod } from '@/features/pos/utils/buildV3Sale';
import type { DeliverRepairPayload } from '@/api/v3/types';

/**
 * DIRECTIVE-022 Stage 10.3 — repair settlement math (pure, testable).
 *
 * `buildDeliverRepairPayload` validates the Discount Waterfall
 * (0 ≤ discount ≤ labor + parts) and the payment split (paid ≤ total,
 * ON_ACCOUNT allowed only with the ticket's registered customer), then
 * maps UI methods onto backend legs. Everything is decimal.js on 2dp
 * strings — no floats.
 */

export interface SettlementPaymentInput {
  method: UiPaymentMethod;
  amount: string;
}

export interface SettlementInput {
  laborPrice: string;
  partsTotal: string;
  discountAmount?: string;
  payments: SettlementPaymentInput[];
  hasRegisteredCustomer: boolean;
}

export interface SettlementSummary {
  payload: DeliverRepairPayload;
  total: string;
  paid: string;
  outstanding: string;
}

export function buildDeliverRepairPayload(input: SettlementInput): SettlementSummary {
  const labor = new Decimal(input.laborPrice);
  const parts = new Decimal(input.partsTotal);
  const billable = labor.plus(parts);
  const discountRaw = input.discountAmount?.trim() ? input.discountAmount.trim() : '0.00';
  const discount = new Decimal(discountRaw);
  if (discount.isNegative() || discount.greaterThan(billable)) {
    throw new Error('الخصم يجب أن يكون بين 0 وإجمالي الفاتورة');
  }
  const total = billable.sub(discount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  let paid = new Decimal(0);
  const legs: DeliverRepairPayload['payments'] = [];
  for (const payment of input.payments) {
    const backend = mapUiPaymentToBackend(payment.method);
    const amount = new Decimal(payment.amount);
    if (amount.isNegative()) throw new Error('مبلغ الدفع يجب أن يكون موجباً');
    paid = paid.plus(amount);
    if (backend) legs.push({ paymentMethod: backend, amount: to2dpString(payment.amount) });
  }
  paid = paid.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (paid.greaterThan(total)) throw new Error('المبلغ المدفوع يتجاوز الإجمالي');
  const outstanding = total.sub(paid);
  if (outstanding.greaterThan(0) && !input.hasRegisteredCustomer) {
    throw new Error('المبلغ المتبقي يتطلب زبوناً مسجلاً (بيع آجل)');
  }
  return {
    payload: {
      payments: legs,
      discountAmount: to2dpString(discountRaw),
    },
    total: total.toFixed(2),
    paid: paid.toFixed(2),
    outstanding: outstanding.toFixed(2),
  };
}
