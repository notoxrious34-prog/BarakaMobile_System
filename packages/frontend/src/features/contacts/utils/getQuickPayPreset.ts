import Decimal from 'decimal.js';

export type QuickPayContact = {
  accounts: Array<{ role: string; currentBalance: string }>;
};

/** Decimal non-zero check (|balance| >= 0.005) — no Number()/Math.abs(). */
function nonZero(raw: string): boolean {
  try {
    return new Decimal(raw).abs().greaterThanOrEqualTo(new Decimal('0.005'));
  } catch {
    return false;
  }
}

/**
 * TB-074 — quick-pay routing via Decimal balances (logic unchanged):
 * customer-only debt → collect (PAYMENT_IN), supplier-only → pay
 * (PAYMENT_OUT), both → collect first, none → collect default.
 */
export function getQuickPayPreset(contact: QuickPayContact): 'PAYMENT_IN' | 'PAYMENT_OUT' {
  const supplierAcc = contact.accounts.find((a) => a.role === 'SUPPLIER');
  const customerAcc = contact.accounts.find((a) => a.role === 'CUSTOMER');
  const supplierNonZero = supplierAcc ? nonZero(supplierAcc.currentBalance) : false;
  const customerNonZero = customerAcc ? nonZero(customerAcc.currentBalance) : false;
  if (customerNonZero && !supplierNonZero) return 'PAYMENT_IN';
  if (supplierNonZero && !customerNonZero) return 'PAYMENT_OUT';
  if (customerNonZero && supplierNonZero) return 'PAYMENT_IN';
  if (supplierNonZero) return 'PAYMENT_OUT';
  return 'PAYMENT_IN';
}
