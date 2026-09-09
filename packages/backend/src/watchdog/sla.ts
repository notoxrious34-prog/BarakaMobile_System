/**
 * Pure SLA / watchdog severity computations (TB-126).
 * Single source of truth — all endpoints consume these, never reimplement.
 * Day-counts are plain integers (NOT monetary — Rule ② does not apply).
 */

export const DAY_MS = 86_400_000;

/** Statuses that end a ticket's lifecycle — excluded from delay tracking. */
export const TERMINAL_REPAIR_STATUSES = ['DELIVERED', 'CANCELLED'] as const;

export type RepairSeverity = 'NORMAL' | 'DELAYED' | 'CRITICAL';
export type WarrantyCategory = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED';

/**
 * Repair delay severity. Tickets with a null estimated date are legacy
 * pre-migration rows — excluded entirely (returned as null).
 */
export function computeRepairSeverity(
  estimatedCompletionDate: Date | null | undefined,
  now: Date,
  graceDays: number,
): RepairSeverity | null {
  if (!estimatedCompletionDate) return null;
  const daysOverdue = Math.floor((now.getTime() - estimatedCompletionDate.getTime()) / DAY_MS);
  if (daysOverdue <= 0) return 'NORMAL';
  if (daysOverdue <= graceDays) return 'DELAYED';
  return 'CRITICAL';
}

export function computeDaysOverdue(estimatedCompletionDate: Date, now: Date): number {
  return Math.floor((now.getTime() - estimatedCompletionDate.getTime()) / DAY_MS);
}

export function computeWarrantyCategory(
  warrantyExpiresAt: Date,
  now: Date,
  alertDays: number,
): WarrantyCategory {
  const daysRemaining = Math.floor((warrantyExpiresAt.getTime() - now.getTime()) / DAY_MS);
  if (daysRemaining < 0) return 'EXPIRED';
  if (daysRemaining <= alertDays) return 'EXPIRING_SOON';
  return 'ACTIVE';
}

export function computeDaysRemaining(warrantyExpiresAt: Date, now: Date): number {
  return Math.floor((warrantyExpiresAt.getTime() - now.getTime()) / DAY_MS);
}

/** Positive-integer day-count validation (>= 1). */
export function isValidDayCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1;
}
