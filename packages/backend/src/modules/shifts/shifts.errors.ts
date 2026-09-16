import { DomainError } from '../../core/result';

/**
 * DIRECTIVE-015 Stage 7.1 — shift domain errors (v3.0 POS registers).
 *
 * Stable machine codes for the drawer lifecycle:
 *  - SHIFT_NOT_FOUND        — unknown shift id.
 *  - ACTIVE_SHIFT_EXISTS    — register already has an open shift.
 *  - SHIFT_CLOSED           — mutation attempted on a CLOSED shift.
 *  - INVALID_CASH_MOVEMENT  — bad type, non-positive amount, empty reason.
 *  - INVALID_CASH_COUNT     — negative or unparseable cash count/float.
 */

export class ShiftNotFoundError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'SHIFT_NOT_FOUND', details);
    Object.setPrototypeOf(this, ShiftNotFoundError.prototype);
  }
}

export class ActiveShiftExistsError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'ACTIVE_SHIFT_EXISTS', details);
    Object.setPrototypeOf(this, ActiveShiftExistsError.prototype);
  }
}

export class ShiftClosedError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'SHIFT_CLOSED', details);
    Object.setPrototypeOf(this, ShiftClosedError.prototype);
  }
}

export class InvalidCashMovementError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'INVALID_CASH_MOVEMENT', details);
    Object.setPrototypeOf(this, InvalidCashMovementError.prototype);
  }
}

export class InvalidCashCountError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'INVALID_CASH_COUNT', details);
    Object.setPrototypeOf(this, InvalidCashCountError.prototype);
  }
}
