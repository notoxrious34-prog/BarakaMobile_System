import { DomainError } from '../core/result';

/**
 * DIRECTIVE-017 Stage 8 — accounting reporting/closing errors.
 *
 *  - IMBALANCED_STATEMENTS — balance-sheet equation check failed
 *    (Assets !== Liabilities + Equity). Carries both sides for audit.
 */
export class ImbalancedStatementsError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'IMBALANCED_STATEMENTS', details);
    Object.setPrototypeOf(this, ImbalancedStatementsError.prototype);
  }
}
