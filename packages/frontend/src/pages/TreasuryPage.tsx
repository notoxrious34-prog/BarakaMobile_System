import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';

type CashBalance = { currentBalance: string };
type CashMovement = {
  id: string;
  type: string;
  category: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  note?: string;
  createdAt: string;
};
type DailyClosing = {
  date: string;
  openingBalance: string;
  totalIn: string;
  totalOut: string;
  closingBalance: string;
  breakdown: { category: string; amount: string }[];
};

const CATEGORY_LABEL: Record<string, string> = {
  SALE_PAYMENT: 'دفع بيع',
  PURCHASE_PAYMENT: 'دفع شراء',
  PAYMENT_IN: 'تحصيل',
  PAYMENT_OUT: 'دفع',
  EXPENSE: 'مصروف',
  OWNER_DRAW: 'سحب مالك',
  OWNER_DEPOSIT: 'إيداع مالك',
  ADJUSTMENT: 'تسوية',
};

export function TreasuryPage() {
  const queryClient = useQueryClient();
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';
  const [drawOpen, setDrawOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [drawAmount, setDrawAmount] = useState('');
  const [drawNote, setDrawNote] = useState('');
  const [depAmount, setDepAmount] = useState('');
  const [depNote, setDepNote] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [closingDate, setClosingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [apiError, setApiError] = useState<string | null>(null);

  const balanceQ = useQuery<CashBalance>({ queryKey: ['cash-balance'], queryFn: () => api.get('/cash/balance') });
  const movementsQ = useQuery<CashMovement[]>({
    queryKey: ['cash-movements', filterCategory, filterStart, filterEnd],
    queryFn: () => {
      const p = new URLSearchParams();
      if (filterStart) p.set('startDate', filterStart);
      if (filterEnd) p.set('endDate', filterEnd);
      if (filterCategory) p.set('category', filterCategory);
      const qs = p.toString();
      return api.get<CashMovement[]>(`/cash/movements${qs ? `?${qs}` : ''}`);
    },
  });
  const closingQ = useQuery<DailyClosing>({
    queryKey: ['daily-closing', closingDate],
    queryFn: () => api.get<DailyClosing>(`/cash/daily-closing?date=${closingDate}`),
  });

  const drawMut = useMutation({
    mutationFn: (body: { amount: string; note?: string }) => api.post('/cash/owner-draw', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-balance'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      queryClient.invalidateQueries({ queryKey: ['daily-closing'] });
      queryClient.invalidateQueries({ queryKey: ['capital'] });
      setDrawOpen(false);
      setDrawAmount('');
      setDrawNote('');
    },
    onError: (e: unknown) => setApiError(e instanceof ApiError ? e.message : 'خطأ في السحب'),
  });
  const depositMut = useMutation({
    mutationFn: (body: { amount: string; note?: string }) => api.post('/cash/owner-deposit', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-balance'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      queryClient.invalidateQueries({ queryKey: ['daily-closing'] });
      queryClient.invalidateQueries({ queryKey: ['capital'] });
      setDepositOpen(false);
      setDepAmount('');
      setDepNote('');
    },
    onError: (e: unknown) => setApiError(e instanceof ApiError ? e.message : 'خطأ في الإيداع'),
  });

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 p-4 font-sans space-y-6 text-slate-100">
      <div>
        <h1 className="text-xl font-bold text-slate-100">الخزينة</h1>
        <p className="mt-1 text-sm text-slate-400">الصندوق النقدي والإغلاق اليومي</p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <p className="text-sm text-slate-400">رصيد الصندوق</p>
        <p className="mt-2 font-mono text-3xl font-bold text-emerald-400 sm:text-3xl">
          {balanceQ.isLoading ? (
            <span className="inline-block animate-pulse text-slate-500">—</span>
          ) : balanceQ.data ? (
            `${Number(balanceQ.data.currentBalance).toFixed(2)} ${currencySymbol}`
          ) : (
            '—'
          )}
        </p>
        {balanceQ.isError && (
          <p className="mt-2 text-sm text-rose-400">تعذر تحميل الرصيد</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setApiError(null);
              setDrawOpen(true);
            }}
            className="rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-400 hover:bg-rose-500/20"
          >
            سحب مالك
          </button>
          <button
            type="button"
            onClick={() => {
              setApiError(null);
              setDepositOpen(true);
            }}
            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20"
          >
            إيداع مالك
          </button>
        </div>
        {apiError && <p className="mt-3 text-sm text-rose-400">{apiError}</p>}
      </div>

      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-cyan-400">أرصدة الشرائح / فليكسي</h3>
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-400">قريباً</span>
        </div>
        <p className="mt-2 text-sm text-slate-400">قريباً — تتبع أرصدة العمليات الرقمية وفليكسي</p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-100">الإغلاق اليومي</h3>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={closingDate}
            onChange={(e) => setClosingDate(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-slate-600"
          />
          <button
            type="button"
            onClick={() => closingQ.refetch()}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
          >
            تحديث
          </button>
        </div>
        {closingQ.data && (
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">الافتتاحي</p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-100" dir="ltr">
                {Number(closingQ.data.openingBalance).toFixed(2)} {currencySymbol}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">الإجمالي داخل</p>
              <p className="mt-1 font-mono text-sm font-semibold text-emerald-400" dir="ltr">
                {Number(closingQ.data.totalIn).toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">الإجمالي خارج</p>
              <p className="mt-1 font-mono text-sm font-semibold text-rose-400" dir="ltr">
                {Number(closingQ.data.totalOut).toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">الإغلاق</p>
              <p className="mt-1 font-mono text-sm font-bold text-slate-100" dir="ltr">
                {Number(closingQ.data.closingBalance).toFixed(2)} {currencySymbol}
              </p>
            </div>
          </div>
        )}
        {closingQ.data?.breakdown && closingQ.data.breakdown.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 text-right font-medium">الفئة</th>
                  <th className="py-2 text-left font-medium">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {closingQ.data.breakdown.map((b) => (
                  <tr key={b.category} className="border-b border-slate-800/80">
                    <td className="py-2 text-slate-300">{CATEGORY_LABEL[b.category] ?? b.category}</td>
                    <td className="py-2 text-left font-mono text-slate-100" dir="ltr">
                      {Number(b.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-100">حركة الصندوق</h3>
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            type="date"
            value={filterStart}
            onChange={(e) => setFilterStart(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-slate-600"
          />
          <input
            type="date"
            value={filterEnd}
            onChange={(e) => setFilterEnd(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-slate-600"
          />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-slate-600"
          >
            <option value="">كل الفئات</option>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 text-right font-medium">النوع</th>
                <th className="py-2 text-right font-medium">الفئة</th>
                <th className="py-2 text-left font-medium">المبلغ</th>
                <th className="py-2 text-left font-medium">بعد</th>
                <th className="py-2 text-right font-medium">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {movementsQ.data?.map((m) => (
                <tr key={m.id} className="border-b border-slate-800/80">
                  <td className="py-2">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        m.type === 'IN'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                      }`}
                    >
                      {m.type}
                    </span>
                  </td>
                  <td className="py-2 text-slate-300">{CATEGORY_LABEL[m.category] ?? m.category}</td>
                  <td dir="ltr" className="py-2 text-left font-mono text-slate-100">
                    {Number(m.amount).toFixed(2)}
                  </td>
                  <td dir="ltr" className="py-2 text-left font-mono text-slate-300">
                    {Number(m.balanceAfter).toFixed(2)}
                  </td>
                  <td className="py-2 text-xs text-slate-500">{new Date(m.createdAt).toLocaleString('ar-DZ')}</td>
                </tr>
              ))}
              {(!movementsQ.data || movementsQ.data.length === 0) && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    لا توجد حركات
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drawOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawOpen(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-xl">
            <h3 className="mb-3 text-base font-semibold text-slate-100">سحب مالك</h3>
            <input
              type="text"
              placeholder="المبلغ"
              value={drawAmount}
              onChange={(e) => setDrawAmount(e.target.value)}
              className="mb-2 w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600"
              dir="ltr"
            />
            <input
              type="text"
              placeholder="ملاحظة (اختياري)"
              value={drawNote}
              onChange={(e) => setDrawNote(e.target.value)}
              className="mb-3 w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDrawOpen(false)}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => drawMut.mutate({ amount: drawAmount, note: drawNote || undefined })}
                disabled={drawMut.isPending}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {drawMut.isPending ? '...' : 'تأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}
      {depositOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDepositOpen(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-xl">
            <h3 className="mb-3 text-base font-semibold text-slate-100">إيداع مالك</h3>
            <input
              type="text"
              placeholder="المبلغ"
              value={depAmount}
              onChange={(e) => setDepAmount(e.target.value)}
              className="mb-2 w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600"
              dir="ltr"
            />
            <input
              type="text"
              placeholder="ملاحظة (اختياري)"
              value={depNote}
              onChange={(e) => setDepNote(e.target.value)}
              className="mb-3 w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDepositOpen(false)}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => depositMut.mutate({ amount: depAmount, note: depNote || undefined })}
                disabled={depositMut.isPending}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {depositMut.isPending ? '...' : 'تأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
