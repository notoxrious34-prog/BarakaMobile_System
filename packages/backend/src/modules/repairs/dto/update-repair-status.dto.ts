/**
 * DIRECTIVE-013 Stage 6.1 — status-update DTO (v3.0 repair foundation).
 *
 * Shape for a future `PATCH :id/status` endpoint. The target status must
 * be a legal FSM edge from the order's current state; `technicianId`
 * applies to the IN_REPAIR transition, `notes` to diagnosis updates.
 */
export interface UpdateRepairStatusDto {
  status: string;
  technicianId?: string;
  notes?: string;
}
