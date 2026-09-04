import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { api } from '@/lib/api';

export type DailyClosing = {
  date: string;
  openingBalance: string;
  totalIn: string;
  totalOut: string;
  closingBalance: string;
  breakdown: Array<{ category: string; amount: string }>;
};

export type CashMovement = {
  id: string;
  type: 'IN' | 'OUT';
  category: string;
  amount: string;
  relatedTransactionId?: string | null;
  createdAt: string;
};

export type ShiftTransaction = {
  id: string;
  type: string;
  amount: string;
  createdAt: string;
};

export type VarianceTone = 'match' | 'surplus' | 'deficit' | 'none';

const D2 = (d: Decimal): string =>
  d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

function safeDec(v: string | number | null | undefined): Decimal {
  try {
    return new Decimal(v ?? '0');
  } catch {
    return new Decimal(0);
  }
}

/** Local calendar day as YYYY-MM-DD */
export function todayYMD(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Created-at instant → Algeria (UTC+1) calendar day */
function algeriaYMD(iso: string): string {
  try {
    const d = new Date(new Date(iso).getTime() + 60 * 60 * 1000);
    const m = `${d.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${d.getUTCDate()}`.padStart(2, '0');
    return `${d.getUTCFullYear()}-${m}-${day}`;
  } catch {
    return '';
  }
}

export const CATEGORY_LABEL: Record<string, string> = {
  SALE_PAYMENT: 'تحصيل مبيعات',
  PAYMENT_IN: 'تحصيل ديون / إيداعات',
  OWNER_DEPOSIT: 'إيداع المالك',
  PURCHASE_PAYMENT: 'مدفوعات مشتريات',
  PAYMENT_OUT: 'مدفوعات صادرة',
  EXPENSE: 'مصاريف',
  OWNER_DRAW: 'مسحوبات المالك',
  ADJUSTMENT: 'تسويات',
};

/**
 * TB-068 shift / Z-report aggregation.
 * Reads existing endpoints only (backend frozen): daily-closing, cash/balance,
 * transactions, cash/movements. Every monetary derivation is decimal.js.
 */
export function useShiftReport(initialDate?: string) {
  const [date, setDate] = useState(initialDate ?? todayYMD());

  const closingQ = useQuery<DailyClosing>({
    queryKey: ['cash', 'daily-closing', date],
    queryFn: () => api.get<DailyClosing>(`/cash/daily-closing?date=${date}`),
  });
  const balanceQ = useQuery<{ currentBalance: string }>({
    queryKey: ['cash-balance'],
    queryFn: () => api.get<{ currentBalance: string }>('/cash/balance'),
    staleTime: 30_000,
  });
  const txQ = useQuery<ShiftTransaction[]>({
    queryKey: ['transactions'],
    queryFn: () => api.get<ShiftTransaction[]>('/transactions'),
  });
  const movesQ = useQuery<CashMovement[]>({
    queryKey: ['cash', 'movements', date],
    queryFn: () =>
      api.get<CashMovement[]>(`/cash/movements?startDate=${date}&endDate=${date}`),
  });

  const metrics = useMemo(() => {
    const c = closingQ.data;
    const opening = c ? D2(safeDec(c.openingBalance)) : '0.00';
    const expected = c ? D2(safeDec(c.closingBalance)) : '0.00';
    const totalIn = c ? D2(safeDec(c.totalIn)) : '0.00';
    const totalOut = c ? D2(safeDec(c.totalOut)) : '0.00';
    const breakdown = (c?.breakdown ?? []).map((b) => ({
      category: b.category,
      label: CATEGORY_LABEL[b.category] ?? b.category,
      amount: D2(safeDec(b.amount)),
    }));

    const daySales = (txQ.data ?? []).filter(
      (t) => t.type === 'SALE' && algeriaYMD(t.createdAt) === date,
    );
    let volume = new Decimal(0);
    for (const s of daySales) volume = volume.plus(safeDec(s.amount));
    const salesVolume = D2(volume);

    // Cash portion = sales linked to a SALE_PAYMENT cash movement; rest = credit.
    const saleIds = new Set(daySales.map((s) => s.id));
    const cashSaleIds = new Set<string>();
    for (const m of movesQ.data ?? []) {
      if (
        m.category === 'SALE_PAYMENT' &&
        m.relatedTransactionId &&
        saleIds.has(m.relatedTransactionId)
      ) {
        cashSaleIds.add(m.relatedTransactionId);
      }
    }
    let cash = new Decimal(0);
    for (const s of daySales) {
      if (cashSaleIds.has(s.id)) cash = cash.plus(safeDec(s.amount));
    }
    const salesCash = D2(cash);
    const salesCredit = D2(volume.minus(cash));

    return {
      opening,
      expected,
      totalIn,
      totalOut,
      breakdown,
      salesCount: daySales.length,
      salesVolume,
      salesCash,
      salesCredit,
    };
  }, [closingQ.data, txQ.data, movesQ.data, date]);

  /** counted − expected, strictly in Decimal */
  function varianceOf(counted: string): { raw: string | null; tone: VarianceTone } {
    const t = counted.trim();
    if (t === '') return { raw: null, tone: 'none' };
    try {
      const v = safeDec(t).minus(safeDec(metrics.expected));
      const cmp = v.comparedTo(new Decimal(0));
      return {
        raw: D2(v.abs()),
        tone: cmp === 0 ? 'match' : cmp > 0 ? 'surplus' : 'deficit',
      };
    } catch {
      return { raw: null, tone: 'none' };
    }
  }

  return {
    date,
    setDate,
    closingQ,
    liveBalance: balanceQ.data
      ? D2(safeDec(balanceQ.data.currentBalance))
      : null,
    isLoading:
      closingQ.isLoading || txQ.isLoading || movesQ.isLoading || balanceQ.isLoading,
    isError:
      closingQ.isError || txQ.isError || movesQ.isError || balanceQ.isError,
    refetch: () => {
      void closingQ.refetch();
      void balanceQ.refetch();
      void txQ.refetch();
      void movesQ.refetch();
    },
    ...metrics,
    varianceOf,
  };
}

export type ShiftReport = ReturnType<typeof useShiftReport>;
