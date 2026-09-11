import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type TransactionType = 'SALE' | 'PURCHASE' | 'PAYMENT_IN' | 'PAYMENT_OUT' | 'OFFSET';

export type AccountInfo = {
  id: string;
  contactId: string;
  role: 'SUPPLIER' | 'CUSTOMER';
  currentBalance: string;
  openingBalance: string;
};

export type TransactionItemLine = {
  id: string;
  itemId: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  item?: { id: string; name: string };
};

export type TransactionServiceLine = {
  id: string;
  serviceId: string;
  amount: string;
  profit: string;
  service?: { id: string; name: string };
};

export type Transaction = {
  id: string;
  type: TransactionType;
  accountId: string;
  amount: string;
  note: string | null;
  reference?: string | null;
  invoiceNumber?: string | null;
  isActive?: boolean;
  createdAt: string;
  updatedAt?: string;
  account?: AccountInfo & { contact?: { id: string; name: string } };
  // alias for brief compatibility
  contactId?: string;
  contact?: { id: string; name: string };
  items?: TransactionItemLine[];
  services?: TransactionServiceLine[];
  itemLines?: TransactionItemLine[];
  serviceLines?: TransactionServiceLine[];
  ledgerEntries?: unknown[];
};

// Backend payloads
export type CreateSalePayload = {
  contactId: string;
  note?: string;
  items?: Array<{ itemId: string; quantity: number }>;
  services?: Array<{ serviceId: string; amount: string }>;
  // backend-adapted fields (filled by form)
  accountId?: string;
  amount?: string;
  itemLines?: Array<{ itemId: string; quantity: number; unitPrice: string }>;
  serviceLines?: Array<{ serviceId: string; amount: string }>;
};

export type CreatePurchasePayload = {
  contactId: string;
  note?: string;
  items: Array<{ itemId: string; quantity: number; costPrice: string }>;
  accountId?: string;
  amount?: string;
  itemLines?: Array<{ itemId: string; quantity: number; unitPrice: string }>;
};

export type CreatePaymentPayload = {
  contactId: string;
  type: 'PAYMENT_IN' | 'PAYMENT_OUT';
  amount: string;
  note?: string;
  accountId?: string;
};

export type CreateOffsetPayload = {
  contactId: string;
  amount?: string;
  note?: string;
};

export function useTransactionsQuery() {
  return useQuery<Transaction[]>({
    queryKey: ['transactions'],
    queryFn: () => api.get<Transaction[]>('/transactions'),
  });
}

export function useTransactionDetailQuery(id: string) {
  return useQuery<Transaction>({
    queryKey: ['transaction', id],
    queryFn: () => api.get<Transaction>(`/transactions/${id}`),
    enabled: !!id && id.length > 0,
  });
}

export function useAccountsByContactQuery(contactId: string) {
  return useQuery<AccountInfo[]>({
    queryKey: ['accounts', 'contact', contactId],
    queryFn: () => api.get<AccountInfo[]>(`/accounts/contact/${contactId}`),
    enabled: !!contactId,
  });
}

// Helpers to resolve accountId and compute amount are in forms, but mutations handle payment routing
export function useCreateSaleMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<CreateSalePayload, 'contactId'> & { accountId: string; amount: string; amountPaidNow?: string; creditAmount?: string; customerId?: string; itemLines?: any[]; serviceLines?: any[] }) => {
      const body: Record<string, unknown> = {
        accountId: payload.accountId,
        amount: payload.amount,
        type: 'SALE',
        note: payload.note,
      };
      if (payload.amountPaidNow !== undefined) body.amountPaidNow = payload.amountPaidNow;
      if (payload.creditAmount !== undefined) body.creditAmount = payload.creditAmount;
      if (payload.customerId !== undefined) body.customerId = payload.customerId;
      if (payload.itemLines && payload.itemLines.length > 0) body.itemLines = payload.itemLines;
      if (payload.serviceLines && payload.serviceLines.length > 0) body.serviceLines = payload.serviceLines;
      return api.post<Transaction>('/transactions/sale', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      // DIRECTIVE-004: sales move dashboard KPIs + cash pill.
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['cash-balance'] });
    },
  });
}

export function useCreatePurchaseMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreatePurchasePayload & { accountId: string; amount: string; itemLines: any[] }) => {
      const body: Record<string, unknown> = {
        accountId: payload.accountId,
        amount: payload.amount,
        type: 'PURCHASE',
        note: payload.note,
        itemLines: payload.itemLines,
      };
      return api.post<Transaction>('/transactions/purchase', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      // DIRECTIVE-004: purchases move dashboard KPIs + cash pill.
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['cash-balance'] });
    },
  });
}

export function useCreatePaymentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreatePaymentPayload & { accountId: string }) => {
      const body = {
        accountId: payload.accountId,
        amount: payload.amount,
        note: payload.note,
      };
      const endpoint = payload.type === 'PAYMENT_IN' ? '/transactions/payment-in' : '/transactions/payment-out';
      return api.post<Transaction>(endpoint, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      // DIRECTIVE-004: payments move dashboard KPIs + cash pill.
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['cash-balance'] });
    },
  });
}

export function useCreateOffsetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateOffsetPayload) => {
      const body: Record<string, unknown> = {
        contactId: payload.contactId,
        note: payload.note,
      };
      // amount is not sent to backend (computed server-side), but keep for validation
      return api.post<Transaction>('/transactions/offset', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      // DIRECTIVE-004: offsets move dashboard KPIs + cash pill.
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['cash-balance'] });
    },
  });
}
