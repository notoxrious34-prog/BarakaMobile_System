import { api } from '@/lib/api';

export type OpeningDirection = 'DEBIT' | 'CREDIT';

export type OpeningBalancePayload = {
  amount: string;
  direction: OpeningDirection;
  date?: string;
  notes?: string;
};

export type CounterpartyResult = {
  id: string;
  name: string;
  accounts: { id: string; role: string; currentBalance: string; openingBalance: string }[];
  opening: {
    id: string;
    type: string;
    amount: string;
    balanceBefore: string;
    balanceAfter: string;
    notes: string | null;
    createdAt: string;
  } | null;
};

export async function createCustomer(payload: {
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  openingBalance?: OpeningBalancePayload;
}): Promise<CounterpartyResult> {
  return api.post<CounterpartyResult>('/customers', payload);
}

export async function createSupplier(payload: {
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  openingBalance?: OpeningBalancePayload;
}): Promise<CounterpartyResult> {
  return api.post<CounterpartyResult>('/suppliers', payload);
}

export async function postCustomerOpeningBalance(
  contactId: string,
  payload: OpeningBalancePayload,
): Promise<unknown> {
  return api.post(`/customers/${contactId}/opening-balance`, payload);
}

export async function postSupplierOpeningBalance(
  contactId: string,
  payload: OpeningBalancePayload,
): Promise<unknown> {
  return api.post(`/suppliers/${contactId}/opening-balance`, payload);
}
