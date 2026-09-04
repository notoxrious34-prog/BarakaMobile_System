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
};

export type ExpenseItem = {
  id: string;
  categoryId: string;
  category?: { id: string; name: string };
  amount: string;
  date: string;
  description: string | null;
  createdAt: string;
};

export type ExpenseBreakdownItem = {
  categoryId: string;
  categoryName: string;
  totalAmount: string;
  count: number;
};

export type OwnerMovementMode = 'deposit' | 'draw';
