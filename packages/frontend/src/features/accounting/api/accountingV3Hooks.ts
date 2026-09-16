import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accountingV3Api } from '@/api/v3/accounting';
import type { BalanceSheetQuery, IncomeStatementQuery, TrialBalanceQuery } from '@/api/v3/accounting';

/**
 * DIRECTIVE-023 Stage 10.4 — v3 accounting react-query bindings.
 *
 * Reporting reads (COA matrix, trial balance, P&L, balance sheet) plus
 * the guarded period-close mutation. Closing invalidates every report —
 * nominals sweep to 30100, so all cached statements go stale at once.
 */
export function useV3CoaQuery() {
  return useQuery({
    queryKey: ['v3-coa'],
    queryFn: () => accountingV3Api.getChartOfAccounts(),
  });
}

export function useV3TrialBalanceQuery(query: TrialBalanceQuery = {}) {
  return useQuery({
    queryKey: ['v3-trial-balance', query.asOfDate ?? null, query.periodId ?? null],
    queryFn: () => accountingV3Api.getTrialBalance(query),
  });
}

export function useV3IncomeStatementQuery(query: IncomeStatementQuery) {
  return useQuery({
    queryKey: ['v3-income-statement', query.periodId ?? null, query.startDate ?? null, query.endDate ?? null],
    queryFn: () => accountingV3Api.getIncomeStatement(query),
  });
}

export function useV3BalanceSheetQuery(query: BalanceSheetQuery = {}) {
  return useQuery({
    queryKey: ['v3-balance-sheet', query.asOfDate ?? null, query.periodId ?? null],
    queryFn: () => accountingV3Api.getBalanceSheet(query),
  });
}

export function useV3PeriodClosing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (periodId: string) => accountingV3Api.closeFiscalPeriod(periodId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['v3-coa'] });
      void qc.invalidateQueries({ queryKey: ['v3-trial-balance'] });
      void qc.invalidateQueries({ queryKey: ['v3-income-statement'] });
      void qc.invalidateQueries({ queryKey: ['v3-balance-sheet'] });
    },
  });
}
