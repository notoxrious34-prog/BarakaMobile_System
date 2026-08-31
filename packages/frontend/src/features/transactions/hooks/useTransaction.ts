import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type TransactionDetail = {
  id: string;
  type: string;
  amount: string;
  note: string | null;
  reference: string | null;
  invoiceNumber: string | null;
  createdAt: string;
  account: {
    id: string;
    role: string;
    contact: {
      id: string;
      name: string;
      phone: string | null;
      address: string | null;
    };
  };
  itemLines: Array<{
    id: string;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
    item: {
      id: string;
      name: string;
      sku: string | null;
    };
  }>;
  serviceLines: Array<{
    id: string;
    amount: string;
    profit: string;
    service: {
      id: string;
      name: string;
      pricingType: string;
    };
  }>;
};

export function useTransaction(id: string | null) {
  return useQuery<TransactionDetail>({
    queryKey: ['transactions', id],
    queryFn: () => api.get<TransactionDetail>(`/transactions/${id}`),
    enabled: id !== null,
    staleTime: 60000,
  });
}
