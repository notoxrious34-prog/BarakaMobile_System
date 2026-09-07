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

export type WalletServiceFull = {
  id: string;
  name: string;
  networkBrandColor: string | null;
  commissionRate: string;
  pricingMode: string;
  isActive: boolean;
};

export type WalletDetails = Omit<WalletSummary, 'services'> & {
  services: WalletServiceFull[];
};

export type LedgerEntry = {
  id: string;
  entryType: 'TOPUP' | 'SALE_DEDUCTION' | 'ADJUSTMENT' | 'REVERSAL';
  amount: string;
  balanceAfter: string;
  notes: string | null;
  nominalAmount: string | null;
  commissionProfit: string | null;
  beneficiaryPhone: string | null;
  createdAt: string;
  walletService: { id: string; name: string; networkBrandColor: string | null } | null;
};

export type FlexySalePayload = {
  walletId: string;
  walletServiceId: string;
  nominalAmount: string;
  beneficiaryPhone?: string;
  notes?: string;
};

export type FlexySaleResult = {
  success: boolean;
  entryId: string;
  nominalAmount: string;
  walletDeductionAmount: string;
  commissionProfit: string;
  newWalletBalance: string;
  serviceId: string | null;
  beneficiaryPhone: string | null;
};

function toQuery(params: Record<string, string | number | undefined>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

export function useWalletDetailsQuery(walletId: string | null, enabled = true) {
  return useQuery<WalletDetails>({
    queryKey: ['wallets', walletId],
    queryFn: () => api.get<WalletDetails>(`/wallets/${walletId}`),
    enabled: enabled && !!walletId,
  });
}

export function useWalletLedgerQuery(
  walletId: string | null,
  params?: { entryType?: string; startDate?: string; endDate?: string; serviceId?: string; search?: string; limit?: number; skip?: number },
  enabled = true,
) {
  const qs = toQuery({
    entryType: params?.entryType,
    startDate: params?.startDate,
    endDate: params?.endDate,
    serviceId: params?.serviceId,
    search: params?.search,
    limit: params?.limit ?? 100,
    skip: params?.skip,
  });
  return useQuery<{ entries: LedgerEntry[]; total: number; page: number; pages: number }>({
    queryKey: ['wallet-ledger', walletId, params?.entryType, params?.startDate, params?.endDate, params?.serviceId, params?.search, params?.skip],
    queryFn: () => api.get(`/wallets/${walletId}/ledger${qs}`),
    enabled: enabled && !!walletId,
  });
}

export function useFlexySaleMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: FlexySalePayload) => {
      const { walletId, ...body } = payload;
      return api.post<FlexySaleResult>(`/wallets/${walletId}/sale`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallets'] });
      qc.invalidateQueries({ queryKey: ['wallet-ledger'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export type PatchServicePayload = {
  walletId: string;
  serviceId: string;
  name?: string;
  commissionRate?: string | number;
  color?: string;
  networkBrandColor?: string;
  isActive?: boolean;
};

export type AdjustBalancePayload = {
  walletId: string;
  amount: string;
  reason: string;
  notes?: string;
};

function invalidateWalletScope(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['wallets'] });
  qc.invalidateQueries({ queryKey: ['wallet-ledger'] });
  qc.invalidateQueries({ queryKey: ['cash'] });
  qc.invalidateQueries({ queryKey: ['transactions'] });
  qc.invalidateQueries({ queryKey: ['contacts'] });
  qc.invalidateQueries({ queryKey: ['accounts'] });
}

export function usePatchServiceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: PatchServicePayload) => {
      const { walletId, serviceId, ...body } = p;
      return api.patch(`/wallets/${walletId}/services/${serviceId}`, body);
    },
    onSuccess: () => invalidateWalletScope(qc),
  });
}

export function useAddServiceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { walletId: string; name: string; commissionRate: string; networkBrandColor?: string }) => {
      const { walletId, ...body } = p;
      return api.post(`/wallets/${walletId}/services`, body);
    },
    onSuccess: () => invalidateWalletScope(qc),
  });
}

export function usePatchWalletMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { walletId: string; name?: string; lowBalanceThreshold?: string; isActive?: boolean; defaultSupplierId?: string }) => {
      const { walletId, ...body } = p;
      return api.patch(`/wallets/${walletId}`, body);
    },
    onSuccess: () => invalidateWalletScope(qc),
  });
}

export function useAdjustBalanceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: AdjustBalancePayload) => {
      const { walletId, ...body } = p;
      return api.post<{ entry: LedgerEntry; newBalance: string }>(`/wallets/${walletId}/adjustment`, body);
    },
    onSuccess: () => invalidateWalletScope(qc),
  });
}

export type WalletStats = {
  date: string;
  sales: { count: number; nominalVolume: string; commissionProfit: string };
  liquidity: { total: string; wallets: Array<{ id: string; name: string; balance: string }> };
  flexyCashInflow: string;
};

export function useWalletStatsQuery(date?: string, enabled = true) {
  return useQuery<WalletStats>({
    queryKey: ['wallet-stats', date ?? 'today'],
    queryFn: () => api.get<WalletStats>(`/wallets/stats/summary${date ? `?date=${encodeURIComponent(date)}` : ''}`),
    enabled,
    staleTime: 30000,
  });
}
