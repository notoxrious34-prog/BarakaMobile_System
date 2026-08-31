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
    <div className="space-y-6" dir="rtl">
      <h1 className="text-xl font-bold text-zinc-900">الخزينة</h1>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center">
        <p className="text-sm text-zinc-500">الرصيد الحالي في الصندوق</p>
        <p className="mt-2 text-3xl font-bold text-zinc-900">
          {balanceQ.data ? `${Number(balanceQ.data.currentBalance).toFixed(2)} ${currencySymbol}` : '—'}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" onClick={() => setDrawOpen(true)} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">سحب مالك</button>
          <button type="button" onClick={() => setDepositOpen(true)} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">إيداع مالك</button>
        </div>
        {apiError && <p className="mt-2 text-sm text-red-600">{apiError}</p>}
      </div>

      {drawOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawOpen(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-lg border bg-white p-6">
            <h3 className="mb-3 font-semibold">سحب مالك</h3>
            <input type="text" placeholder="المبلغ" value={drawAmount} onChange={(e) => setDrawAmount(e.target.value)} className="mb-2 w-full rounded-md border px-3 py-2 text-sm" dir="ltr" />
            <input type="text" placeholder="ملاحظة (اختياري)" value={drawNote} onChange={(e) => setDrawNote(e.target.value)} className="mb-3 w-full rounded-md border px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDrawOpen(false)} className="rounded-md border px-4 py-2 text-sm">إلغاء</button>
              <button type="button" onClick={() => drawMut.mutate({ amount: drawAmount, note: drawNote || undefined })} disabled={drawMut.isPending} className="rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50">{drawMut.isPending ? '...' : 'تأكيد'}</button>
            </div>
          </div>
        </div>
      )}
      {depositOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDepositOpen(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-lg border bg-white p-6">
            <h3 className="mb-3 font-semibold">إيداع مالك</h3>
            <input type="text" placeholder="المبلغ" value={depAmount} onChange={(e) => setDepAmount(e.target.value)} className="mb-2 w-full rounded-md border px-3 py-2 text-sm" dir="ltr" />
            <input type="text" placeholder="ملاحظة (اختياري)" value={depNote} onChange={(e) => setDepNote(e.target.value)} className="mb-3 w-full rounded-md border px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDepositOpen(false)} className="rounded-md border px-4 py-2 text-sm">إلغاء</button>
              <button type="button" onClick={() => depositMut.mutate({ amount: depAmount, note: depNote || undefined })} disabled={depositMut.isPending} className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-50">{depositMut.isPending ? '...' : 'تأكيد'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="mb-3 font-semibold">الإغلاق اليومي</h3>
        <div className="mb-3 flex items-center gap-2">
          <input type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} className="rounded-md border px-3 py-1.5 text-sm" />
          <button type="button" onClick={() => closingQ.refetch()} className="rounded-md border px-3 py-1.5 text-sm">تحديث</button>
        </div>
        {closingQ.data && (
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <div>الافتتاحي: <span className="font-semibold">{Number(closingQ.data.openingBalance).toFixed(2)} {currencySymbol}</span></div>
            <div>الإجمالي داخل: <span className="font-semibold text-emerald-600">{Number(closingQ.data.totalIn).toFixed(2)}</span></div>
            <div>الإجمالي خارج: <span className="font-semibold text-red-600">{Number(closingQ.data.totalOut).toFixed(2)}</span></div>
            <div>الإغلاق: <span className="font-bold">{Number(closingQ.data.closingBalance).toFixed(2)} {currencySymbol}</span></div>
          </div>
        )}
        {closingQ.data?.breakdown && closingQ.data.breakdown.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <thead><tr className="border-b text-zinc-500"><th className="py-1 text-right">الفئة</th><th className="py-1 text-left">المبلغ</th></tr></thead>
            <tbody>
              {closingQ.data.breakdown.map((b) => (
                <tr key={b.category} className="border-b"><td className="py-1">{CATEGORY_LABEL[b.category] ?? b.category}</td><td className="py-1 text-left" dir="ltr">{Number(b.amount).toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="mb-3 font-semibold">حركة الصندوق</h3>
        <div className="mb-3 flex flex-wrap gap-2">
          <input type="date" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} className="rounded-md border px-3 py-1.5 text-sm" />
          <input type="date" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} className="rounded-md border px-3 py-1.5 text-sm" />
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="rounded-md border px-3 py-1.5 text-sm">
            <option value="">كل الفئات</option>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-zinc-500"><th className="py-2 text-right">النوع</th><th className="text-right">الفئة</th><th className="text-left">المبلغ</th><th className="text-left">بعد</th><th className="text-right">التاريخ</th></tr></thead>
            <tbody>
              {movementsQ.data?.map((m) => (
                <tr key={m.id} className="border-b">
                  <td className="py-2"><span className={`rounded px-2 py-0.5 text-xs ${m.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{m.type}</span></td>
                  <td>{CATEGORY_LABEL[m.category] ?? m.category}</td>
                  <td dir="ltr" className="text-left">{Number(m.amount).toFixed(2)}</td>
                  <td dir="ltr" className="text-left">{Number(m.balanceAfter).toFixed(2)}</td>
                  <td className="text-xs text-zinc-500">{new Date(m.createdAt).toLocaleString('ar-DZ')}</td>
                </tr>
              ))}
              {(!movementsQ.data || movementsQ.data.length === 0) && <tr><td colSpan={5} className="py-4 text-center text-zinc-500">لا توجد حركات</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
