import { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { BrandMark } from '@/components/layout/BrandMark';
import { Search } from 'lucide-react';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';
import { CashMetricCards } from '@/features/cash/components/CashMetricCards';
import { OwnerMovementModal } from '@/features/cash/components/OwnerMovementModal';
import type { OwnerMovementMode } from '@/features/cash/types';
import {
  cashCategoryLabel,
  formatCashAmount,
  getCashMovementBadgeTone,
  parseCashAmount,
} from '@/features/cash/utils/cashLabels';
import {
  fetchCashBalance,
  fetchCashMovements,
  fetchDailyClosing,
  postOwnerDeposit,
  postOwnerDraw,
} from '@/features/cash/api/cashApi';

const MOVEMENT_CATEGORIES = [
  'SALE_PAYMENT',
  'PURCHASE_PAYMENT',
  'PAYMENT_IN',
  'PAYMENT_OUT',
  'EXPENSE',
  'OWNER_DRAW',
  'OWNER_DEPOSIT',
  'ADJUSTMENT',
];

type ClosingBreakdownRow = {
  category: string;
  amount?: string;
  inAmount?: string;
  outAmount?: string;
};

function breakdownDisplayAmount(b: ClosingBreakdownRow): string {
  const raw = b.inAmount ?? b.outAmount ?? b.amount ?? '0';
  try {
    return new Decimal(raw).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return '0.00';
  }
}

function formatArabicDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ar-DZ', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * TB-080 Treasury cockpit — Golden Standard shell: BrandMark header,
 * CashMetricCards strip, OwnerMovementModal wiring, Decimal daily closing
 * + movements ledger. Backend untouched (AD-58).
 */
export function TreasuryPage() {
  const queryClient = useQueryClient();
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';

  const [movementMode, setMovementMode] = useState<OwnerMovementMode | null>(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [search, setSearch] = useState('');
  const [closingDate, setClosingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [apiError, setApiError] = useState<string | null>(null);

  const balanceQ = useQuery({
    queryKey: ['cash', 'balance'],
    queryFn: fetchCashBalance,
  });
  const allMovementsQ = useQuery({
    queryKey: ['cash', 'movements', 'all'],
    queryFn: () => fetchCashMovements(),
  });
  const movementsQ = useQuery({
    queryKey: ['cash', 'movements', filterCategory, filterStart, filterEnd],
    queryFn: () =>
      fetchCashMovements({
        startDate: filterStart || undefined,
        endDate: filterEnd || undefined,
        category: filterCategory || undefined,
      }),
  });
  const closingQ = useQuery({
    queryKey: ['cash', 'daily-closing', closingDate],
    queryFn: () => fetchDailyClosing(closingDate),
  });

  function invalidateCash() {
    for (const key of [
      ['cash', 'balance'],
      ['cash', 'movements'],
      ['cash', 'daily-closing'],
      ['cash-balance'],
      ['cash-movements'],
      ['daily-closing'],
      ['capital'],
    ]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  }

  const depositMut = useMutation({
    mutationFn: (body: { amount: string; note?: string }) => postOwnerDeposit(body),
    onSuccess: () => {
      invalidateCash();
      setMovementMode(null);
    },
    onError: (e: unknown) => setApiError(e instanceof ApiError ? e.message : 'خطأ في الإيداع'),
  });
  const drawMut = useMutation({
    mutationFn: (body: { amount: string; note?: string }) => postOwnerDraw(body),
    onSuccess: () => {
      invalidateCash();
      setMovementMode(null);
    },
    onError: (e: unknown) => setApiError(e instanceof ApiError ? e.message : 'خطأ في السحب'),
  });

  const filteredMovements = useMemo(() => {
    const list = movementsQ.data ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter((m) =>
      [m.note ?? '', cashCategoryLabel(m.category), m.category, m.amount]
        .join(' ')
        .toLowerCase()
        .includes(s),
    );
  }, [movementsQ.data, search]);

  const closingNet = useMemo(() => {
    const c = closingQ.data;
    if (!c) return null;
    try {
      const net = parseCashAmount(c.totalIn).minus(parseCashAmount(c.totalOut));
      const isZero = net.abs().lessThan(new Decimal(0.005));
      return {
        value: net.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
        tone: isZero
          ? 'text-cyan-300'
          : net.greaterThan(new Decimal(0))
            ? 'text-emerald-400'
            : 'text-rose-400',
      };
    } catch {
      return null;
    }
  }, [closingQ.data]);

  const breakdown = (closingQ.data?.breakdown ?? []) as unknown as ClosingBreakdownRow[];

  const inputCls =
    'rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-amber-500/50';

  return (
    <div dir="rtl" className="flex min-h-[calc(100vh-4.5rem)] flex-col gap-3 font-sans">
      {/* Cockpit header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 py-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark className="h-9 w-9" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-tight text-slate-100">الخزينة</h1>
            <p className="hidden text-[11px] text-slate-500 sm:block">
              الصندوق النقدي والحركات والإغلاق اليومي
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setApiError(null);
              setMovementMode('deposit');
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-500"
          >
            إيداع نقدي
          </button>
          <button
            type="button"
            onClick={() => {
              setApiError(null);
              setMovementMode('draw');
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-rose-500"
          >
            سحب نقدي
          </button>
        </div>
      </div>

      {apiError && (
        <p className="shrink-0 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400" role="alert">
          {apiError}
        </p>
      )}

      {/* Metric strip */}
      {balanceQ.isLoading || allMovementsQ.isLoading ? (
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-xl border border-navy-border/30 bg-navy-800/40" />
          ))}
        </div>
      ) : balanceQ.isError || allMovementsQ.isError ? (
        <div className="shrink-0 rounded-2xl border border-rose-500/20 bg-navy-900 p-6 text-center">
          <p className="text-sm text-rose-300">تعذر تحميل بيانات الصندوق</p>
          <button
            type="button"
            onClick={() => {
              balanceQ.refetch();
              allMovementsQ.refetch();
            }}
            className="mt-2 rounded-xl bg-rose-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-rose-500"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <CashMetricCards
          balance={balanceQ.data?.currentBalance ?? '0'}
          movements={allMovementsQ.data ?? []}
          currencySymbol={currencySymbol}
        />
      )}

      {/* Daily closing panel */}
      <div className="shrink-0 rounded-2xl border border-navy-700/50 bg-navy-900/60 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-100">الإغلاق اليومي</h3>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={closingDate}
              onChange={(e) => setClosingDate(e.target.value)}
              aria-label="تاريخ الإغلاق"
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => closingQ.refetch()}
              className="rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-1.5 text-sm font-bold text-slate-300 hover:bg-white/[0.06]"
            >
              تحديث
            </button>
          </div>
        </div>
        {closingQ.isLoading ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl border border-navy-border/30 bg-navy-800/40" />
            ))}
          </div>
        ) : closingQ.data ? (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <div className="rounded-xl border border-navy-border/30 bg-navy-950/40 p-3">
                <p className="text-[11px] text-slate-500">الافتتاحي</p>
                <p className="mt-1 font-mono text-sm font-bold text-slate-100" dir="ltr">
                  {formatCashAmount(closingQ.data.openingBalance, currencySymbol)}
                </p>
              </div>
              <div className="rounded-xl border border-navy-border/30 bg-navy-950/40 p-3">
                <p className="text-[11px] text-slate-500">الإجمالي داخل</p>
                <p className="mt-1 font-mono text-sm font-bold text-emerald-400" dir="ltr">
                  {formatCashAmount(closingQ.data.totalIn, currencySymbol)}
                </p>
              </div>
              <div className="rounded-xl border border-navy-border/30 bg-navy-950/40 p-3">
                <p className="text-[11px] text-slate-500">الإجمالي خارج</p>
                <p className="mt-1 font-mono text-sm font-bold text-rose-400" dir="ltr">
                  {formatCashAmount(closingQ.data.totalOut, currencySymbol)}
                </p>
              </div>
              <div className="rounded-xl border border-navy-border/30 bg-navy-950/40 p-3">
                <p className="text-[11px] text-slate-500">الإغلاق</p>
                <p className="mt-1 font-mono text-sm font-bold text-slate-100" dir="ltr">
                  {formatCashAmount(closingQ.data.closingBalance, currencySymbol)}
                </p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3">
                <p className="text-[11px] text-slate-500">الصافي (داخل − خارج)</p>
                <p className={`mt-1 font-mono text-sm font-bold ${closingNet?.tone ?? 'text-slate-100'}`} dir="ltr">
                  {closingNet ? `${closingNet.value} ${currencySymbol}` : '—'}
                </p>
              </div>
            </div>
            {breakdown.length > 0 && (
              <div className="scrollbar-premium mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-navy-border/30 text-xs text-slate-500">
                      <th className="px-3 py-2 text-right font-bold">الفئة</th>
                      <th className="px-3 py-2 text-left font-bold">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.map((b) => (
                      <tr key={b.category} className="border-b border-navy-border/20 last:border-0">
                        <td className="py-2 text-slate-300">{cashCategoryLabel(b.category)}</td>
                        <td className="px-3 py-2 text-left font-mono text-slate-100" dir="ltr">
                          {breakdownDisplayAmount(b)} {currencySymbol}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <p className="py-4 text-center text-sm text-slate-500">لا توجد بيانات إغلاق لهذا التاريخ</p>
        )}
      </div>

      {/* Movements ledger */}
      <div className="flex min-h-[200px] flex-1 flex-col rounded-2xl border border-navy-700/50 bg-navy-900/60 p-4">
        <h3 className="mb-3 shrink-0 text-sm font-bold text-slate-100">حركة الصندوق</h3>
        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
          <input
            type="date"
            value={filterStart}
            onChange={(e) => setFilterStart(e.target.value)}
            aria-label="من تاريخ"
            className={inputCls}
          />
          <input
            type="date"
            value={filterEnd}
            onChange={(e) => setFilterEnd(e.target.value)}
            aria-label="إلى تاريخ"
            className={inputCls}
          />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            aria-label="فئة الحركة"
            className={inputCls}
          >
            <option value="">كل الفئات</option>
            {MOVEMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {cashCategoryLabel(c)}
              </option>
            ))}
          </select>
          <div className="relative min-w-44 flex-1">
            <Search
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث: ملاحظة أو فئة أو مبلغ…"
              aria-label="بحث في الحركات"
              className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 py-1.5 pe-3 ps-9 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-amber-500/50"
            />
          </div>
        </div>
        {movementsQ.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl border border-navy-border/30 bg-navy-800/40" />
            ))}
          </div>
        ) : filteredMovements.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-navy-border/40 py-12 text-center">
            <p className="text-sm text-slate-400">لا توجد حركات مطابقة</p>
            <p className="text-[11px] text-slate-600">جرّب توسيع الفترة أو مسح البحث</p>
          </div>
        ) : (
          <div className="scrollbar-premium -mx-1 min-h-0 flex-1 overflow-x-auto px-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-border/30 text-xs text-slate-500">
                  <th className="px-3 py-2 text-right font-bold">النوع</th>
                  <th className="px-3 py-2 text-right font-bold">الفئة</th>
                  <th className="px-3 py-2 text-left font-bold">المبلغ</th>
                  <th className="px-3 py-2 text-left font-bold">بعد</th>
                  <th className="px-3 py-2 text-right font-bold">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.map((m) => (
                  <tr key={m.id} className="border-b border-navy-border/20 last:border-0 hover:bg-white/[0.02]">
                    <td className="py-2">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${getCashMovementBadgeTone(m.type, m.category)}`}
                      >
                        {m.type === 'IN' ? 'وارد' : 'منصرف'}
                      </span>
                    </td>
                    <td className="py-2 text-slate-300">{cashCategoryLabel(m.category)}</td>
                    <td dir="ltr" className="px-3 py-2 text-left font-mono font-bold text-slate-100">
                      {formatCashAmount(m.amount, currencySymbol)}
                    </td>
                    <td dir="ltr" className="px-3 py-2 text-left font-mono text-slate-400">
                      {formatCashAmount(m.balanceAfter, currencySymbol)}
                    </td>
                    <td className="py-2 text-xs text-slate-500">{formatArabicDateTime(m.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {movementMode && (
        <OwnerMovementModal
          mode={movementMode}
          open={true}
          onClose={() => setMovementMode(null)}
          currentBalance={balanceQ.data?.currentBalance ?? '0'}
          currencySymbol={currencySymbol}
          isSubmitting={depositMut.isPending || drawMut.isPending}
          onSubmit={async (data) => {
            if (movementMode === 'deposit') await depositMut.mutateAsync(data);
            else await drawMut.mutateAsync(data);
          }}
        />
      )}
    </div>
  );
}
