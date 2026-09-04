import { api } from '@/lib/api';
import type {
  CashBalanceResponse,
  CashMovement,
  DailyClosingResponse,
  ExpenseBreakdownItem,
  ExpenseCategory,
  ExpenseItem,
} from '../types';

/**
 * TB-079 — Treasury & Cash typed API service (Pillar 5, Phase 1).
 * Uses the shared `api` client (ground truth in lib/api.ts).
 * Amounts travel as 2dp strings (Rule ③). Backend untouched (AD-58).
 */

export type CashMovementParams = {
  startDate?: string;
  endDate?: string;
  category?: string;
};

export type ExpenseQueryParams = {
  startDate?: string;
  endDate?: string;
  categoryId?: string;
};

function toQuery(params: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) p.set(k, v);
  }
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchCashBalance(): Promise<CashBalanceResponse> {
  return api.get<CashBalanceResponse>('/cash/balance');
}

export async function fetchCashMovements(params?: CashMovementParams): Promise<CashMovement[]> {
  return api.get<CashMovement[]>(
    `/cash/movements${toQuery({ startDate: params?.startDate, endDate: params?.endDate, category: params?.category })}`,
  );
}

export async function postOwnerDeposit(data: { amount: string; note?: string }): Promise<unknown> {
  return api.post<unknown>('/cash/owner-deposit', data);
}

export async function postOwnerDraw(data: { amount: string; note?: string }): Promise<unknown> {
  return api.post<unknown>('/cash/owner-draw', data);
}

export async function fetchDailyClosing(date: string): Promise<DailyClosingResponse> {
  return api.get<DailyClosingResponse>(`/cash/daily-closing?date=${date}`);
}

export async function fetchExpenseCategories(): Promise<ExpenseCategory[]> {
  return api.get<ExpenseCategory[]>('/expenses/categories');
}

export async function fetchExpenses(params?: ExpenseQueryParams): Promise<ExpenseItem[]> {
  return api.get<ExpenseItem[]>(
    `/expenses${toQuery({ startDate: params?.startDate, endDate: params?.endDate, categoryId: params?.categoryId })}`,
  );
}

export async function fetchExpenseBreakdown(
  params?: Pick<ExpenseQueryParams, 'startDate' | 'endDate'>,
): Promise<ExpenseBreakdownItem[]> {
  return api.get<ExpenseBreakdownItem[]>(
    `/expenses/breakdown${toQuery({ startDate: params?.startDate, endDate: params?.endDate })}`,
  );
}

export async function postExpense(data: {
  categoryId: string;
  amount: string;
  /** Backend field is `expenseDate` (CreateExpenseDto) — `date` kept as alias. */
  expenseDate?: string;
  date?: string;
  description?: string;
}): Promise<unknown> {
  return api.post<unknown>('/expenses', {
    categoryId: data.categoryId,
    amount: data.amount,
    expenseDate: data.expenseDate ?? data.date,
    description: data.description,
  });
}

export async function postExpenseCategory(data: { name: string }): Promise<ExpenseCategory> {
  return api.post<ExpenseCategory>('/expenses/categories', data);
}
