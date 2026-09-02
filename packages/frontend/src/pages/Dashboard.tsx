import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { Wallet, TrendingUp, CreditCard, Wrench, Receipt, AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useDashboard } from '@/features/reports/hooks/useDashboard';
import { FlexyExpressWidget } from '@/features/dashboard/components/FlexyExpressWidget';
import { Skeleton } from '@/components/feedback/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';

type CashBalance = { currentBalance: string };
type RepairTicket = {
  id: string;
  ticketNumber: string;
  deviceBrand: string;
  deviceModel: string;
  status: string;
  contact: { name: string };
};
type Transaction = {
  id: string;
  type: string;
  amount: string;
  createdAt: string;
  account?: { contact?: { name: string } };
};

function formatMoney(v: string | number | undefined | null): string {
  if (v === undefined || v === null || v === '') return '0.00';
  const n = Number(v);
  if (Number.isNaN(n)) return '0.00';
  return n.toFixed(2);
}

function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: 'emerald' | 'rose' | 'amber' | 'cyan';
}) {
  const map: Record<string, string> = {
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
    rose: 'border-rose-500/20 bg-rose-500/10 text-rose-400',
    amber: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
    cyan: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400',
  };
  const iconWrap = map[accent];
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{title}</span>
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md border ${iconWrap}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p dir="ltr" className="mt-3 font-mono text-2xl font-bold text-slate-100">
        {value} <span className="text-sm font-sans font-medium text-slate-400">د.ج</span>
      </p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-7 w-32" />
      <Skeleton className="mt-2 h-3 w-20" />
    </div>
  );
}

const REPAIR_STATUS_LABEL: Record<string, string> = {
  RECEIVED: 'مستلم',
  DIAGNOSING: 'قيد التشخيص',
  IN_REPAIR: 'قيد الإصلاح',
  READY: 'جاهز',
  DELIVERED: 'تم التسليم',
  CANCELLED: 'ملغي',
};

const TYPE_LABEL: Record<string, string> = {
  SALE: 'بيع',
  PURCHASE: 'شراء',
  PAYMENT_IN: 'تحصيل',
  PAYMENT_OUT: 'دفع',
  OFFSET: 'مقاصة',
};

const TYPE_BADGE: Record<string, string> = {
  SALE: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  PURCHASE: 'border-rose-500/20 bg-rose-500/10 text-rose-400',
  PAYMENT_IN: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  PAYMENT_OUT: 'border-rose-500/20 bg-rose-500/10 text-rose-400',
  OFFSET: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
};

export function Dashboard() {
  const qc = useQueryClient();
  const summaryQ = useDashboard();

  const cashQ = useQuery<CashBalance>({
    queryKey: ['cash-balance'],
    queryFn: () => api.get<CashBalance>('/cash/balance'),
    staleTime: 30_000,
  });

  const repairsQ = useQuery<RepairTicket[]>({
    queryKey: ['repairs', null],
    queryFn: () => api.get<RepairTicket[]>('/repair'),
    staleTime: 30_000,
  });

  const txQ = useQuery<Transaction[]>({
    queryKey: ['transactions'],
    queryFn: () => api.get<Transaction[]>('/transactions'),
    staleTime: 30_000,
  });

  const isLoading = summaryQ.isLoading || cashQ.isLoading;
  const isError = summaryQ.isError || cashQ.isError;
  const errorMsg =
    (summaryQ.error as unknown as { message?: string })?.message ||
    (cashQ.error as unknown as { message?: string })?.message ||
    'تعذر تحميل البيانات';

  function retryAll() {
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['cash-balance'] });
    qc.invalidateQueries({ queryKey: ['repairs'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
  }

  // Derived KPIs
  const s = summaryQ.data;
  const dailySales = s ? (s.todayProfit?.totalProfit ?? s.totalSales ?? s.salesVolume ?? '0') : '0';
  const dailyExpenses = s?.totalExpenses ?? '0';
  const repairProfit = s?.repairProfit ?? '0';
  const liveCash = cashQ.data?.currentBalance ?? s?.cashBalance ?? '0';

  // Pipeline distribution
  const tickets: RepairTicket[] = Array.isArray(repairsQ.data) ? (repairsQ.data as RepairTicket[]) : [];
  const activeTickets = tickets.filter((t) => !['DELIVERED', 'CANCELLED'].includes(t.status));
  const byStatus = (status: string) => tickets.filter((t) => t.status === status).length;

  const recentTx: Transaction[] = Array.isArray(txQ.data) ? (txQ.data as Transaction[]).slice(0, 5) : [];

  if (isLoading) {
    return (
      <div dir="rtl" className="font-sans space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-4 h-20 w-full" />
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-4 h-20 w-full" />
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-4 h-20 w-full" />
          </div>
        </div>
        <p className="text-sm text-slate-400" role="status" aria-busy="true" aria-live="polite">
          جاري تحميل لوحة التحكم...
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div dir="rtl" className="font-sans space-y-4">
        <ErrorState
          title="تعذر تحميل لوحة التحكم"
          message={errorMsg}
          onRetry={retryAll}
        />
      </div>
    );
  }

  const isEmpty = !s && tickets.length === 0 && recentTx.length === 0;

  return (
    <div dir="rtl" className="font-sans space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-100">لوحة التحكم</h1>
        <span className="text-xs text-slate-500">
          {new Date().toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>

      {isEmpty ? (
        <EmptyState title="لا توجد بيانات بعد" message="ابدأ بإنشاء عملية بيع أو تذكرة صيانة لعرض الإحصائيات هنا." />
      ) : null}

      {/* Top 4 KPI metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="مبيعات اليوم"
          value={formatMoney(dailySales)}
          sub="إجمالي مبيعات اليوم"
          icon={TrendingUp}
          accent="emerald"
        />
        <KpiCard
          title="مصاريف اليوم"
          value={formatMoney(dailyExpenses)}
          sub="إجمالي المصاريف"
          icon={CreditCard}
          accent="rose"
        />
        <KpiCard
          title="أرباح الصيانة"
          value={formatMoney(repairProfit)}
          sub="صافي ربح الإصلاحات"
          icon={Wrench}
          accent="amber"
        />
        <KpiCard
          title="النقد في الصندوق"
          value={formatMoney(liveCash)}
          sub="رصيد مباشر"
          icon={Wallet}
          accent="cyan"
        />
      </div>

      {/* Middle row: Pipeline + Flexy */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Active Repairs Pipeline widget */}
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">مسار الإصلاحات النشطة</h2>
            <NavLink to="/repairs" className="text-xs text-cyan-400 hover:text-cyan-300">
              عرض الكل
            </NavLink>
          </div>

          {/* Status distribution badges */}
          <div className="mt-3 flex flex-wrap gap-2">
            {(['RECEIVED', 'DIAGNOSING', 'IN_REPAIR', 'READY'] as const).map((st) => (
              <span
                key={st}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300"
              >
                {REPAIR_STATUS_LABEL[st]}
                <span dir="ltr" className="font-mono rounded-full bg-slate-700 px-1.5 py-0.5 text-xs">
                  {byStatus(st)}
                </span>
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-400">
              الإجمالي النشط
              <span dir="ltr" className="font-mono rounded-full bg-cyan-500/20 px-1.5 py-0.5 text-xs">
                {activeTickets.length}
              </span>
            </span>
          </div>

          {/* Ticket list */}
          <div className="mt-4">
            {repairsQ.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : repairsQ.isError ? (
              <div className="flex items-center justify-between rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                <span className="text-xs text-rose-300">تعذر تحميل التذاكر</span>
                <button
                  type="button"
                  onClick={() => qc.invalidateQueries({ queryKey: ['repairs'] })}
                  className="inline-flex items-center gap-1 rounded bg-rose-600 px-2 py-1 text-xs text-white hover:bg-rose-500"
                >
                  <RefreshCw className="h-3 w-3" /> إعادة المحاولة
                </button>
              </div>
            ) : activeTickets.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-700 bg-slate-900/50 px-3 py-6 text-center text-sm text-slate-400">
                لا توجد إصلاحات نشطة حالياً
              </p>
            ) : (
              <ul className="divide-y divide-slate-800">
                {activeTickets.slice(0, 5).map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">
                        <span dir="ltr" className="font-mono text-slate-400">
                          {t.ticketNumber}
                        </span>{' '}
                        — {t.deviceBrand} {t.deviceModel}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{t.contact?.name ?? '--'}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
                      {REPAIR_STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Flexy Express widget */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-100">فليكسي إكسبرس</h2>
          <p className="mt-1 text-xs text-slate-500">محاكاة — غير مرتبط بواجهة دفع حقيقية</p>
          <div className="mt-3">
            <FlexyExpressWidget />
          </div>
        </div>
      </div>

      {/* Recent Transactions feed */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">آخر المعاملات</h2>
          <NavLink to="/pos" className="text-xs text-cyan-400 hover:text-cyan-300">
            فتح نقطة البيع
          </NavLink>
        </div>

        {txQ.isLoading ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : txQ.isError ? (
          <div className="mt-4 flex items-center justify-between rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
            <span className="inline-flex items-center gap-2 text-xs text-rose-300">
              <AlertTriangle className="h-4 w-4" /> تعذر تحميل المعاملات
            </span>
            <button
              type="button"
              onClick={() => qc.invalidateQueries({ queryKey: ['transactions'] })}
              className="inline-flex items-center gap-1 rounded bg-rose-600 px-2 py-1 text-xs text-white hover:bg-rose-500"
            >
              <RefreshCw className="h-3 w-3" /> إعادة المحاولة
            </button>
          </div>
        ) : recentTx.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-slate-700 bg-slate-900/50 px-3 py-6 text-center text-sm text-slate-400">
            لا توجد معاملات بعد
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-800">
            {recentTx.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${TYPE_BADGE[tx.type] ?? 'border-slate-700 bg-slate-800 text-slate-300'}`}
                  >
                    {TYPE_LABEL[tx.type] ?? tx.type}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-200 truncate">{tx.account?.contact?.name ?? '—'}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(tx.createdAt).toLocaleString('ar-DZ')}
                    </p>
                  </div>
                </div>
                <span dir="ltr" className="font-mono text-sm font-medium text-slate-100 shrink-0">
                  {formatMoney(tx.amount)} د.ج
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
