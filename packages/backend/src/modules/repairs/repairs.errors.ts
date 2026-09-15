import { DomainError } from '../../core/result';

/**
 * DIRECTIVE-013 Stage 6.1 — repair domain errors (v3.0 repair foundation).
 *
 * Stable machine codes for the workshop flow:
 *  - INVALID_REPAIR_TRANSITION — FSM edge does not exist.
 *  - REPAIR_ORDER_NOT_FOUND   — unknown order id.
 *  - REPAIR_ORDER_CLOSED      — mutation attempted on DELIVERED/CANCELLED.
 *  - INVALID_REPAIR_PRICING   — negative, unparseable, or empty quotation.
 */

export class InvalidRepairStateTransitionError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'INVALID_REPAIR_TRANSITION', details);
    Object.setPrototypeOf(this, InvalidRepairStateTransitionError.prototype);
  }
}

export class RepairOrderNotFoundError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'REPAIR_ORDER_NOT_FOUND', details);
    Object.setPrototypeOf(this, RepairOrderNotFoundError.prototype);
  }
}

export class RepairOrderClosedError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'REPAIR_ORDER_CLOSED', details);
    Object.setPrototypeOf(this, RepairOrderClosedError.prototype);
  }
}

export class InvalidRepairPricingError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'INVALID_REPAIR_PRICING', details);
    Object.setPrototypeOf(this, InvalidRepairPricingError.prototype);
  }
}
