/**
 * DIRECTIVE-013 Stage 6.1 — repair domain types (v3.0 repair foundation).
 *
 * Statuses are plain strings at rest (matching the Prisma String columns);
 * these const objects are the single source of truth for every legal value.
 */

export const REPAIR_STATUS = {
  RECEIVED: 'RECEIVED',
  DIAGNOSING: 'DIAGNOSING',
  QUOTED: 'QUOTED',
  APPROVED: 'APPROVED',
  IN_REPAIR: 'IN_REPAIR',
  READY: 'READY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const;

export type RepairOrderStatus = (typeof REPAIR_STATUS)[keyof typeof REPAIR_STATUS];

export const REPAIR_PART_STATUS = {
  CONSUMED: 'CONSUMED',
  RETURNED: 'RETURNED',
} as const;

export type RepairPartStatus = (typeof REPAIR_PART_STATUS)[keyof typeof REPAIR_PART_STATUS];

/** Money snapshot of an order's financial position (all values 2dp strings). */
export interface RepairTotals {
  laborPrice: string;
  partsPriceTotal: string;
  discountAmount: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
}
