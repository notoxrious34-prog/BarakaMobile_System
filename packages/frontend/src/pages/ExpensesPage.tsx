import { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { BrandMark } from '@/components/layout/BrandMark';
import { Plus, Receipt } from 'lucide-react';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';
import { formatCashAmount, parseCashAmount, validateCashInput } from '@/features/cash/utils/cashLabels';
import {
  fetchExpenseBreakdown,
  fetchExpenseCategories,
  fetchExpenses,
  postExpense,
  postExpenseCategory,
} from '@/features/cash/api/cashApi';

const EPS = new Decimal(0.005);

function expenseDisplayDate(e: { date: string; expenseDate?: string }): string {
  return e.expenseDate ?? e.date;
}

/**
 * TB-080 Expenses cockpit — Golden Standard shell: BrandMark header, Decimal
 * form validation + breakdown percentages, navy history table. Backend
 * untouched (AD-58).
 */
export function ExpensesPage() {
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';
  const queryClient = useQueryClient();

  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);

  const categoriesQ = useQuery({
    queryKey: ['cash', 'expense-categories'],
    queryFn: fetchExpenseCategories,
  });
  const expensesQ = useQuery({
    queryKey: ['cash', 'expenses', filterCategory, filterStart, filterEnd],
    queryFn: () =>
      fetchExpenses({
        categoryId: filterCategory || undefined,
        startDate: filterStart || undefined,
        endDate: filterEnd || undefined,
      }),
  });
  const breakdownQ = useQuery({
    queryKey: ['cash', 'expense-breakdown', filterStart, filterEnd],
    queryFn: () =>
      fetchExpenseBreakdown({
        startDate: filterStart || undefined,
        endDate: filterEnd || undefined,
      }),
  });

  function invalidateExpenses() {
    for (const key of [
      ['cash', 'expenses'],
      ['cash', 'expense-breakdown'],
      ['cash', 'expense-categories'],
      ['expense-categories'],
      ['expenses'],
      ['expense-breakdown'],
      ['cash-balance'],
      ['cash-movements'],
      ['cash', 'balance'],
      ['cash', 'movements'],
    ]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  }

  const createMut = useMutation({
    mutationFn: (body: { categoryId: string; amount: string; expenseDate: string; description?: string }) =>
      postExpense(body),
    onSuccess: () => {
      invalidateExpenses();
      setAmount('');
      setDescription('');
      setApiError(null);
    },
    onError: (e: unknown) => setApiError(e instanceof ApiError ? e.message : 'خطأ في إنشاء المصروف'),
  });
  const createCatMut = useMutation({
    mutationFn: (body: { name: string }) => postExpenseCategory(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash', 'expense-categories'] });
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      setNewCatName('');
    },
    onError: (e: unknown) => setApiError(e instanceof ApiError ? e.message : 'خطأ في إنشاء الفئة'),
  });

  const amountValidation = validateCashInput(amount);

  const breakdownStats = useMemo(() => {
    const rows = breakdownQ.data ?? [];
    let total = new Decimal(0);
    for (const r of rows) total = total.plus(parseCashAmount(r.totalAmount));
    const total2dp = total.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return {
      total: total2dp.toFixed(2),
      rows: rows.map((r) => {
        let pct = '0.0';
        let width = 0;
        try {
          if (!total2dp.abs().lessThan(EPS)) {
            const share = parseCashAmount(r.totalAmount)
              .dividedBy(total2dp)
              .times(100)
              .toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
            pct = share.toFixed(1);
            width = Math.min(100, Math.max(0, share.toNumber()));
          }
        } catch {
          pct = '0.0';
          width = 0;
        }
        return { ...r, pct, width };
      }),
    };
  }, [breakdownQ.data]);

  function submitExpense() {
    setApiError(null);
    if (!categoryId) {
      setApiError('اختر فئة المصروف');
      return;
    }
    if (!amountValidation.isValid || !amountValidation.decimalValue) {
      setApiError(amountValidation.error ?? 'المبلغ غير صالح');
      return;
    }
    createMut.mutate({
      categoryId,
      amount: amountValidation.decimalValue.toFixed(2),
      expenseDate: expenseDate || new Date().toISOString().split('T')[0],
      description: description.trim() || undefined,
    });
  }

  const inputCls =
    'rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-rose-500/50';

  return (
    <div dir="rtl" className="flex min-h-[calc(100vh-4.5rem)] flex-col gap-3 font-sans">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 py-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark className="h-9 w-9" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-tight text-slate-100">المصاريف</h1>
            <p className="hidden text-[11px] text-slate-500 sm:block">
              تسجيل المصاريف وتوزيعها على الفئات
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 font-mono text-xs font-bold text-rose-400" dir="ltr">
          {formatCashAmount(breakdownStats.total, currencySymbol)}
        </span>
      </div>

      {apiError && (
        <p className="shrink-0 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400" role="alert">
          {apiError}
        </p>
      )}

      {/* Registration panel */}
      <div className="shrink-0 rounded-2xl border border-navy-700/50 bg-navy-900/60 p-4">
        <h3 className="mb-3 text-sm font-bold text-slate-100">تسجيل مصروف</h3>
        <div className="grid gap-2 md:grid-cols-4">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label="فئة المصروف"
            disabled={createMut.isPending}
            className={inputCls}
          >
            <option value="">اختر الفئة</option>
            {categoriesQ.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            inputMode="decimal"
            placeholder="المبلغ"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={createMut.isPending}
            aria-label="مبلغ المصروف"
            className={`${inputCls} font-mono`}
            dir="ltr"
          />
          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            disabled={createMut.isPending}
            aria-label="تاريخ المصروف"
            className={inputCls}
          />
          <input
            type="text"
            placeholder="الوصف (اختياري)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={createMut.isPending}
            aria-label="وصف المصروف"
            className={inputCls}
          />
        </div>
        {!amountValidation.isValid && amount.trim() !== '' && (
          <p className="mt-2 text-xs font-bold text-rose-400" role="alert">
            {amountValidation.error}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={submitExpense}
            disabled={createMut.isPending || !categoryId || !amountValidation.isValid}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-rose-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {createMut.isPending ? 'جاري التسجيل…' : 'تسجيل المصروف'}
          </button>
          <div className="flex min-w-52 flex-1 items-center gap-2">
            <input
              type="text"
              placeholder="فئة جديدة…"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              disabled={createCatMut.isPending}
              aria-label="اسم الفئة الجديدة"
              className={`${inputCls} flex-1`}
            />
            <button
              type="button"
              onClick={() => {
                if (newCatName.trim().length >= 2) createCatMut.mutate({ name: newCatName.trim() });
                else setApiError('اسم الفئة قصير جداً');
              }}
              disabled={createCatMut.isPending || newCatName.trim().length < 2}
              className="shrink-0 rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/[0.06] disabled:opacity-50"
            >
              إضافة تصنيف
            </button>
          </div>
        </div>
      </div>

      {/* Breakdown panel */}
      <div className="shrink-0 rounded-2xl border border-navy-700/50 bg-navy-900/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-100">
            <Receipt className="h-4 w-4 text-amber-400" aria-hidden="true" />
            توزيع المصاريف
          </h3>
          <span className="font-mono text-sm font-bold text-amber-400" dir="ltr">
            {formatCashAmount(breakdownStats.total, currencySymbol)}
          </span>
        </div>
        {breakdownQ.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl border border-navy-border/30 bg-navy-800/40" />
            ))}
          </div>
        ) : breakdownStats.rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">لا توجد مصاريف في الفترة المحددة</p>
        ) : (
          <div className="space-y-2">
            {breakdownStats.rows.map((r) => (
              <div key={r.categoryId}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300">{r.categoryName}</span>
                  <span className="font-mono text-slate-400" dir="ltr">
                    {formatCashAmount(r.totalAmount, currencySymbol)} · {r.pct}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-navy-950/80">
                  <div
                    className="h-full rounded-full bg-gradient-to-l from-rose-500 to-amber-500"
                    style={{ width: `${r.width}%` }}
                    role="progressbar"
                    aria-valuenow={r.width}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={r.categoryName}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History table */}
      <div className="flex min-h-[200px] flex-1 flex-col rounded-2xl border border-navy-700/50 bg-navy-900/60 p-4">
        <h3 className="mb-3 shrink-0 text-sm font-bold text-slate-100">سجل المصاريف</h3>
        <div className="mb-3 flex shrink-0 flex-wrap gap-2">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            aria-label="تصفية بالفئة"
            className={inputCls}
          >
            <option value="">كل الفئات</option>
            {categoriesQ.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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
        </div>
        {expensesQ.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl border border-navy-border/30 bg-navy-800/40" />
            ))}
          </div>
        ) : !expensesQ.data || expensesQ.data.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-navy-border/40 py-12 text-center">
            <p className="text-sm text-slate-400">لا توجد مصاريف مطابقة</p>
          </div>
        ) : (
          <div className="scrollbar-premium -mx-1 min-h-0 flex-1 overflow-x-auto px-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-border/30 text-xs text-slate-500">
                  <th className="px-3 py-2 text-right font-bold">التاريخ</th>
                  <th className="px-3 py-2 text-right font-bold">الفئة</th>
                  <th className="px-3 py-2 text-right font-bold">الوصف</th>
                  <th className="px-3 py-2 text-left font-bold">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {expensesQ.data.map((e) => (
                  <tr key={e.id} className="border-b border-navy-border/20 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-3 py-2 text-slate-300" dir="ltr">
                      {expenseDisplayDate(e)}
                    </td>
                    <td className="px-3 py-2 text-slate-100">{e.category?.name ?? '—'}</td>
                    <td className="max-w-[14rem] truncate px-3 py-2 text-slate-400">
                      {e.description ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-left font-mono font-bold text-rose-400" dir="ltr">
                      {formatCashAmount(e.amount, currencySymbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
