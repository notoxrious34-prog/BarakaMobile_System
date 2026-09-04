import Decimal from 'decimal.js';
import type { Contact } from '../hooks/useContacts';

/**
 * TB-074 shared contacts domain maps + decimal.js money helpers.
 * Single source of truth for role labels, badge tones, filters (DRY).
 * All money parsing/comparison/formatting uses Decimal exclusively (Rule ②).
 * `.toFixed(2)` appears ONLY on final render strings, never mid-math.
 */

export const CONTACT_ROLE_MAP: Record<string, string> = {
  SUPPLIER: 'مورد',
  CUSTOMER: 'عميل',
  BOTH: 'مورد وعميل',
};

export function contactRoleLabel(role: string): string {
  return CONTACT_ROLE_MAP[role] ?? role;
}

/** Alias kept for table/modal consumers (single implementation above). */
export const roleLabel = contactRoleLabel;

export type ContactFilter =
  | 'ALL'
  | 'CUSTOMERS'
  | 'SUPPLIERS'
  | 'DEBTORS'
  | 'CREDITORS';

/** Alias kept for page consumers (single type above). */
export type DebtFilter = ContactFilter;

export const CONTACT_FILTERS: { value: ContactFilter; label: string }[] = [
  { value: 'ALL', label: 'الكل' },
  { value: 'CUSTOMERS', label: 'عملاء' },
  { value: 'SUPPLIERS', label: 'موردون' },
  { value: 'DEBTORS', label: 'عليهم ديون' },
  { value: 'CREDITORS', label: 'لهم مستحقات' },
];

/** Parse a server money string safely — invalid → 0. */
export function parseBalance(raw: string | null | undefined): Decimal {
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

const EPS = new Decimal(0.005);

export function isZeroBalance(raw: string | null | undefined): boolean {
  return parseBalance(raw).abs().lessThan(EPS);
}

export function isPositiveBalance(raw: string | null | undefined): boolean {
  const d = parseBalance(raw);
  return !d.abs().lessThan(EPS) && d.greaterThan(new Decimal(0));
}

/** Final-render money string: 2dp HALF_UP. Display only — never feed back into math. */
export function formatMoney2dp(raw: string | null | undefined): string {
  return parseBalance(raw)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
}

/** Alias kept for badge consumers (single implementation above). */
export const fmtMoney = formatMoney2dp;

/** Sum an explicit list of money strings → 2dp (page-level aggregation). */
export function sumBalances(balances: Array<string | null | undefined>): string {
  let total = new Decimal(0);
  for (const b of balances) {
    total = total.plus(parseBalance(b));
  }
  return total.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function accountBalance(c: Contact, role: 'SUPPLIER' | 'CUSTOMER'): Decimal {
  const acc = c.accounts.find((a) => a.role === role);
  return acc ? parseBalance(acc.currentBalance) : new Decimal(0);
}

function positiveOnly(d: Decimal): Decimal {
  return !d.abs().lessThan(EPS) && d.greaterThan(new Decimal(0)) ? d : new Decimal(0);
}

/** Sum of positive CUSTOMER balances (money owed TO us). Returns 2dp string. */
export function sumReceivables(contacts: Contact[]): string {
  let total = new Decimal(0);
  for (const c of contacts) {
    total = total.plus(positiveOnly(accountBalance(c, 'CUSTOMER')));
  }
  return total.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/** Sum of positive SUPPLIER balances (money WE owe). Returns 2dp string. */
export function sumPayables(contacts: Contact[]): string {
  let total = new Decimal(0);
  for (const c of contacts) {
    total = total.plus(positiveOnly(accountBalance(c, 'SUPPLIER')));
  }
  return total.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/** Net position = receivables − payables. Returns 2dp string (may be negative). */
export function netPosition(receivables2dp: string, payables2dp: string): string {
  return parseBalance(receivables2dp)
    .minus(parseBalance(payables2dp))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
}

/** Alias kept for page consumers (single implementation above). */
export const netBalance = netPosition;

export function hasNonZeroBalance(c: Contact): boolean {
  return c.accounts.some((a) => !isZeroBalance(a.currentBalance));
}

export function hasDebtorBalance(c: Contact): boolean {
  const acc = c.accounts.find((a) => a.role === 'CUSTOMER');
  return acc ? isPositiveBalance(acc.currentBalance) : false;
}

export function hasCreditorBalance(c: Contact): boolean {
  const acc = c.accounts.find((a) => a.role === 'SUPPLIER');
  return acc ? isPositiveBalance(acc.currentBalance) : false;
}

export function matchesContactFilter(c: Contact, filter: ContactFilter): boolean {
  switch (filter) {
    case 'ALL':
      return true;
    case 'CUSTOMERS':
      return c.role === 'CUSTOMER' || c.role === 'BOTH';
    case 'SUPPLIERS':
      return c.role === 'SUPPLIER' || c.role === 'BOTH';
    case 'DEBTORS':
      return hasDebtorBalance(c);
    case 'CREDITORS':
      return hasCreditorBalance(c);
  }
}

/** Omnisearch across name + phone + notes. */
export function matchesContactSearch(c: Contact, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    (c.name ?? '').toLowerCase().includes(q) ||
    (c.phone ?? '').toLowerCase().includes(q) ||
    (c.notes ?? '').toLowerCase().includes(q)
  );
}
