import Decimal from 'decimal.js';

/**
 * TB-076 shared transactions domain maps + decimal.js money helpers.
 * Single source of truth for type labels, AD-61 badge tones, filters (DRY).
 * All money parsing/comparison/formatting uses Decimal exclusively (Rule ②).
 * `.toFixed(2)` appears ONLY on final render strings, never mid-math.
 */

export type TransactionTypeKey =
  | 'SALE'
  | 'PURCHASE'
  | 'PAYMENT_IN'
  | 'PAYMENT_OUT'
  | 'OFFSET';

export const TRANSACTION_TYPE_MAP: Record<string, string> = {
  SALE: 'بيع',
  PURCHASE: 'شراء',
  PAYMENT_IN: 'تحصيل',
  PAYMENT_OUT: 'دفع',
  OFFSET: 'مقاصة',
};

export function transactionTypeLabel(type: string): string {
  return TRANSACTION_TYPE_MAP[type] ?? type;
}

const TONE_BOX: Record<string, string> = {
  SALE: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  PURCHASE: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  PAYMENT_IN: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  PAYMENT_OUT: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
  OFFSET: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
};

const FALLBACK_BOX = 'border-navy-border/40 bg-white/[0.04] text-slate-400';

export function transactionTypeBox(type: string): string {
  return TONE_BOX[type] ?? FALLBACK_BOX;
}

export type TransactionFilter =
  | 'ALL'
  | 'SALE'
  | 'PURCHASE'
  | 'PAYMENT_IN'
  | 'PAYMENT_OUT'
  | 'OFFSET';

export const TRANSACTION_FILTERS: { value: TransactionFilter; label: string }[] = [
  { value: 'ALL', label: 'الكل' },
  { value: 'SALE', label: 'مبيعات' },
  { value: 'PURCHASE', label: 'مشتريات' },
  { value: 'PAYMENT_IN', label: 'سندات قبض' },
  { value: 'PAYMENT_OUT', label: 'سندات دفع' },
  { value: 'OFFSET', label: 'مقاصات' },
];

/** Parse a server money string safely — invalid → 0. */
export function parseAmount(raw: string | number | null | undefined): Decimal {
  try {
    if (raw === null || raw === undefined || String(raw).trim() === '') {
      return new Decimal(0);
    }
    const d = new Decimal(String(raw));
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

/** Final-render money string: 2dp HALF_UP. Display only — never feed back into math. */
export function formatMoney2dp(raw: string | number | null | undefined): string {
  return parseAmount(raw).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/** Sum an explicit list of money strings → 2dp. */
export function sumAmounts(amounts: Array<string | number | null | undefined>): string {
  let total = new Decimal(0);
  for (const a of amounts) {
    total = total.plus(parseAmount(a));
  }
  return total.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export type AmountCarrier = { type: string; amount: string | number };

/** Sum amounts for one transaction type → 2dp string. */
export function sumByType<T extends AmountCarrier>(transactions: T[], type: string): string {
  let total = new Decimal(0);
  for (const t of transactions) {
    if (t.type === type) total = total.plus(parseAmount(t.amount));
  }
  return total.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/** Positive Decimal check (finite, > 0, max 2dp). Used by form validators. */
export function parsePositive2dp(raw: string): Decimal | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const d = new Decimal(t);
    if (!d.isFinite() || d.lessThanOrEqualTo(new Decimal(0))) return null;
    if (d.decimalPlaces() > 2) return null;
    return d;
  } catch {
    return null;
  }
}

/** Positive integer check (quantities). Returns the int or null. */
export function parsePositiveInt(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}
