/**
 * DIRECTIVE-020 Stage 10.1 — v3 accounting domain SDK.
 */
import { v3Api, type MutatingRequestOptions, type V3Client } from './client';
import type {
  BalanceSheetReport,
  ChartOfAccountsItem,
  ClosePeriodResult,
  IncomeStatementReport,
  TrialBalanceReport,
} from './types';

export interface IncomeStatementQuery {
  periodId?: string;
  startDate?: string;
  endDate?: string;
}

export interface BalanceSheetQuery {
  asOfDate?: string;
  periodId?: string;
}

export interface TrialBalanceQuery {
  asOfDate?: string;
  periodId?: string;
}

export function createAccountingV3Api(client: V3Client = v3Api) {
  return {
    getChartOfAccounts(): Promise<ChartOfAccountsItem[]> {
      return client.get<ChartOfAccountsItem[]>('/v3/accounting/chart-of-accounts');
    },
    getTrialBalance(query: TrialBalanceQuery = {}): Promise<TrialBalanceReport> {
      return client.get<TrialBalanceReport>('/v3/accounting/trial-balance', {
        asOfDate: query.asOfDate,
        periodId: query.periodId,
      });
    },
    getIncomeStatement(query: IncomeStatementQuery): Promise<IncomeStatementReport> {
      return client.get<IncomeStatementReport>('/v3/accounting/income-statement', {
        periodId: query.periodId,
        startDate: query.startDate,
        endDate: query.endDate,
      });
    },
    getBalanceSheet(query: BalanceSheetQuery = {}): Promise<BalanceSheetReport> {
      return client.get<BalanceSheetReport>('/v3/accounting/balance-sheet', {
        asOfDate: query.asOfDate,
        periodId: query.periodId,
      });
    },
    closeFiscalPeriod(periodId: string, opts?: MutatingRequestOptions): Promise<ClosePeriodResult> {
      return client.post<ClosePeriodResult>('/v3/accounting/fiscal-periods/close', { periodId }, opts);
    },
  };
}

export const accountingV3Api = createAccountingV3Api();
