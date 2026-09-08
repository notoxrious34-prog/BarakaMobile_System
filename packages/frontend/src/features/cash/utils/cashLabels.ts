import Decimal from 'decimal.js';

/**
 * TB-079 shared cash domain maps + decimal.js money helpers.
 * Follows the exact design pattern of contactLabels.ts / transactionLabels.ts.
 * All money parsing/comparison/formatting uses Decimal exclusively (Rule ②).
 * `.toFixed(2)` appears ONLY on final render strings, never mid-math.
 */

export const CASH_CATEGORY_MAP: Record<string, string> = {
  SALE: 'مبيعات',
  PURCHASE: 'مشتريات',
  EXPENSE: 'مصروفات',
  DEPOSIT: 'إيداع مالك',
  WITHDRAWAL: 'سحب مالك',
  REPAIR_PAYMENT: 'دفعات صيانة',
  DEBT_COLLECTION: 'تحصيل ديون',
  DEBT_SETTLEMENT: 'تحصيل ديون زبائن',
  SUPPLIER_PAYMENT: 'تسديد مورد',
  // Backend CashMovementCategory enum (ground truth, Prisma):
  SALE_PAYMENT: 'تحصيل مبيعات',
  PURCHASE_PAYMENT: 'سداد مشتريات',
  PAYMENT_IN: 'تحصيل',
  PAYMENT_OUT: 'دفع',
  OWNER_DRAW: 'سحب مالك',
  OWNER_DEPOSIT: 'إيداع مالك',
  ADJUSTMENT: 'تسوية',
};

export function cashCategoryLabel(category: string): string {
  return CASH_CATEGORY_MAP[category] ?? category;
}

const IN_TONE = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
const OUT_TONE = 'border-rose-500/30 bg-rose-500/10 text-rose-400';

/**
 * Badge tone for a cash movement (AD-61):
 * IN → emerald (cash in), OUT → rose (cash out).
 */
export function getCashMovementBadgeTone(type: 'IN' | 'OUT', _category: string): string {
  return type === 'IN' ? IN_TONE : OUT_TONE;
}

/** Parse a money string safely — invalid → 0. */
export function parseCashAmount(raw: string | number | Decimal | null | undefined): Decimal {
  try {
    if (raw === null || raw === undefined) return new Decimal(0);
    if (raw instanceof Decimal) return raw.isFinite() ? raw : new Decimal(0);
    if (typeof raw === 'number') {
      if (!Number.isFinite(raw)) return new Decimal(0);
      return new Decimal(raw);
    }
    if (String(raw).trim() === '') return new Decimal(0);
    const d = new Decimal(String(raw));
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

/**
 * Final-render cash string with currency: `1,234.50 د.ج` style → `1234.50 د.ج`.
 * Display only — never feed back into math.
 */
export function formatCashAmount(
  amount: string | number | Decimal,
  currencySymbol = 'د.ج',
): string {
  const d = parseCashAmount(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return `${d.toFixed(2)} ${currencySymbol}`;
}

export type CashValidation = {
  isValid: boolean;
  error?: string;
  decimalValue?: Decimal;
};

/**
 * Validate a cash input string (Rule ②):
 * positive, non-zero, finite, max 2dp; optionally capped by maxLimit
 * (e.g. owner draws against the current balance).
 */
export function validateCashInput(amount: string, maxLimit?: string): CashValidation {
  const t = amount.trim();
  if (!t) return { isValid: false, error: 'المبلغ مطلوب' };
  let d: Decimal;
  try {
    d = new Decimal(t);
  } catch {
    return { isValid: false, error: 'المبلغ يجب أن يكون رقمًا موجبًا' };
  }
  if (!d.isFinite() || d.lessThanOrEqualTo(new Decimal(0))) {
    return { isValid: false, error: 'المبلغ يجب أن يكون رقمًا موجبًا' };
  }
  if (d.decimalPlaces() > 2) {
    return { isValid: false, error: 'رقمان عشريان كحد أقصى' };
  }
  if (maxLimit !== undefined) {
    try {
      const cap = new Decimal(maxLimit);
      if (cap.isFinite() && d.greaterThan(cap)) {
        return { isValid: false, error: 'المبلغ يتجاوز الرصيد المتوفر' };
      }
    } catch {
      // Unparseable cap → skip the cap check, base validation already passed.
    }
  }
  return {
    isValid: true,
    decimalValue: d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
  };
}
