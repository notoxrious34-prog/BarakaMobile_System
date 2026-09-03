import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, useNavigate } from 'react-router-dom';
import Decimal from 'decimal.js';
import { Wallet, TrendingUp, CreditCard, Wrench, AlertTriangle, RefreshCw, Package, Users, ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { useDashboard } from '@/features/reports/hooks/useDashboard';
import { useSalesTrend } from '@/features/reports/hooks/useSalesTrend';
import { SalesTrendWidget } from '@/components/dashboard/SalesTrendWidget';
import { FlexyExpressWidget } from '@/features/dashboard/components/FlexyExpressWidget';
import { Skeleton } from '@/components/feedback/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { arPlural } from '@/lib/arPlural';

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

// DRY — shared micro-interaction + entrance utilities
const CARD_HOVER =
  'transition-all duration-200 hover:-translate-y-1 hover:scale-[1.01] hover:shadow-xl hover:border-navy-border/50 focus-within:ring-2 focus-within:ring-cyan-500/20 motion-reduce:transform-none motion-reduce:transition-none';
const ROW_HOVER =
  'transition-all duration-200 hover:-translate-y-0.5 hover:bg-navy-900/80 hover:border-navy-border/40 hover:shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30 motion-reduce:transform-none';
const ENTRANCE = 'motion-reduce:animate-none animate-fade-in-up';

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
  const accentMap: Record<string, { border: string; iconWrap: string; glow: string; value: string }> = {
    emerald: {
      border: 'border-emerald-400/20',
      iconWrap: 'border-emerald-400/20 bg-emerald-950/60 text-emerald-400',
      glow: 'shadow-lg shadow-emerald-500/10',
      value: 'text-emerald-400',
    },
    rose: {
      border: 'border-rose-400/20',
      iconWrap: 'border-rose-400/20 bg-rose-950/60 text-rose-400',
      glow: 'shadow-lg shadow-rose-500/10',
      value: 'text-rose-400',
    },
    amber: {
      border: 'border-amber-400/20',
      iconWrap: 'border-amber-400/20 bg-amber-950/60 text-amber-400',
      glow: 'shadow-lg shadow-amber-500/10',
      value: 'text-amber-400',
    },
    cyan: {
      border: 'border-cyan-400/20',
      iconWrap: 'border-cyan-400/20 bg-cyan-950/60 text-cyan-400',
      glow: 'shadow-lg shadow-cyan-500/10',
      value: 'text-cyan-400',
    },
  };
  const a = accentMap[accent];
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br from-navy-900 to-navy-950 p-5 ${a.border} ${a.glow} shadow-xl shadow-navy-950/40 ${CARD_HOVER} ${ENTRANCE} focus-visible:outline-none`}
      tabIndex={0}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide text-slate-400">{title}</span>
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border backdrop-blur-sm ${a.iconWrap}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p dir="ltr" className={`mt-3 font-mono text-2xl font-bold ${a.value}`}>
        {value} <span className="text-sm font-sans font-medium text-slate-400">د.ج</span>
      </p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="rounded-2xl border border-navy-border/30 bg-navy-900 p-5">
      <Skeleton className="h-4 w-24 bg-navy-800" />
      <Skeleton className="mt-3 h-7 w-32 bg-navy-800" />
      <Skeleton className="mt-2 h-3 w-20 bg-navy-800" />
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
  SALE: 'border-emerald-400/20 bg-emerald-950/50 text-emerald-400',
  PURCHASE: 'border-rose-400/20 bg-rose-950/50 text-rose-400',
  PAYMENT_IN: 'border-emerald-400/20 bg-emerald-950/50 text-emerald-400',
  PAYMENT_OUT: 'border-rose-400/20 bg-rose-950/50 text-rose-400',
  OFFSET: 'border-amber-400/20 bg-amber-950/50 text-amber-400',
};

const TYPE_LEFT_BORDER: Record<string, string> = {
  SALE: 'border-l-emerald-500/50',
  PURCHASE: 'border-l-rose-500/50',
  PAYMENT_IN: 'border-l-emerald-500/50',
  PAYMENT_OUT: 'border-l-rose-500/50',
  OFFSET: 'border-l-amber-500/50',
};

export function Dashboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
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

  const trendQ = useSalesTrend();

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
    qc.invalidateQueries({ queryKey: ['transactions', 'sales-trend'] });
  }

  // Derived KPIs — approved opportunistic cleanup: removed dead `s.todayProfit?.totalProfit` branch
  const s = summaryQ.data;
  const dailySales = s ? (s.totalSales ?? s.salesVolume ?? '0') : '0';
  const dailyExpenses = s?.totalExpenses ?? '0';
  const repairProfit = s?.repairProfit ?? '0';
  const liveCash = cashQ.data?.currentBalance ?? s?.cashBalance ?? '0';

  // Pipeline distribution
  const tickets: RepairTicket[] = Array.isArray(repairsQ.data) ? (repairsQ.data as RepairTicket[]) : [];
  const activeTickets = tickets.filter((t) => !['DELIVERED', 'CANCELLED'].includes(t.status));
  const byStatus = (status: string) => tickets.filter((t) => t.status === status).length;

  const recentTx: Transaction[] = Array.isArray(txQ.data) ? (txQ.data as Transaction[]).slice(0, 5) : [];

  // --- Smart Alerts derived state (Decimal for money) ---
  const pendingRepairsCount = tickets.filter((t) => ['DIAGNOSING', 'IN_REPAIR', 'IN_PROGRESS', 'RECEIVED'].includes(t.status)).length;
  const lowStockCount = s ? (s.inventory.lowStockItems + s.inventory.outOfStockItems) : 0;
  const hasLowStock = lowStockCount > 0;
  const customerDebtRaw = s?.debts.totalCustomerDebt ?? '0';
  let hasCustomerDebt = false;
  try { hasCustomerDebt = !new Decimal(customerDebtRaw).equals(new Decimal(0)); } catch { hasCustomerDebt = customerDebtRaw !== '0' && customerDebtRaw !== '0.00'; }

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
          <div className="rounded-2xl border border-navy-border/30 bg-navy-900 p-4">
            <Skeleton className="h-5 w-32 bg-navy-800" />
            <Skeleton className="mt-4 h-20 w-full bg-navy-800" />
          </div>
          <div className="rounded-2xl border border-navy-border/30 bg-navy-900 p-4">
            <Skeleton className="h-5 w-32 bg-navy-800" />
            <Skeleton className="mt-4 h-20 w-full bg-navy-800" />
          </div>
          <div className="rounded-2xl border border-navy-border/30 bg-navy-900 p-4">
            <Skeleton className="h-5 w-32 bg-navy-800" />
            <Skeleton className="mt-4 h-20 w-full bg-navy-800" />
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
        <div className="rounded-2xl border border-rose-500/20 bg-navy-900 p-6">
          <ErrorState title="تعذر تحميل لوحة التحكم" message={errorMsg} onRetry={retryAll} />
        </div>
      </div>
    );
  }

  const isEmpty = !s && tickets.length === 0 && recentTx.length === 0;

  return (
    <div dir="rtl" className="font-sans space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-slate-100">لوحة التحكم</h1>
        <span className="text-xs text-slate-500">
          {new Date().toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>

      {isEmpty ? (
        <div className="rounded-2xl border border-navy-border/30 bg-navy-900 px-6 py-8">
          <EmptyState title="لا توجد بيانات بعد" message="ابدأ بإنشاء عملية بيع أو تذكرة صيانة لعرض الإحصائيات هنا." />
        </div>
      ) : null}

      {/* Top 4 KPI metric cards — Deep Navy gradients */}
      <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${ENTRANCE}`} style={{ animationDelay: '60ms' }}>
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

      {/* Smart Alerts — C2 layout balance: 0=nothing, 1=full-width banner, 2-3=grid; C1 arPlural */}
      {(() => {
        const alertCount = (pendingRepairsCount > 0 ? 1 : 0) + (hasLowStock ? 1 : 0) + (hasCustomerDebt ? 1 : 0);
        if (alertCount === 0) return null;
        const repairsLabel = arPlural(pendingRepairsCount, {
          one: 'جهاز واحد قيد الفحص والإصلاح',
          two: 'جهازان قيد الفحص والإصلاح',
          few: 'أجهزة قيد الفحص والإصلاح',
          many: 'جهازاً قيد الفحص والإصلاح',
        });
        const stockLabel = arPlural(lowStockCount, {
          one: 'منتج واحد قارب على النفاد',
          two: 'منتجان قاربا على النفاد',
          few: 'منتجات قاربت على النفاد',
          many: 'منتجاً قارب على النفاد',
        });
        const gridClass = alertCount === 1 ? 'grid gap-3 grid-cols-1' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3';
        const singleBanner = 'flex items-center justify-between gap-3 rounded-2xl border border-navy-border/30 bg-navy-800 px-4 py-3 text-right shadow-sm focus-visible:outline-none focus-visible:ring-2 motion-reduce:transform-none transition-all duration-200 hover:border-navy-border/50 hover:shadow-md col-span-full';
        const gridCard = 'flex items-center gap-3 rounded-2xl border border-navy-border/30 bg-navy-800 px-4 py-3 text-right shadow-sm focus-visible:outline-none focus-visible:ring-2 motion-reduce:transform-none transition-all duration-200 hover:border-navy-border/50 hover:shadow-md';
        return (
          <div className={`${gridClass} ${ENTRANCE}`} style={{ animationDelay: '90ms' }}>
            {pendingRepairsCount > 0 && (
              <button
                type="button"
                onClick={() => navigate('/repairs')}
                className={alertCount === 1 ? `${singleBanner} border-r-2 border-r-amber-400/60 focus-visible:ring-amber-400/30 ${ENTRANCE}` : `${gridCard} border-r-2 border-r-amber-400/60 focus-visible:ring-amber-400/30 ${ENTRANCE}`}
                aria-label={`${repairsLabel} — الانتقال إلى الصيانة`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-950/60 text-amber-400 shrink-0">
                    <Wrench className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="block text-sm font-semibold text-slate-200 truncate">{repairsLabel}</span>
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
                  <span className="hidden sm:inline">اضغط للانتقال</span>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </span>
              </button>
            )}
            {hasLowStock && (
              <button
                type="button"
                onClick={() => navigate('/admin/catalog')}
                className={alertCount === 1 ? `${singleBanner} border-r-2 border-r-rose-400/60 focus-visible:ring-rose-400/30 ${ENTRANCE}` : `${gridCard} border-r-2 border-r-rose-400/60 focus-visible:ring-rose-400/30 ${ENTRANCE}`}
                aria-label={`${stockLabel} — الانتقال إلى الكتالوج`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-400/20 bg-rose-950/60 text-rose-400 shrink-0">
                    <Package className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="block text-sm font-semibold text-slate-200 truncate">{stockLabel}</span>
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
                  <span className="hidden sm:inline">اضغط للانتقال</span>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </span>
              </button>
            )}
            {hasCustomerDebt && (
              <button
                type="button"
                onClick={() => navigate('/admin/reports')}
                className={alertCount === 1 ? `${singleBanner} border-r-2 border-r-rose-400/60 focus-visible:ring-rose-400/30 ${ENTRANCE}` : `${gridCard} border-r-2 border-r-rose-400/60 focus-visible:ring-rose-400/30 ${ENTRANCE}`}
                aria-label={`مستحقات معلقة ${formatMoney(customerDebtRaw)} د.ج — الانتقال إلى التقارير`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-400/20 bg-rose-950/60 text-rose-400 shrink-0">
                    <Users className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="flex-1 min-w-0 text-right">
                    <span className="block text-sm font-semibold text-slate-200">مستحقات معلقة</span>
                    <span dir="ltr" className="block font-mono text-sm font-bold text-slate-200">{formatMoney(customerDebtRaw)} د.ج</span>
                  </span>
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
                  <span className="hidden sm:inline">اضغط للانتقال</span>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </span>
              </button>
            )}
          </div>
        );
      })()}

      {/* Sales Trend (7-day) — TB-064: between Smart Alerts and Pipeline */}
      <div className={`${ENTRANCE}`} style={{ animationDelay: '100ms' }}>
        <SalesTrendWidget
          days={trendQ.trend?.days ?? null}
          total={trendQ.trend?.total ?? '0.00'}
          trendPct={trendQ.trend?.trendPct ?? null}
          isUp={trendQ.trend?.isUp ?? true}
        />
      </div>

      {/* Middle row: Pipeline + Flexy */}
      <div className={`grid gap-4 lg:grid-cols-3 ${ENTRANCE}`} style={{ animationDelay: '120ms' }}>
        {/* Active Repairs Pipeline widget — stage-chip grid */}
        <div className={`lg:col-span-2 rounded-2xl border border-navy-border/30 bg-gradient-to-br from-navy-900 to-navy-950 p-5 shadow-xl shadow-navy-950/30 ${CARD_HOVER}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-slate-100">مسار الإصلاحات النشطة</h2>
            <NavLink to="/repairs" className="text-xs font-medium text-cyan-400 hover:text-cyan-300">
              عرض الكل
            </NavLink>
          </div>

          {/* Status distribution — chip grid */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {(['RECEIVED', 'DIAGNOSING', 'IN_REPAIR', 'READY'] as const).map((st) => (
              <span
                key={st}
                className="inline-flex items-center justify-between gap-2 rounded-xl border border-navy-border/30 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-300 backdrop-blur-sm"
              >
                {REPAIR_STATUS_LABEL[st]}
                <span
                  dir="ltr"
                  className="font-mono rounded-full bg-navy-800 border border-navy-border/20 px-2 py-0.5 text-xs text-slate-200"
                >
                  {byStatus(st)}
                </span>
              </span>
            ))}
            <span className="col-span-2 inline-flex items-center justify-between gap-2 rounded-xl border border-cyan-400/20 bg-cyan-950/40 px-3 py-2 text-xs font-medium text-cyan-400 sm:w-auto">
              الإجمالي النشط
              <span
                dir="ltr"
                className="font-mono rounded-full bg-cyan-500/20 border border-cyan-400/20 px-2 py-0.5 text-xs"
              >
                {activeTickets.length}
              </span>
            </span>
          </div>

          {/* Ticket list — navy rows with left accent */}
          <div className="mt-4">
            {repairsQ.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full bg-navy-800" />
                <Skeleton className="h-12 w-full bg-navy-800" />
                <Skeleton className="h-12 w-full bg-navy-800" />
              </div>
            ) : repairsQ.isError ? (
              <div className="flex items-center justify-between rounded-xl border border-rose-500/20 bg-rose-950/30 px-3 py-2.5">
                <span className="text-xs text-rose-300">تعذر تحميل التذاكر</span>
                <button
                  type="button"
                  onClick={() => qc.invalidateQueries({ queryKey: ['repairs'] })}
                  className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-500"
                >
                  <RefreshCw className="h-3 w-3" /> إعادة المحاولة
                </button>
              </div>
            ) : activeTickets.length === 0 ? (
              <p className="rounded-xl border border-dashed border-navy-border/30 bg-navy-950/40 px-3 py-8 text-center text-sm text-slate-400">
                لا توجد إصلاحات نشطة حالياً
              </p>
            ) : (
              <ul className="space-y-2">
                {activeTickets.slice(0, 5).map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded-xl border border-navy-border/20 bg-navy-950/60 px-3 py-3 backdrop-blur-sm"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">
                        <span dir="ltr" className="font-mono text-xs text-slate-400">
                          {t.ticketNumber}
                        </span>{' '}
                        — {t.deviceBrand} {t.deviceModel}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{t.contact?.name ?? '--'}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-navy-border/30 bg-white/[0.05] px-2.5 py-1 text-xs text-slate-300">
                      {REPAIR_STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Flexy Express widget — navy card */}
        <div className={`rounded-2xl border border-navy-border/30 bg-gradient-to-br from-navy-900 to-navy-950 p-5 shadow-xl shadow-navy-950/30 ${CARD_HOVER}`}>
          <h2 className="text-sm font-semibold tracking-wide text-slate-100">فليكسي إكسبرس</h2>
          <p className="mt-1 text-xs text-slate-500">محاكاة — غير مرتبط بواجهة دفع حقيقية</p>
          <div className="mt-4 rounded-xl border border-navy-border/20 bg-navy-950/40 p-3">
            <FlexyExpressWidget />
          </div>
        </div>
      </div>

      {/* Recent Transactions feed — navy wrapper */}
      <div className={`rounded-2xl border border-navy-border/30 bg-gradient-to-br from-navy-900 to-navy-950 p-5 shadow-xl shadow-navy-950/30 ${CARD_HOVER} ${ENTRANCE}`} style={{ animationDelay: '180ms' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-slate-100">آخر المعاملات</h2>
          <NavLink to="/pos" className="text-xs font-medium text-cyan-400 hover:text-cyan-300">
            فتح نقطة البيع
          </NavLink>
        </div>

        {txQ.isLoading ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-12 w-full bg-navy-800" />
            <Skeleton className="h-12 w-full bg-navy-800" />
            <Skeleton className="h-12 w-full bg-navy-800" />
          </div>
        ) : txQ.isError ? (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-rose-500/20 bg-rose-950/30 px-3 py-2.5">
            <span className="inline-flex items-center gap-2 text-xs text-rose-300">
              <AlertTriangle className="h-4 w-4" /> تعذر تحميل المعاملات
            </span>
            <button
              type="button"
              onClick={() => qc.invalidateQueries({ queryKey: ['transactions'] })}
              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2 py-1 text-xs font-medium text-white hover:bg-rose-500"
            >
              <RefreshCw className="h-3 w-3" /> إعادة المحاولة
            </button>
          </div>
        ) : recentTx.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-navy-border/30 bg-navy-950/40 px-3 py-8 text-center text-sm text-slate-400">
            لا توجد معاملات بعد
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {recentTx.map((tx) => (
              <li
                key={tx.id}
                className={`flex items-center justify-between rounded-xl border bg-navy-950/60 px-3 py-3 backdrop-blur-sm border-l-2 ${TYPE_LEFT_BORDER[tx.type] ?? 'border-l-navy-border/30'} border-y-navy-border/20 border-r-navy-border/20 ${ROW_HOVER}`}
                tabIndex={0}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${TYPE_BADGE[tx.type] ?? 'border-navy-border/30 bg-white/[0.05] text-slate-300'}`}
                  >
                    {TYPE_LABEL[tx.type] ?? tx.type}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-200 truncate">{tx.account?.contact?.name ?? '—'}</p>
                    <p className="text-xs text-slate-500">{new Date(tx.createdAt).toLocaleString('ar-DZ')}</p>
                  </div>
                </div>
                <span dir="ltr" className="font-mono text-sm font-bold text-slate-100 shrink-0">
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
