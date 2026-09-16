/**
 * DIRECTIVE-015 Stage 7.1 — close-shift DTO (v3.0 POS registers).
 *
 * `actualCash` is the counted physical drawer content (>= 0); negative
 * or unparseable counts are rejected with `InvalidCashCountError`.
 */
export interface CloseShiftDto {
  shiftId: string;
  actualCash: string;
  notes?: string;
  actorUserId: string;
}
