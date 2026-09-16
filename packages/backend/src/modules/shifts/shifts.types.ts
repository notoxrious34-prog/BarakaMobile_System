/**
 * DIRECTIVE-015 Stage 7.1 — shift domain types (v3.0 POS registers).
 *
 * Statuses and movement types are plain strings at rest (matching the
 * Prisma String columns); these const objects are the single source of
 * truth for every legal value.
 */

export const SHIFT_STATUS = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;

export type CashShiftStatus = (typeof SHIFT_STATUS)[keyof typeof SHIFT_STATUS];

export const SHIFT_MOVEMENT_TYPE = {
  DRAWER_IN: 'DRAWER_IN',
  DRAWER_OUT: 'DRAWER_OUT',
  PETTY_CASH: 'PETTY_CASH',
} as const;

export type ShiftMovementType = (typeof SHIFT_MOVEMENT_TYPE)[keyof typeof SHIFT_MOVEMENT_TYPE];

/** Money snapshot of a shift drawer position (all values 2dp strings). */
export interface ShiftDrawerTotals {
  openingCash: string;
  totalCashIn: string;
  totalCashOut: string;
  totalSalesCash: string;
  expectedCash: string;
  actualCash: string | null;
  differenceAmount: string;
}
