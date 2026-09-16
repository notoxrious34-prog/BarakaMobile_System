/**
 * DIRECTIVE-022 Stage 10.3 — v3 repair FSM mirror (pure, testable).
 *
 * Client-side copy of the backend transition table
 * (`REPAIR_TRANSITIONS`, verified STAGE-9.1): RECEIVED → DIAGNOSING →
 * QUOTED → APPROVED → IN_REPAIR → READY → DELIVERED, plus CANCELLED from
 * any non-terminal state. The server remains the authority (illegal edges
 * fail loudly); this helper only decides which buttons to enable.
 * `IN_PROGRESS` is accepted as the UI alias of `IN_REPAIR`.
 */

export const V3_REPAIR_TRANSITIONS: Record<string, readonly string[]> = {
  RECEIVED: ['DIAGNOSING', 'CANCELLED'],
  DIAGNOSING: ['QUOTED', 'CANCELLED'],
  QUOTED: ['APPROVED', 'CANCELLED'],
  APPROVED: ['IN_REPAIR', 'CANCELLED'],
  IN_REPAIR: ['READY', 'CANCELLED'],
  READY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

const TERMINAL: ReadonlySet<string> = new Set(['DELIVERED', 'CANCELLED']);

export function normalizeRepairStatus(status: string): string {
  return status === 'IN_PROGRESS' ? 'IN_REPAIR' : status;
}

export function isV3Terminal(status: string): boolean {
  return TERMINAL.has(normalizeRepairStatus(status));
}

export function allowedV3Transitions(from: string): string[] {
  return [...(V3_REPAIR_TRANSITIONS[normalizeRepairStatus(from)] ?? [])];
}

export function canV3Transition(from: string, to: string): boolean {
  return allowedV3Transitions(from).includes(normalizeRepairStatus(to));
}
