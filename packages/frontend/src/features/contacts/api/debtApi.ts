import { api } from '@/lib/api';

export type DebtInfo = { contactId: string; balance: string; creditLimit: string; accountId: string | null };
export type DebtLedgerEntry = {
  id: string;
  customerId: string;
  type: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  relatedTransactionId: string | null;
  relatedRepairTicketId: string | null;
  notes: string | null;
  createdAt: string;
};
export type DebtLedgerResponse = { contactId: string; currentBalance: string; entries: DebtLedgerEntry[] };

export async function fetchDebt(contactId: string): Promise<DebtInfo> {
  return api.get<DebtInfo>(`/customers/${contactId}/debt`);
}
export async function fetchDebtLedger(contactId: string): Promise<DebtLedgerResponse> {
  return api.get<DebtLedgerResponse>(`/customers/${contactId}/debt-ledger`);
}
export async function postDebtSettlement(contactId: string, payload: { amount: string; notes?: string }): Promise<any> {
  return api.post<any>(`/customers/${contactId}/debt-settlement`, payload);
}

export type SupplierPayable = { contactId: string; balance: string; accountId: string | null };
export type SupplierLedgerEntry = {
  id: string;
  contactId: string;
  type: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  relatedTransactionId: string | null;
  notes: string | null;
  createdAt: string;
};
export type SupplierLedgerResponse = { contactId: string; currentBalance: string; entries: SupplierLedgerEntry[] };

export async function fetchPayable(contactId: string): Promise<SupplierPayable> {
  return api.get<SupplierPayable>(`/customers/${contactId}/payable`);
}
export async function fetchSupplierLedger(contactId: string): Promise<SupplierLedgerResponse> {
  return api.get<SupplierLedgerResponse>(`/customers/${contactId}/supplier-ledger`);
}
export async function postSupplierSettlement(contactId: string, payload: { amount: string; notes?: string }): Promise<any> {
  return api.post<any>(`/customers/${contactId}/supplier-settlement`, payload);
}
