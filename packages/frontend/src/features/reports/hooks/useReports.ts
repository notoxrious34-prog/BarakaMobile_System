import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type CapitalResponse = {
  totalReceivables: string;
  totalPayables: string;
  inventoryValue: string;
  cashInHand: string;
  netCapital: string;
};

export type ProfitResponse = {
  totalRevenue: string;
  totalCost: string;
  serviceProfit: string;
  itemProfit: string;
  repairProfit?: string;
  totalRepairRevenue?: string;
  grossProfit: string;
  netProfit: string;
  totalExpenses: string;
  netProfitAfterExpenses: string;
  grossMarginPct: string;
};

export type ContactPosition = {
  contactId: string;
  contactName: string;
  contactRole: string;
  netPosition: string;
  supplierAccount?: { accountId: string; currentBalance: string };
  customerAccount?: { accountId: string; currentBalance: string };
};

export type TopContact = {
  contactId: string;
  contactName: string;
  currentBalance: string;
};

export type DebtSummaryResponse = {
  totalReceivables: string;
  totalPayables: string;
  netDebtPosition: string;
  contacts: ContactPosition[];
  topDebtors: TopContact[];
  topCreditors: TopContact[];
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

export type SummaryResponse = {
  capital: { totalCapital: string; cashAndReceivables: string; stockValue: string };
  todayProfit: { totalProfit: string; serviceProfit: string; itemProfit: string };
  monthProfit: { totalProfit: string; serviceProfit: string; itemProfit: string };
  debts: { totalCustomerDebt: string; totalSupplierDebt: string; netPosition: string };
  inventory: { totalItems: number; lowStockItems: number; outOfStockItems: number };
  salesCount: number;
  salesVolume: string;
  repairStats?: { openTickets: number; deliveredToday: number };
  repairProfit?: string;
  totalExpenses?: string;
  cashBalance?: string;
  recentTransactions: Array<{ id: string; type: string; totalAmount: string; contactName: string; createdAt: string }>;
};

export function useCapitalQuery() {
  return useQuery<CapitalResponse>({
    queryKey: ['capital'],
    queryFn: () => api.get<CapitalResponse>('/reports/capital'),
  });
}

export function useProfitQuery(startDate?: string, endDate?: string) {
  return useQuery<ProfitResponse>({
    queryKey: ['profit', startDate ?? null, endDate ?? null],
    queryFn: () => {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const qs = params.toString();
      return api.get<ProfitResponse>(`/reports/profit${qs ? `?${qs}` : ''}`);
    },
  });
}

export function useDebtSummaryQuery() {
  return useQuery<DebtSummaryResponse>({
    queryKey: ['debt-summary'],
    queryFn: () => api.get<DebtSummaryResponse>('/reports/debt-summary'),
  });
}

export function useSummaryQuery(startDate?: string, endDate?: string) {
  return useQuery<SummaryResponse>({
    queryKey: ['summary', startDate ?? null, endDate ?? null],
    queryFn: () => {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const qs = params.toString();
      return api.get<SummaryResponse>(`/reports/summary${qs ? `?${qs}` : ''}`);
    },
  });
}

export function useLedgerQuery(accountId: string) {
  return useQuery<LedgerEntry[]>({
    queryKey: ['ledger', accountId],
    queryFn: () => api.get<LedgerEntry[]>(`/reports/accounts/${accountId}/ledger`),
    enabled: !!accountId && accountId.length > 0,
  });
}


