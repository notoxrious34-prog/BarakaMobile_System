import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useDashboard } from '@/features/reports/hooks/useDashboard';
import { ErrorState } from '@/components/feedback/ErrorState';

const TX_TYPE_LABEL: Record<string, string> = {
  SALE: 'بيع',
  PURCHASE: 'شراء',
  PAYMENT_IN: 'تحصيل',
  PAYMENT_OUT: 'دفع',
  OFFSET: 'تسوية',
};

function formatMoney(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '0.00 د.ج';
  const n = Number(value);
  if (Number.isNaN(n)) return '0.00 د.ج';
  return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.ج`;
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="h-3 w-20 animate-pulse rounded bg-zinc-200" />
      <div className="mt-3 h-6 w-32 animate-pulse rounded bg-zinc-200" />
    </div>
  );
}

function SkeletonTableRow() {
  return (
    <tr>
      <td className="px-4 py-3"><div className="h-4 w-12 animate-pulse rounded bg-zinc-200" /></td>
      <td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-zinc-200" /></td>
      <td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded bg-zinc-200" /></td>
      <td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-zinc-200" /></td>
    </tr>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-7 w-32 animate-pulse rounded bg-zinc-200" />
        <div className="h-9 w-24 animate-pulse rounded bg-zinc-200" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-4 h-5 w-32 animate-pulse rounded bg-zinc-200" />
        <table className="w-full">
          <tbody>
            <SkeletonTableRow />
            <SkeletonTableRow />
            <SkeletonTableRow />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NetPositionTone(value: string): string {
  const n = Number(value);
  if (Number.isNaN(n) || n === 0) return 'border-zinc-200 bg-zinc-50 text-zinc-900';
  if (n > 0) return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  return 'border-red-200 bg-red-50 text-red-900';
}

export function Dashboard() {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useDashboard();
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const lastUpdatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleString('ar-DZ', { dateStyle: 'medium', timeStyle: 'medium' })
    : new Date(nowTick).toLocaleString('ar-DZ', { dateStyle: 'medium', timeStyle: 'medium' });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-900">لوحة التحكم</h1>
        </header>
        <ErrorState
          title="تعذر تحميل لوحة التحكم"
          message="حدث خطأ أثناء جلب البيانات. حاول مرة أخرى."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (!data) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">لوحة التحكم</h1>
          <p className="mt-1 text-xs text-zinc-500">آخر تحديث: {lastUpdatedLabel}</p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          تحديث
        </button>
      </header>

      {/* Row 1 — Capital (3 cards) */}
      <section aria-label="رأس المال">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">رأس المال</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-zinc-500">رأس المال الكلي</p>
            <p className="mt-1 text-lg font-bold text-zinc-900" dir="ltr">{formatMoney(data.capital.totalCapital)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-zinc-500">النقد والمديونيات</p>
            <p className="mt-1 text-lg font-bold text-zinc-900" dir="ltr">{formatMoney(data.capital.cashAndReceivables)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-zinc-500">قيمة المخزون</p>
            <p className="mt-1 text-lg font-bold text-zinc-900" dir="ltr">{formatMoney(data.capital.stockValue)}</p>
          </div>
        </div>
      </section>

      {/* Row 2 — Profit (4 cards, 2x2) */}
      <section aria-label="الأرباح">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">الأرباح</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-zinc-500">أرباح اليوم — الإجمالي</p>
            <p className="mt-1 text-lg font-bold text-zinc-900" dir="ltr">{formatMoney(data.todayProfit.totalProfit)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-zinc-500">أرباح اليوم — الخدمات</p>
            <p className="mt-1 text-lg font-bold text-zinc-900" dir="ltr">{formatMoney(data.todayProfit.serviceProfit)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-zinc-500">أرباح الشهر — الإجمالي</p>
            <p className="mt-1 text-lg font-bold text-zinc-900" dir="ltr">{formatMoney(data.monthProfit.totalProfit)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-zinc-500">أرباح الشهر — الخدمات</p>
            <p className="mt-1 text-lg font-bold text-zinc-900" dir="ltr">{formatMoney(data.monthProfit.serviceProfit)}</p>
          </div>
        </div>
      </section>

      {/* Row 3 — Debts (3 cards) */}
      <section aria-label="الديون">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">الديون</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-zinc-500">ديون العملاء (ما يدينون لنا)</p>
            <p className="mt-1 text-lg font-bold text-zinc-900" dir="ltr">{formatMoney(data.debts.totalCustomerDebt)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-zinc-500">ديون الموردين (ما ندين لهم)</p>
            <p className="mt-1 text-lg font-bold text-zinc-900" dir="ltr">{formatMoney(data.debts.totalSupplierDebt)}</p>
          </div>
          <div className={`rounded-lg border p-4 shadow-sm ${NetPositionTone(data.debts.netPosition)}`}>
            <p className="text-xs font-medium opacity-70">الوضع الصافي</p>
            <p className="mt-1 text-lg font-bold" dir="ltr">{formatMoney(data.debts.netPosition)}</p>
          </div>
        </div>
      </section>

      {/* Row 4 — Inventory (3 cards) */}
      <section aria-label="المخزون">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">المخزون</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-zinc-500">إجمالي الأصناف</p>
            <p className="mt-1 text-lg font-bold text-zinc-900">{data.inventory.totalItems}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-2 text-xs font-medium text-zinc-500">
              أصناف منخفضة المخزون
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">تحذير</span>
            </p>
            <p className="mt-1 text-lg font-bold text-amber-900">{data.inventory.lowStockItems}</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-2 text-xs font-medium text-zinc-500">
              أصناف نفدت
              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">خطر</span>
            </p>
            <p className="mt-1 text-lg font-bold text-red-900">{data.inventory.outOfStockItems}</p>
          </div>
        </div>
      </section>

      {/* Row 5 — Recent transactions */}
      <section aria-label="المعاملات الأخيرة" className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-800">المعاملات الأخيرة</h2>
          <Link
            to="/transactions"
            className="text-sm font-medium text-zinc-700 hover:text-zinc-900 hover:underline"
          >
            عرض كل المعاملات
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
                <th className="px-4 py-2 text-right font-medium">النوع</th>
                <th className="px-4 py-2 text-right font-medium">المبلغ</th>
                <th className="px-4 py-2 text-right font-medium">جهة الاتصال</th>
                <th className="px-4 py-2 text-right font-medium">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {data.recentTransactions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">لا توجد معاملات بعد</td>
                </tr>
              ) : (
                data.recentTransactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                    <td className="px-4 py-3 text-zinc-900">{TX_TYPE_LABEL[tx.type] ?? tx.type}</td>
                    <td className="px-4 py-3 text-zinc-900" dir="ltr">{formatMoney(tx.totalAmount)}</td>
                    <td className="px-4 py-3 text-zinc-700">{tx.contactName}</td>
                    <td className="px-4 py-3 text-zinc-600" dir="ltr">{new Date(tx.createdAt).toLocaleString('ar-DZ')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
