import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type CapitalResponse = {
  totalReceivables: string;
  totalPayables: string;
  inventoryValue: string;
  netCapital: string;
};

export type ProfitResponse = {
  totalRevenue: string;
  totalCost: string;
  serviceProfit: string;
  itemProfit: string;
  grossProfit: string;
  netProfit: string;
};

export type ContactPosition = {
  contactId: string;
  contactName: string;
  contactRole: string;
  netPosition: string;
  supplierAccount?: { accountId: string; currentBalance: string };
  customerAccount?: { accountId: string; currentBalance: string };
};

export type DebtSummaryResponse = {
  totalReceivables: string;
  totalPayables: string;
  netDebtPosition: string;
  contacts: ContactPosition[];
};

export type LedgerEntry = {
  id: string;
  transactionId: string;
  entryType: 'DEBIT' | 'CREDIT';
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  createdAt: string;
};

export function useCapitalQuery() {
  return useQuery<CapitalResponse>({
    queryKey: ['capital'],
    queryFn: () => api.get<CapitalResponse>('/reports/capital'),
  });
}

export function useProfitQuery() {
  return useQuery<ProfitResponse>({
    queryKey: ['profit'],
    queryFn: () => api.get<ProfitResponse>('/reports/profit'),
  });
}

export function useDebtSummaryQuery() {
  return useQuery<DebtSummaryResponse>({
    queryKey: ['debt-summary'],
    queryFn: () => api.get<DebtSummaryResponse>('/reports/debt-summary'),
  });
}

export function useLedgerQuery(accountId: string) {
  return useQuery<LedgerEntry[]>({
    queryKey: ['ledger', accountId],
    queryFn: () => api.get<LedgerEntry[]>(`/reports/accounts/${accountId}/ledger`),
    enabled: !!accountId && accountId.length > 0,
  });
}
