/**
 * TB-079 — Treasury & Cash domain types (Pillar 5, Phase 1).
 * All monetary fields are strings (Rule ③). No backend coupling.
 */

export type CashBalanceResponse = {
  currentBalance: string;
};

export type CashMovementType = 'IN' | 'OUT';

export type CashMovement = {
  id: string;
  type: CashMovementType;
  category: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  note: string | null;
  createdAt: string;
};

export type DailyClosingBreakdownItem = {
  category: string;
  inAmount: string;
  outAmount: string;
};

export type DailyClosingResponse = {
  openingBalance: string;
  totalIn: string;
  totalOut: string;
  closingBalance: string;
  breakdown: DailyClosingBreakdownItem[];
};

export type ExpenseCategory = {
  id: string;
  name: string;
  description?: string | null;
  isSystem?: boolean;
  isActive?: boolean;
};

export type ExpensePaymentSource = 'REGISTER_CASH' | 'SAFE_VAULT' | 'EXTERNAL_ACCOUNT';

export type ExpenseItem = {
  id: string;
  expenseNumber?: string | null;
  categoryId: string;
  category?: { id: string; name: string };
  amount: string;
  paymentSource?: ExpensePaymentSource;
  recipientName?: string | null;
  invoiceReference?: string | null;
  cashMovementId?: string | null;
  date: string;
  /** Backend field name (Prisma `expense.expenseDate`) — preferred when present. */
  expenseDate?: string;
  description: string | null;
  createdAt: string;
};

export type ExpenseMetrics = {
  today: string;
  month: string;
  topCategory: { id: string; name: string; total: string } | null;
};

export type ExpenseBreakdownItem = {
  categoryId: string;
  categoryName: string;
  totalAmount: string;
  count: number;
  /** Server-computed share (2dp) — client recomputes per AD-73 regardless. */
  percentage?: string;
};

export type OwnerMovementMode = 'deposit' | 'draw';
