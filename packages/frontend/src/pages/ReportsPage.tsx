import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Loading } from '@/components/feedback/Loading';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useCapitalQuery, useProfitQuery, useDebtSummaryQuery } from '@/features/reports/hooks/useReports';
import { CapitalCard } from '@/features/reports/components/CapitalCard';
import { ProfitCard } from '@/features/reports/components/ProfitCard';
import { DebtSummaryTable } from '@/features/reports/components/DebtSummaryTable';
import { ContactLedgerModal } from '@/features/reports/components/ContactLedgerModal';

export function ReportsPage() {
  const queryClient = useQueryClient();
  const capitalQ = useCapitalQuery();
  const profitQ = useProfitQuery();
  const debtQ = useDebtSummaryQuery();

  const [ledgerState, setLedgerState] = useState<{
    accountId: string;
    contactName: string;
    role: string;
  } | null>(null);

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ['capital'] });
    queryClient.invalidateQueries({ queryKey: ['profit'] });
    queryClient.invalidateQueries({ queryKey: ['debt-summary'] });
    // also invalidate any ledger caches
    queryClient.invalidateQueries({ queryKey: ['ledger'] });
  }

  function handleViewLedger(accountId: string, contactName: string, role: string) {
    setLedgerState({ accountId, contactName, role });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-900">التقارير</h1>
        <button
          type="button"
          onClick={handleRefresh}
          className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          تحديث
        </button>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">رأس المال</h2>
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
        <h2 className="text-base font-semibold text-zinc-900">الأرباح</h2>
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

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">ملخص الديون</h2>
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
