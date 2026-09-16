import { DomainError } from '../../core/result';

/**
 * DIRECTIVE-016 Stage 7.2 — wallet domain errors (v3.0 Flexy engine).
 *
 * Stable machine codes for the float lifecycle:
 *  - WALLET_NOT_FOUND            — unknown wallet id.
 *  - INACTIVE_WALLET             — operation on a deactivated wallet.
 *  - INSUFFICIENT_WALLET_BALANCE — top-up/transfer exceeds float.
 *  - INVALID_FLOAT_TRANSFER      — same-leg, bad leg, non-positive amount.
 *  - INVALID_FLEXY_PRICING       — negative/unparseable face, cost, fee,
 *                                  or a negative margin.
 */

export class WalletNotFoundError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'WALLET_NOT_FOUND', details);
    Object.setPrototypeOf(this, WalletNotFoundError.prototype);
  }
}

export class InactiveWalletError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'INACTIVE_WALLET', details);
    Object.setPrototypeOf(this, InactiveWalletError.prototype);
  }
}

export class InsufficientWalletBalanceError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'INSUFFICIENT_WALLET_BALANCE', details);
    Object.setPrototypeOf(this, InsufficientWalletBalanceError.prototype);
  }
}

export class InvalidFloatTransferError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'INVALID_FLOAT_TRANSFER', details);
    Object.setPrototypeOf(this, InvalidFloatTransferError.prototype);
  }
}

export class InvalidFlexyPricingError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'INVALID_FLEXY_PRICING', details);
    Object.setPrototypeOf(this, InvalidFlexyPricingError.prototype);
  }
}
