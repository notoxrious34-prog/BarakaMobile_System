import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { api } from '@/lib/api';

export type TrendDay = {
  /** Local calendar day key YYYY-MM-DD */
  key: string;
  /** Short Arabic weekday label, or 'اليوم' for today */
  weekday: string;
  /** Localized short date, e.g. day + month */
  fullDate: string;
  /** Daily total as Decimal 2dp string */
  total: string;
};

export type SalesTrend = {
  /** 7 buckets [D-6 .. Today], oldest first */
  days: TrendDay[];
  /** Current 7-day total, Decimal 2dp string */
  total: string;
  /** Previous 7-day total, Decimal 2dp string */
  prevTotal: string;
  /**
   * Percentage change vs previous 7 days, Decimal 1dp string (signed).
   * null only when the previous total is exactly 0 and current > 0
   * (division by zero — rendered as a "new" badge, never fabricated).
   */
  trendPct: string | null;
  /** true when trend is flat/up (>= 0%), false when negative */
  isUp: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const weekdayFmt = new Intl.DateTimeFormat('ar-DZ', { weekday: 'short' });
const fullFmt = new Intl.DateTimeFormat('ar-DZ', { day: 'numeric', month: 'short' });

type SaleTx = {
  id: string;
  amount: string;
  createdAt: string;
};

/**
 * Group a Decimal 2dp string with thousand separators (string-level only —
 * no floating-point arithmetic on money).
 */
export function formatGroupedMoney(v: string): string {
  const parts = v.split('.');
  const int = (parts[0] ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${int}.${parts[1] ?? '00'}`;
}

export function useSalesTrend() {
  const q = useQuery<SaleTx[]>({
    queryKey: ['transactions', 'sales-trend'],
    queryFn: () => api.get<SaleTx[]>('/transactions?type=SALE'),
    staleTime: 30_000,
  });

  const trend: SalesTrend | null = useMemo(() => {
    if (!q.data) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 14 daily buckets: [D-13 .. Today]; first 7 = baseline, last 7 = current.
    const buckets: Decimal[] = Array.from({ length: 14 }, () => new Decimal(0));
    const keys: string[] = [];
    for (let back = 13; back >= 0; back--) {
      keys.push(dayKey(new Date(today.getTime() - back * DAY_MS)));
    }
    const indexByKey = new Map(keys.map((k, i) => [k, i] as const));

    for (const tx of q.data) {
      const t = new Date(tx.createdAt);
      if (Number.isNaN(t.getTime())) continue;
      const idx = indexByKey.get(dayKey(t));
      if (idx === undefined) continue;
      try {
        buckets[idx] = buckets[idx].plus(new Decimal(tx.amount));
      } catch {
        // Skip malformed amounts — never break aggregation.
      }
    }

    const zero = new Decimal(0);
    const prev = buckets.slice(0, 7).reduce((acc, b) => acc.plus(b), new Decimal(0));
    const cur = buckets.slice(7).reduce((acc, b) => acc.plus(b), new Decimal(0));

    let trendPct: string | null = null;
    let isUp = true;
    if (!prev.equals(zero)) {
      const pct = cur.minus(prev).div(prev).mul(new Decimal(100));
      trendPct = pct.toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toFixed(1);
      isUp = pct.greaterThanOrEqualTo(zero);
    } else if (cur.equals(zero)) {
      trendPct = zero.toFixed(1);
      isUp = true;
    }
    // prev == 0 && cur > 0 → trendPct stays null ("new" badge).

    const days: TrendDay[] = keys.slice(7).map((k, i) => {
      const d = new Date(today.getTime() - (6 - i) * DAY_MS);
      return {
        key: k,
        weekday: i === 6 ? 'اليوم' : weekdayFmt.format(d),
        fullDate: fullFmt.format(d),
        total: buckets[7 + i].toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      };
    });

    return {
      days,
      total: cur.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      prevTotal: prev.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      trendPct,
      isUp,
    };
  }, [q.data]);

  return { ...q, trend };
}
