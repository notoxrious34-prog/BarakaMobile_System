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
  // nested (backend also returns these grouped)
  profit?: {
    todayProfit: { totalProfit: string; serviceProfit: string; itemProfit: string };
    monthProfit: { totalProfit: string; serviceProfit: string; itemProfit: string };
  };
  sales?: { salesCount: number; salesVolume: string };
  repairStats?: { openTickets: number; deliveredToday: number };
  // flat aliases
  salesCount: number;
  salesVolume: string;
  totalSales: string;
  totalExpenses: string;
  repairProfit: string;
  cashBalance: string;
  digital?: {
    nominalToday: string;
    profitToday: string;
    countToday: number;
    liquidity: string;
  };
};

export function useDashboard() {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api.get<DashboardSummary>('/reports/summary'),
    staleTime: 30000,
    refetchInterval: 60000,
  });
}
