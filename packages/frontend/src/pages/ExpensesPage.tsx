import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';
import { Loading } from '@/components/feedback/Loading';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Skeleton } from '@/components/feedback/Skeleton';

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
    <div dir="rtl" className="min-h-screen bg-slate-950 p-4 font-sans space-y-4">
      <h1 className="text-xl font-bold text-slate-100">المصاريف</h1>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-100">إضافة مصروف</h3>
        {apiError && <p className="mb-2 text-sm text-rose-400">{apiError}</p>}
        <div className="grid gap-3 md:grid-cols-4">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 focus:border-rose-600 focus:outline-none focus:ring-1 focus:ring-rose-600"
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
            placeholder="المبلغ"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-rose-600 focus:outline-none focus:ring-1 focus:ring-rose-600"
            dir="ltr"
          />
          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 focus:border-rose-600 focus:outline-none focus:ring-1 focus:ring-rose-600"
          />
          <input
            type="text"
            placeholder="الوصف (اختياري)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-rose-600 focus:outline-none focus:ring-1 focus:ring-rose-600"
          />
        </div>
        <button
          type="button"
          onClick={() => createMut.mutate({ categoryId, amount, description: description || undefined, expenseDate })}
          disabled={createMut.isPending || !categoryId || !amount}
          className="mt-3 rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
        >
          {createMut.isPending ? 'جاري الإضافة...' : 'إضافة المصروف'}
        </button>
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            placeholder="فئة جديدة"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            className="flex-1 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-rose-600 focus:outline-none focus:ring-1 focus:ring-rose-600"
          />
          <button
            type="button"
            onClick={() => {
              if (newCatName.trim()) {
                createCatMut.mutate({ name: newCatName.trim() });
                setNewCatName('');
              }
            }}
            className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
          >
            إضافة فئة
          </button>
        </div>
        {categoriesQ.isLoading && (
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        )}
        {categoriesQ.isError && (
          <div className="mt-3">
            <ErrorState title="تعذر تحميل الفئات" message="حاول مرة أخرى" onRetry={() => categoriesQ.refetch()} />
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-100">تفصيل المصاريف حسب الفئة</h3>
        <div className="mb-3 flex gap-2">
          <input
            type="date"
            value={filterStart}
            onChange={(e) => setFilterStart(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-100 focus:border-rose-600 focus:outline-none focus:ring-1 focus:ring-rose-600"
          />
          <input
            type="date"
            value={filterEnd}
            onChange={(e) => setFilterEnd(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-100 focus:border-rose-600 focus:outline-none focus:ring-1 focus:ring-rose-600"
          />
        </div>
        {breakdownQ.isLoading ? (
          <Loading />
        ) : breakdownQ.isError ? (
          <ErrorState title="تعذر تحميل التفصيل" message="حاول مرة أخرى" onRetry={() => breakdownQ.refetch()} />
        ) : !breakdownQ.data || breakdownQ.data.length === 0 ? (
          <EmptyState title="لا توجد مصاريف" message="لا توجد بيانات للفترة المحددة" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 text-right font-medium">الفئة</th>
                  <th className="py-2 text-left font-medium">الإجمالي</th>
                  <th className="py-2 text-left font-medium">النسبة</th>
                </tr>
              </thead>
              <tbody>
                {breakdownQ.data.map((b) => (
                  <tr key={b.categoryId} className="border-b border-slate-800">
                    <td className="py-2 text-slate-200">{b.categoryName}</td>
                    <td dir="ltr" className="py-2 text-left font-mono text-rose-400">
                      {Number(b.totalAmount).toFixed(2)} {currencySymbol}
                    </td>
                    <td dir="ltr" className="py-2 text-left font-mono text-slate-300">
                      {b.percentage}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-100">قائمة المصاريف</h3>
        <div className="mb-3 flex gap-2">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-100 focus:border-rose-600 focus:outline-none focus:ring-1 focus:ring-rose-600"
          >
            <option value="">كل الفئات</option>
            {categoriesQ.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {expensesQ.isLoading ? (
          <Loading />
        ) : expensesQ.isError ? (
          <ErrorState title="تعذر تحميل المصاريف" message="حاول مرة أخرى" onRetry={() => expensesQ.refetch()} />
        ) : !expensesQ.data || expensesQ.data.length === 0 ? (
          <EmptyState title="لا توجد مصاريف" message="لم يتم تسجيل أي مصروف بعد" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 text-right font-medium">الفئة</th>
                  <th className="py-2 text-left font-medium">المبلغ</th>
                  <th className="py-2 text-right font-medium">الوصف</th>
                  <th className="py-2 text-right font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {expensesQ.data.map((e) => (
                  <tr key={e.id} className="border-b border-slate-800 hover:bg-slate-800/40">
                    <td className="py-2 text-slate-200">{e.category?.name ?? e.categoryId}</td>
                    <td dir="ltr" className="py-2 text-left font-mono text-rose-400">
                      {Number(e.amount).toFixed(2)} {currencySymbol}
                    </td>
                    <td className="py-2 text-xs text-slate-400">{e.description ?? '—'}</td>
                    <td className="py-2 text-xs text-slate-400">{new Date(e.expenseDate).toLocaleDateString('ar-DZ')}</td>
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
