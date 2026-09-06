import { useState } from 'react';
import Decimal from 'decimal.js';
import { RefreshCw, Printer, FileDown } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { BrandMark } from '@/components/layout/BrandMark';
import { Loading } from '@/components/feedback/Loading';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useCapitalQuery, useProfitQuery, useDebtSummaryQuery, useSummaryQuery } from '@/features/reports/hooks/useReports';
import { CapitalCard } from '@/features/reports/components/CapitalCard';
import { ProfitCard } from '@/features/reports/components/ProfitCard';
import { DebtSummaryTable } from '@/features/reports/components/DebtSummaryTable';
import { ContactLedgerModal } from '@/features/reports/components/ContactLedgerModal';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';
import { Link } from 'react-router-dom';

type TabKey = 'summary' | 'profit' | 'debts' | 'treasury';

const TAB_LABELS: Record<TabKey, string> = {
  summary: 'الملخص المالي',
  profit: 'الأرباح والخسائر',
  debts: 'الديون والحسابات',
  treasury: 'الخزينة والمصاريف',
};

type DatePreset = 'today' | 'week' | 'month' | 'custom';

function formatISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const fmt = (v?: string | null) => {
  if (!v) return '0.00';
  try {
    return new Decimal(v).toFixed(2);
  } catch {
    return '0.00';
  }
};

function getPresetRange(preset: DatePreset, customStart: string, customEnd: string): { startDate?: string; endDate?: string } {
  const now = new Date();
  if (preset === 'today') {
    const iso = formatISODate(now);
    return { startDate: iso, endDate: iso };
  }
  if (preset === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { startDate: formatISODate(start), endDate: formatISODate(now) };
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: formatISODate(start), endDate: formatISODate(now) };
  }
  if (preset === 'custom') {
    return { startDate: customStart || undefined, endDate: customEnd || undefined };
  }
  return {};
}

export function ReportsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [preset, setPreset] = useState<DatePreset>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const { startDate: profitStart, endDate: profitEnd } = getPresetRange(preset, customStart, customEnd);

  const capitalQ = useCapitalQuery();
  const profitQ = useProfitQuery(profitStart, profitEnd);
  const debtQ = useDebtSummaryQuery();
  const summaryQ = useSummaryQuery(profitStart, profitEnd);

  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';

  const [ledgerState, setLedgerState] = useState<{
    accountId: string;
    contactName: string;
    role: string;
  } | null>(null);

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ['capital'] });
    queryClient.invalidateQueries({ queryKey: ['profit'] });
    queryClient.invalidateQueries({ queryKey: ['debt-summary'] });
    queryClient.invalidateQueries({ queryKey: ['summary'] });
    queryClient.invalidateQueries({ queryKey: ['ledger'] });
  }

  async function handleExportPDF() {
    const api = (window as any).electronAPI?.exportViewPDF;
    if (api) {
      const result = await api(`BarakaMobile-Report-${activeTab}-${formatISODate(new Date())}`);
      if (!result.success && result.error !== 'cancelled') {
        alert(`فشل تصدير PDF: ${result.error}`);
      }
      return;
    }
    window.print();
  }

  function handleViewLedger(accountId: string, contactName: string, role: string) {
    setLedgerState({ accountId, contactName, role });
  }

  return (
    <div dir="rtl" className="font-sans space-y-4">
      <div className="flex items-center justify-between no-print">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-9 w-9" />
          <div>
            <h1 className="text-xl font-bold text-slate-100">التقارير</h1>
            <p className="text-xs text-slate-500">التحليلات الاستراتيجية والأداء المالي</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportPDF}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-500"
          >
            <FileDown className="h-4 w-4" aria-hidden="true" />
            تصدير PDF
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl border border-navy-800 bg-navy-900/60 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-navy-800/60"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            طباعة
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 rounded-xl border border-navy-800 bg-navy-900/60 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-navy-800/60"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            تحديث
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-navy-950/70 border border-navy-800/80 backdrop-blur-md no-print">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`rounded-xl px-4 py-2 text-sm transition-colors ${
              activeTab === key
                ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/10 text-amber-300 border border-amber-500/30 shadow-lg shadow-amber-950/20 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-navy-800/50 border border-transparent font-medium'
            }`}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      <div id="reports-print-area" className="space-y-6">
        {/* Official print masthead — print only */}
        <div className="hidden print:block">
          <div className="flex items-center gap-3 border-b-2 border-zinc-900 pb-3">
            <BrandMark className="h-12 w-12" />
            <div className="flex-1">
              <p className="text-lg font-extrabold text-zinc-900">{settingsData?.business_name ?? 'BarakaMobile'}</p>
              <p className="mt-0.5 text-xs text-zinc-600">التقارير الاستراتيجية — {TAB_LABELS[activeTab]}</p>
            </div>
            <div className="text-left text-xs text-zinc-600">
              <p>
                الفترة: <span dir="ltr" className="font-mono">{profitStart ?? '—'}</span> إلى <span dir="ltr" className="font-mono">{profitEnd ?? '—'}</span>
              </p>
              <p className="mt-1">
                تاريخ الطباعة: <span dir="ltr" className="font-mono">{formatISODate(new Date())}</span>
              </p>
            </div>
          </div>
        </div>
        {activeTab === 'summary' && (
          <>
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-slate-100">رأس المال</h2>
              {capitalQ.isLoading ? (
                <Loading text="جاري تحميل رأس المال..." />
              ) : capitalQ.isError ? (
                <ErrorState
                  title="تعذر تحميل رأس المال"
                  message={capitalQ.error instanceof Error ? capitalQ.error.message : 'حدث خطأ أثناء جلب البيانات'}
                  onRetry={() => capitalQ.refetch()}
                />
              ) : capitalQ.data ? (
                <CapitalCard data={capitalQ.data} />
              ) : null}
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-slate-100">الملخص التنفيذي</h2>
              {summaryQ.isLoading ? (
                <Loading text="جاري تحميل الملخص..." />
              ) : summaryQ.isError ? (
                <ErrorState
                  title="تعذر تحميل الملخص"
                  message={summaryQ.error instanceof Error ? summaryQ.error.message : 'حدث خطأ أثناء جلب البيانات'}
                  onRetry={() => summaryQ.refetch()}
                />
              ) : summaryQ.data ? (
                <div className="avoid-break grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-navy-800 bg-navy-900/60 p-4 backdrop-blur-sm">
                    <p className="text-xs font-medium text-slate-400">إجمالي المبيعات (عدد)</p>
                    <p className="mt-1 text-lg font-bold font-mono text-slate-100">{summaryQ.data.salesCount}</p>
                  </div>
                  <div className="rounded-2xl border border-navy-800 bg-navy-900/60 p-4 backdrop-blur-sm">
                    <p className="text-xs font-medium text-slate-400">حجم المبيعات</p>
                    <p className="mt-1 text-lg font-bold font-mono text-emerald-400" dir="ltr">
                      {fmt(summaryQ.data.salesVolume)} {currencySymbol}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-navy-800 bg-navy-900/60 p-4 backdrop-blur-sm">
                    <p className="text-xs font-medium text-slate-400">ربح اليوم</p>
                    <p className="mt-1 text-lg font-bold font-mono text-emerald-400" dir="ltr">
                      {fmt(summaryQ.data.todayProfit.totalProfit)} {currencySymbol}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-navy-800 bg-navy-900/60 p-4 backdrop-blur-sm">
                    <p className="text-xs font-medium text-slate-400">ربح الشهر</p>
                    <p className="mt-1 text-lg font-bold font-mono text-emerald-400" dir="ltr">
                      {fmt(summaryQ.data.monthProfit.totalProfit)} {currencySymbol}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-navy-800 bg-navy-900/60 p-4 backdrop-blur-sm">
                    <p className="text-xs font-medium text-slate-400">إجمالي المخزون</p>
                    <p className="mt-1 text-lg font-bold font-mono text-slate-100">{summaryQ.data.inventory.totalItems} صنف</p>
                  </div>
                  <div className="rounded-2xl border border-navy-800 bg-navy-900/60 p-4 backdrop-blur-sm">
                    <p className="text-xs font-medium text-slate-400">أصناف منخفضة</p>
                    <p className="mt-1 text-lg font-bold font-mono text-amber-400">{summaryQ.data.inventory.lowStockItems}</p>
                  </div>
                </div>
              ) : null}
            </section>
          </>
        )}

        {activeTab === 'profit' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 no-print">
              <span className="text-sm font-medium text-slate-300">الفترة:</span>
              <div className="flex flex-wrap gap-1.5 rounded-2xl border border-navy-800 bg-navy-950/60 p-1.5">
                {(['today', 'week', 'month', 'custom'] as DatePreset[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPreset(p)}
                    className={`rounded-xl border px-3 py-1.5 text-sm transition-colors ${
                      preset === p
                        ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/10 text-amber-300 border-amber-500/30 font-bold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-navy-800/50 border-transparent font-medium'
                    }`}
                  >
                    {p === 'today' ? 'اليوم' : p === 'week' ? 'هذا الأسبوع' : p === 'month' ? 'هذا الشهر' : 'مخصص'}
                  </button>
                ))}
              </div>
              {preset === 'custom' && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="rounded-xl border border-navy-800 bg-navy-950/60 px-3 py-1.5 text-sm text-slate-100 focus:border-amber-500/50 focus:outline-none"
                  />
                  <span className="text-slate-500">إلى</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="rounded-xl border border-navy-800 bg-navy-950/60 px-3 py-1.5 text-sm text-slate-100 focus:border-amber-500/50 focus:outline-none"
                  />
                </div>
              )}
            </div>
            <h2 className="text-base font-semibold text-slate-100">الأرباح والخسائر</h2>
            {profitQ.isLoading ? (
              <Loading text="جاري تحميل الأرباح..." />
            ) : profitQ.isError ? (
              <ErrorState
                title="تعذر تحميل الأرباح"
                message={profitQ.error instanceof Error ? profitQ.error.message : 'حدث خطأ أثناء جلب البيانات'}
                onRetry={() => profitQ.refetch()}
              />
            ) : profitQ.data ? (
              <ProfitCard data={profitQ.data} />
            ) : null}
          </section>
        )}

        {activeTab === 'debts' && (
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-slate-100">ملخص الديون</h2>
            {debtQ.isLoading ? (
              <Loading text="جاري تحميل ملخص الديون..." />
            ) : debtQ.isError ? (
              <ErrorState
                title="تعذر تحميل ملخص الديون"
                message={debtQ.error instanceof Error ? debtQ.error.message : 'حدث خطأ أثناء جلب البيانات'}
                onRetry={() => debtQ.refetch()}
              />
            ) : debtQ.data ? (
              <DebtSummaryTable data={debtQ.data} onViewLedger={handleViewLedger} />
            ) : null}
          </section>
        )}

        {activeTab === 'treasury' && (
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-slate-100">الخزينة والمصاريف — ملخص</h2>
            {capitalQ.data && (
              <div className="avoid-break rounded-2xl border border-navy-800 bg-navy-900/60 p-5 backdrop-blur-sm">
                <p className="text-sm text-slate-400">السيولة في الصندوق</p>
                <p className="mt-1 text-2xl font-bold font-mono text-slate-100" dir="ltr">
                  {fmt(capitalQ.data.cashInHand)} {currencySymbol}
                </p>
                <p className="mt-1 text-xs text-slate-500">مضمنة في حساب رأس المال: inventory + receivables + cash − payables</p>
              </div>
            )}
            {profitQ.data && (
              <div className="avoid-break grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-navy-800 bg-navy-900/60 p-5 backdrop-blur-sm">
                  <p className="text-xs text-slate-400">إجمالي المصاريف (للفترة)</p>
                  <p className="mt-1 text-lg font-bold font-mono text-amber-400" dir="ltr">
                    {fmt(profitQ.data.totalExpenses)} {currencySymbol}
                  </p>
                </div>
                <div className="rounded-2xl border-2 border-navy-700/80 bg-navy-900/90 p-5 shadow-xl shadow-navy-950/50 backdrop-blur-sm">
                  <p className="text-xs font-bold text-slate-100">صافي الربح بعد المصاريف</p>
                  <p className="mt-1 text-xl font-extrabold font-mono text-emerald-400" dir="ltr">
                    {fmt(profitQ.data.netProfitAfterExpenses)} {currencySymbol}
                  </p>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 no-print">
              <Link to="/admin/finance" className="rounded-xl bg-gradient-to-r from-amber-500/20 to-amber-600/10 border border-amber-500/30 px-4 py-2 text-sm font-bold text-amber-300 hover:from-amber-500/30 hover:to-amber-600/20">
                فتح المالية (الصندوق والمصاريف)
              </Link>
            </div>
          </section>
        )}
      </div>

      <ContactLedgerModal
        open={!!ledgerState}
        onClose={() => setLedgerState(null)}
        accountId={ledgerState?.accountId ?? null}
        contactName={ledgerState?.contactName ?? null}
        role={ledgerState?.role ?? null}
      />
    </div>
  );
}
