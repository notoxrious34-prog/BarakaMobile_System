import { Injectable } from '@nestjs/common';
import { InvalidRepairStateTransitionError, RepairOrderClosedError } from './repairs.errors';
import { REPAIR_STATUS } from './repairs.types';

/**
 * DIRECTIVE-013 Stage 6.1 — repair ticket FSM (v3.0 repair foundation).
 *
 * The workshop pipeline is strictly linear with cancellation exits:
 * RECEIVED → DIAGNOSING → QUOTED → APPROVED → IN_REPAIR → READY →
 * DELIVERED, plus → CANCELLED from any non-terminal state. DELIVERED and
 * CANCELLED are terminal (no outbound edges, including self-loops: repeat
 * delivery/duplicate cancellation attempts fail loudly instead of
 * double-posting downstream billing).
 *
 * Approval gating is structural: READY is reachable only through
 * IN_REPAIR, which is reachable only through APPROVED — so any order in
 * READY was necessarily approved. Quotation substance (labor/parts > 0)
 * is enforced by `RepairDomainService.quoteOrder`, not here.
 */

const TERMINAL_STATUSES: readonly string[] = [REPAIR_STATUS.DELIVERED, REPAIR_STATUS.CANCELLED];

const KNOWN_STATUSES = new Set<string>(Object.values(REPAIR_STATUS));

export const REPAIR_TRANSITIONS: Record<string, readonly string[]> = {
  [REPAIR_STATUS.RECEIVED]: [REPAIR_STATUS.DIAGNOSING, REPAIR_STATUS.CANCELLED],
  [REPAIR_STATUS.DIAGNOSING]: [REPAIR_STATUS.QUOTED, REPAIR_STATUS.CANCELLED],
  [REPAIR_STATUS.QUOTED]: [REPAIR_STATUS.APPROVED, REPAIR_STATUS.CANCELLED],
  [REPAIR_STATUS.APPROVED]: [REPAIR_STATUS.IN_REPAIR, REPAIR_STATUS.CANCELLED],
  [REPAIR_STATUS.IN_REPAIR]: [REPAIR_STATUS.READY, REPAIR_STATUS.CANCELLED],
  [REPAIR_STATUS.READY]: [REPAIR_STATUS.DELIVERED, REPAIR_STATUS.CANCELLED],
  [REPAIR_STATUS.DELIVERED]: [],
  [REPAIR_STATUS.CANCELLED]: [],
};

@Injectable()
export class RepairFsmService {
  canTransition(from: string, to: string): boolean {
    return (REPAIR_TRANSITIONS[from] ?? []).includes(to);
  }

  isTerminal(status: string): boolean {
    return TERMINAL_STATUSES.includes(status);
  }

  /** Throws RepairOrderClosedError on DELIVERED/CANCELLED — checked first. */
  assertNotClosed(status: string, orderNumber?: string): void {
    if (this.isTerminal(status)) {
      throw new RepairOrderClosedError(
        `Repair order ${orderNumber ?? ''} is ${status} — no further transitions are allowed.`.trim(),
        { status, orderNumber },
      );
    }
  }

  /** Throws InvalidRepairStateTransitionError for unknown states or illegal edges. */
  assertTransition(from: string, to: string, orderNumber?: string): void {
    if (!KNOWN_STATUSES.has(from)) {
      throw new InvalidRepairStateTransitionError(`Unknown repair status "${from}".`, { from, to });
    }
    if (!KNOWN_STATUSES.has(to)) {
      throw new InvalidRepairStateTransitionError(`Unknown repair status "${to}".`, { from, to });
    }
    if (!this.canTransition(from, to)) {
      throw new InvalidRepairStateTransitionError(
        `Illegal repair transition ${from} → ${to}${orderNumber ? ` for ${orderNumber}` : ''}.`,
        { from, to, orderNumber },
      );
    }
  }
}
