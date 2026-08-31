import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';

type Category = { id: string; name: string; isActive: boolean };
type Expense = { id: string; categoryId: string; amount: string; description?: string; expenseDate: string; category?: Category };
type Breakdown = { categoryId: string; categoryName: string; totalAmount: string; percentage: string };

export function ExpensesPage() {
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);

  const categoriesQ = useQuery<Category[]>({ queryKey: ['expense-categories'], queryFn: () => api.get('/expenses/categories') });
  const expensesQ = useQuery<Expense[]>({
    queryKey: ['expenses', filterCategory, filterStart, filterEnd],
    queryFn: () => {
      const p = new URLSearchParams();
      if (filterStart) p.set('startDate', filterStart);
      if (filterEnd) p.set('endDate', filterEnd);
      if (filterCategory) p.set('categoryId', filterCategory);
      const qs = p.toString();
      return api.get<Expense[]>(`/expenses${qs ? `?${qs}` : ''}`);
    },
  });
  const breakdownQ = useQuery<Breakdown[]>({
    queryKey: ['expense-breakdown', filterStart, filterEnd],
    queryFn: () => {
      const p = new URLSearchParams();
      if (filterStart) p.set('startDate', filterStart);
      if (filterEnd) p.set('endDate', filterEnd);
      const qs = p.toString();
      return api.get<Breakdown[]>(`/expenses/breakdown${qs ? `?${qs}` : ''}`);
    },
  });

  const createMut = useMutation({
    mutationFn: (body: any) => api.post('/expenses', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-breakdown'] });
      queryClient.invalidateQueries({ queryKey: ['cash-balance'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      setAmount('');
      setDescription('');
    },
    onError: (e: unknown) => setApiError(e instanceof ApiError ? e.message : 'خطأ في إنشاء المصروف'),
  });
  const createCatMut = useMutation({
    mutationFn: (body: any) => api.post('/expenses/categories', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expense-categories'] }),
    onError: (e: unknown) => setApiError(e instanceof ApiError ? e.message : 'خطأ في إنشاء الفئة'),
  });

  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="text-xl font-bold text-zinc-900">المصاريف</h1>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="mb-3 font-semibold">إضافة مصروف</h3>
        {apiError && <p className="mb-2 text-sm text-red-600">{apiError}</p>}
        <div className="grid gap-3 md:grid-cols-4">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded-md border px-3 py-2 text-sm">
            <option value="">اختر الفئة</option>
            {categoriesQ.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="text" placeholder="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-md border px-3 py-2 text-sm" dir="ltr" />
          <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
          <input type="text" placeholder="الوصف (اختياري)" value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
        </div>
        <button type="button" onClick={() => createMut.mutate({ categoryId, amount, description: description || undefined, expenseDate })} disabled={createMut.isPending || !categoryId || !amount} className="mt-3 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">إضافة المصروف</button>
        <div className="mt-4 flex gap-2">
          <input type="text" placeholder="فئة جديدة" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} className="flex-1 rounded-md border px-3 py-2 text-sm" />
          <button type="button" onClick={() => { if (newCatName.trim()) { createCatMut.mutate({ name: newCatName.trim() }); setNewCatName(''); } }} className="rounded-md border px-4 py-2 text-sm">إضافة فئة</button>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="mb-3 font-semibold">تفصيل المصاريف حسب الفئة</h3>
        <div className="mb-2 flex gap-2">
          <input type="date" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} className="rounded-md border px-3 py-1.5 text-sm" />
          <input type="date" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} className="rounded-md border px-3 py-1.5 text-sm" />
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-zinc-500"><th className="py-2 text-right">الفئة</th><th className="text-left">الإجمالي</th><th className="text-left">النسبة</th></tr></thead>
          <tbody>
            {breakdownQ.data?.map((b) => (
              <tr key={b.categoryId} className="border-b">
                <td className="py-2">{b.categoryName}</td>
                <td dir="ltr" className="text-left">{Number(b.totalAmount).toFixed(2)} {currencySymbol}</td>
                <td dir="ltr" className="text-left">{b.percentage}%</td>
              </tr>
            ))}
            {(!breakdownQ.data || breakdownQ.data.length === 0) && <tr><td colSpan={3} className="py-4 text-center text-zinc-500">لا توجد مصاريف</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="mb-3 font-semibold">قائمة المصاريف</h3>
        <div className="mb-2 flex gap-2">
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="rounded-md border px-3 py-1.5 text-sm">
            <option value="">كل الفئات</option>
            {categoriesQ.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-zinc-500"><th className="py-2 text-right">الفئة</th><th className="text-left">المبلغ</th><th className="text-right">الوصف</th><th className="text-right">التاريخ</th></tr></thead>
            <tbody>
              {expensesQ.data?.map((e) => (
                <tr key={e.id} className="border-b">
                  <td>{e.category?.name ?? e.categoryId}</td>
                  <td dir="ltr" className="text-left">{Number(e.amount).toFixed(2)}</td>
                  <td className="text-xs">{e.description ?? '—'}</td>
                  <td className="text-xs">{new Date(e.expenseDate).toLocaleDateString('ar-DZ')}</td>
                </tr>
              ))}
              {(!expensesQ.data || expensesQ.data.length === 0) && <tr><td colSpan={4} className="py-4 text-center text-zinc-500">لا توجد مصاريف</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
