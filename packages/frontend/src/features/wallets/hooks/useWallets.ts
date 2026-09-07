import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type WalletSummary = {
  id: string;
  name: string;
  type: string;
  currency: string;
  defaultSupplierId: string | null;
  lowBalanceThreshold: string;
  isActive: boolean;
  currentBalance: string;
  isLowBalance: boolean;
  services?: Array<{ id: string; name: string; isActive: boolean }>;
};

export type TopupPayload = {
  walletId: string;
  supplierId?: string;
  topupAmount: string;
  paidAmount: string;
  paymentMethod?: 'CASH' | 'BANK_TRANSFER';
  notes?: string;
};

export type TopupResult = {
  success: boolean;
  transactionId: string;
  ledgerEntryId: string;
  newWalletBalance: string;
  topupAmount: string;
  paidAmount: string;
  debtAmount: string;
  status: 'COMPLETED' | 'PARTIALLY_PAID';
};

export function useWalletsQuery(enabled = true) {
  return useQuery<WalletSummary[]>({
    queryKey: ['wallets'],
    queryFn: () => api.get<WalletSummary[]>('/wallets'),
    enabled,
  });
}

export function useTopupMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TopupPayload) => {
      const { walletId, ...body } = payload;
      return api.post<TopupResult>(`/wallets/${walletId}/topup`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallets'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}
