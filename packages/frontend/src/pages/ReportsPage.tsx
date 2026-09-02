import { useState, useEffect } from 'react';
import { RefreshCw, Printer, FileDown } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
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

  useEffect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-reports-print', 'true');
    style.textContent = `
      @media print {
        body * { visibility: hidden; }
        #reports-print-area, #reports-print-area * { visibility: visible; }
        #reports-print-area { position: absolute; left: 0; top: 0; width: 100%; }
        .no-print { display: none !important; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

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
    <div dir="rtl" className="min-h-screen bg-slate-950 p-4 font-sans space-y-4">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-xl font-bold text-slate-100">التقارير</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportPDF}
            className="inline-flex items-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500"
          >
            <FileDown className="h-4 w-4" aria-hidden="true" />
            تصدير PDF
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            طباعة
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            تحديث
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-800 no-print">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === key
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      <div id="reports-print-area" className="space-y-6">
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
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                    <p className="text-xs font-medium text-slate-400">إجمالي المبيعات (عدد)</p>
                    <p className="mt-1 text-lg font-bold font-mono text-slate-100">{summaryQ.data.salesCount}</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                    <p className="text-xs font-medium text-slate-400">حجم المبيعات</p>
                    <p className="mt-1 text-lg font-bold font-mono text-emerald-400" dir="ltr">
                      {Number(summaryQ.data.salesVolume).toFixed(2)} {currencySymbol}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                    <p className="text-xs font-medium text-slate-400">ربح اليوم</p>
                    <p className="mt-1 text-lg font-bold font-mono text-emerald-400" dir="ltr">
                      {Number(summaryQ.data.todayProfit.totalProfit).toFixed(2)} {currencySymbol}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                    <p className="text-xs font-medium text-slate-400">ربح الشهر</p>
                    <p className="mt-1 text-lg font-bold font-mono text-emerald-400" dir="ltr">
                      {Number(summaryQ.data.monthProfit.totalProfit).toFixed(2)} {currencySymbol}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                    <p className="text-xs font-medium text-slate-400">إجمالي المخزون</p>
                    <p className="mt-1 text-lg font-bold font-mono text-slate-100">{summaryQ.data.inventory.totalItems} صنف</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
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
              <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
                {(['today', 'week', 'month', 'custom'] as DatePreset[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPreset(p)}
                    className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                      preset === p ? 'bg-slate-800 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
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
                    className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1 text-sm text-slate-100 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600"
                  />
                  <span className="text-slate-500">إلى</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1 text-sm text-slate-100 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600"
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
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-sm text-slate-400">السيولة في الصندوق</p>
                <p className="mt-1 text-2xl font-bold font-mono text-slate-100" dir="ltr">
                  {Number(capitalQ.data.cashInHand ?? '0.00').toFixed(2)} {currencySymbol}
                </p>
                <p className="mt-1 text-xs text-slate-500">مضمنة في حساب رأس المال: inventory + receivables + cash − payables</p>
              </div>
            )}
            {profitQ.data && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <p className="text-xs text-slate-400">إجمالي المصاريف (للفترة)</p>
                  <p className="mt-1 text-lg font-bold font-mono text-amber-400" dir="ltr">
                    {Number(profitQ.data.totalExpenses ?? '0.00').toFixed(2)} {currencySymbol}
                  </p>
                </div>
                <div className="rounded-xl border-2 border-slate-700 bg-slate-900 p-4">
                  <p className="text-xs font-bold text-slate-100">صافي الربح بعد المصاريف</p>
                  <p className="mt-1 text-xl font-extrabold font-mono text-emerald-400" dir="ltr">
                    {Number(profitQ.data.netProfitAfterExpenses ?? '0.00').toFixed(2)} {currencySymbol}
                  </p>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Link to="/treasury" className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500">
                فتح الخزينة
              </Link>
              <Link
                to="/expenses"
                className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
              >
                فتح المصاريف
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
