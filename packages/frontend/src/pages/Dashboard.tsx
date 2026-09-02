import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from '@/features/reports/hooks/useDashboard';
import { FlexyExpressWidget } from '@/features/dashboard/components/FlexyExpressWidget';
import { api } from '@/lib/api';
import type { RepairTicket } from '@/features/repairs/hooks/useRepairs';

const TRANSACTION_TYPE_LABEL: Record<string, string> = {
  SALE: 'بيع',
  PURCHASE: 'شراء',
  PAYMENT_IN: 'تحصيل',
  PAYMENT_OUT: 'دفع',
  OFFSET: 'مقاصة',
};

type Transaction = {
  id: string;
  type: string;
  amount: string;
  createdAt: string;
};

export function Dashboard() {
  const { data: summary, isLoading, isError } = useDashboard();

  const { data: repairsData } = useQuery<RepairTicket[]>({
    queryKey: ['repairs', null],
    queryFn: () => api.get<RepairTicket[]>('/repair'),
  });

  const { data: transactionsData } = useQuery<Transaction[]>({
    queryKey: ['transactions'],
    queryFn: () => api.get<Transaction[]>('/transactions'),
  });

  const repairCounts = (repairsData ?? []).reduce((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const recentTransactions = (transactionsData ?? []).slice(0, 5);

  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-slate-400 font-sans">جاري التحميل...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-rose-400 font-sans">تعذر تحميل البيانات</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="font-sans space-y-4">
      <div className="flex flex-row items-center justify-between">
        <h1 className="text-xl font-bold text-slate-100">لوحة التحكم</h1>
        <span className="text-sm text-slate-400">
          {new Date().toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">إجمالي المبيعات</span>
            <span>💰</span>
          </div>
          <p className="text-2xl font-bold font-mono text-slate-100 mt-1 text-emerald-400">
            <span dir="ltr">{summary?.totalSales ?? '0.00'}</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">د.ج</p>
        </div>
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">المصاريف</span>
            <span>📤</span>
          </div>
          <p className="text-2xl font-bold font-mono text-slate-100 mt-1 text-rose-400">
            <span dir="ltr">{summary?.totalExpenses ?? '0.00'}</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">د.ج</p>
        </div>
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">أرباح الصيانة</span>
            <span>🔧</span>
          </div>
          <p className="text-2xl font-bold font-mono text-slate-100 mt-1 text-amber-400">
            <span dir="ltr">{summary?.repairProfit ?? '0.00'}</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">د.ج</p>
        </div>
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">رصيد الصندوق</span>
            <span>🏦</span>
          </div>
          <p className="text-2xl font-bold font-mono text-slate-100 mt-1 text-cyan-400">
            <span dir="ltr">{summary?.cashBalance ?? '0.00'}</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">د.ج</p>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl border border-amber-500/20 p-4 mt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-amber-400">تذاكر الورشة النشطة</h2>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
          <div className="bg-slate-800 rounded-lg p-2 text-center">
            <p className="text-lg font-bold font-mono text-slate-100">{repairCounts['RECEIVED'] ?? 0}</p>
            <p className="text-xs text-slate-400 mt-0.5">مستلم</p>
          </div>
          <div className="bg-slate-800 rounded-lg p-2 text-center">
            <p className="text-lg font-bold font-mono text-slate-100">{repairCounts['DIAGNOSING'] ?? 0}</p>
            <p className="text-xs text-slate-400 mt-0.5">قيد التشخيص</p>
          </div>
          <div className="bg-slate-800 rounded-lg p-2 text-center">
            <p className="text-lg font-bold font-mono text-slate-100">{repairCounts['IN_REPAIR'] ?? 0}</p>
            <p className="text-xs text-slate-400 mt-0.5">قيد الإصلاح</p>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2 text-center">
            <p className="text-lg font-bold font-mono text-emerald-400">{repairCounts['READY'] ?? 0}</p>
            <p className="text-xs text-slate-400 mt-0.5">جاهز 🔔</p>
          </div>
          <div className="bg-slate-800 rounded-lg p-2 text-center">
            <p className="text-lg font-bold font-mono text-slate-100">{repairCounts['DELIVERED'] ?? 0}</p>
            <p className="text-xs text-slate-400 mt-0.5">تم التسليم</p>
          </div>
          <div className="bg-slate-800 rounded-lg p-2 text-center">
            <p className="text-lg font-bold font-mono text-slate-100">{repairCounts['CANCELLED'] ?? 0}</p>
            <p className="text-xs text-slate-400 mt-0.5">ملغى</p>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <FlexyExpressWidget />
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <button
          type="button"
          onClick={() => navigate('/repairs')}
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          تذكرة صيانة جديدة
        </button>
        <button
          type="button"
          onClick={() => navigate('/transactions')}
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          بيع جديد
        </button>
        <button
          type="button"
          onClick={() => navigate('/expenses')}
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          مصروف جديد
        </button>
        <button
          type="button"
          onClick={() => navigate('/inventory')}
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          المخزون
        </button>
        <button
          type="button"
          onClick={() => navigate('/reports')}
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          التقارير
        </button>
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 mt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">آخر المعاملات</h2>
        </div>
        <table className="w-full text-sm mt-3">
          <thead>
            <tr>
              <th className="text-right text-xs text-slate-500 pb-2">النوع</th>
              <th className="text-right text-xs text-slate-500 pb-2">المبلغ</th>
              <th className="text-right text-xs text-slate-500 pb-2">التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {recentTransactions.length === 0 ? (
              <tr className="border-t border-slate-800">
                <td colSpan={3} className="text-center text-slate-500 py-4">
                  لا توجد معاملات
                </td>
              </tr>
            ) : (
              recentTransactions.map((tx) => (
                <tr key={tx.id} className="border-t border-slate-800">
                  <td className="py-2.5 px-3 text-slate-200">{TRANSACTION_TYPE_LABEL[tx.type] ?? tx.type}</td>
                  <td className="py-2.5 px-3">
                    <span dir="ltr" className="font-mono text-slate-200">
                      {tx.amount}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-400">{new Date(tx.createdAt).toLocaleDateString('ar-DZ')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
