/**
 * DIRECTIVE-015 Stage 7.1 — open-shift DTO (v3.0 POS registers).
 *
 * Consumed by `CashShiftOrchestratorService.openShift` and, in a later
 * stage, by the POS HTTP controller. Plain interface (no decorators):
 * the service layer is the single validation authority.
 */
export interface OpenShiftDto {
  registerId: string;
  cashierUserId: string;
  openingCash: string;
  notes?: string;
}
