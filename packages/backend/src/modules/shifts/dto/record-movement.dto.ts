/**
 * DIRECTIVE-015 Stage 7.1 — record-movement DTO (v3.0 POS registers).
 *
 * Amounts are decimal strings (Rule ③); non-positive amounts, unknown
 * types and empty reasons are rejected with `InvalidCashMovementError`.
 */
export interface RecordMovementDto {
  shiftId: string;
  movementType: 'DRAWER_IN' | 'DRAWER_OUT' | 'PETTY_CASH';
  amount: string;
  reason: string;
  actorUserId: string;
}
