import Decimal from 'decimal.js';

/**
 * DIRECTIVE-023 Stage 10.4 — statement invariant helpers (pure, testable).
 *
 * Recomputes the balance-sheet equation client-side from the 2dp string
 * lines the backend returns, so the dashboard banner is an independent
 * proof — not an echo of the server's `balanced` flag. decimal.js only.
 */
export function sumDecimalStrings(values: string[]): string {
  let total = new Decimal(0);
  for (const value of values) {
    total = total.plus(new Decimal(value));
  }
  return total.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export interface BalanceEquation {
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
  balanced: boolean;
}

export function checkBalanceEquation(totalAssets: string, totalLiabilities: string, totalEquity: string): BalanceEquation {
  const assets = new Decimal(totalAssets);
  const right = new Decimal(totalLiabilities).plus(new Decimal(totalEquity));
  return {
    totalAssets: assets.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
    totalLiabilities: new Decimal(totalLiabilities).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
    totalEquity: new Decimal(totalEquity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
    balanced: assets.equals(right),
  };
}

/** Only OPEN periods may be closed (CLOSED/LOCKED reject loudly server-side). */
export function canClosePeriod(status: string): boolean {
  return status === 'OPEN';
}
