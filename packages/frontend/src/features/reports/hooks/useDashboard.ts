import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type DashboardSummary = {
  capital: {
    totalCapital: string;
    cashAndReceivables: string;
    stockValue: string;
  };
  todayProfit: {
    totalProfit: string;
    serviceProfit: string;
    itemProfit: string;
  };
  monthProfit: {
    totalProfit: string;
    serviceProfit: string;
    itemProfit: string;
  };
  debts: {
    totalCustomerDebt: string;
    totalSupplierDebt: string;
    netPosition: string;
  };
  inventory: {
    totalItems: number;
    lowStockItems: number;
    outOfStockItems: number;
  };
  recentTransactions: Array<{
    id: string;
    type: string;
    totalAmount: string;
    contactName: string;
    createdAt: string;
  }>;
};

export function useDashboard() {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api.get<DashboardSummary>('/reports/summary'),
    staleTime: 30000,
    refetchInterval: 60000,
  });
}
