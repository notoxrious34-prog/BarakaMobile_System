/**
 * DIRECTIVE-013 Stage 6.1 — intake DTO (v3.0 repair foundation).
 *
 * Shape consumed by `RepairDomainService.createRepairOrder` and, in a
 * later stage, by the workshop HTTP controller. Plain interface (no
 * decorators): the service layer is the single validation authority.
 */
export interface CreateRepairOrderDto {
  /** Customer party id (CUSTOMER or BOTH, active). */
  partyId: string;
  deviceType: string;
  brand: string;
  model: string;
  serialOrImei?: string;
  reportedIssue: string;
  actorUserId?: string;
}
