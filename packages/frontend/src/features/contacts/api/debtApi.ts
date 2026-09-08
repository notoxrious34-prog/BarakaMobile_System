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
