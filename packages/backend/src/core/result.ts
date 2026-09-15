/**
 * TASK BRIEF-007 Stage 1.1 — Result monad + domain error hierarchy (v3.0 foundation).
 *
 * `Result<T, E>` is a tagged union of `Ok<T>` / `Err<E>` for explicit,
 * exception-free domain outcomes. Throwing stays reserved for truly
 * exceptional flow (transaction abort, programmer error); expected domain
 * failures travel as values.
 */

/** Base of every v3.0 domain error. Carries a stable machine `code`. */
export class DomainError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, code = 'DOMAIN_ERROR', details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'NOT_FOUND', details);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONFLICT', details);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class ConcurrencyError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONCURRENCY_CONFLICT', details);
    Object.setPrototypeOf(this, ConcurrencyError.prototype);
  }
}

export class InsufficientStockError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'INSUFFICIENT_STOCK', details);
    Object.setPrototypeOf(this, InsufficientStockError.prototype);
  }
}

export class LedgerImbalanceError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'LEDGER_IMBALANCE', details);
    Object.setPrototypeOf(this, LedgerImbalanceError.prototype);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'UNAUTHORIZED', details);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class FiscalPeriodClosedError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'FISCAL_PERIOD_CLOSED', details);
    Object.setPrototypeOf(this, FiscalPeriodClosedError.prototype);
  }
}

export class Ok<T> {
  readonly ok = true as const;

  constructor(readonly value: T) {}

  isOk(): this is Ok<T> {
    return true;
  }

  isErr(): this is Err<DomainError> {
    return false;
  }

  map<U>(fn: (value: T) => U): Result<U, never> {
    return new Ok(fn(this.value));
  }

  flatMap<U, E2 extends DomainError>(fn: (value: T) => Result<U, E2>): Result<U, E2> {
    return fn(this.value);
  }

  unwrap(): T {
    return this.value;
  }

  unwrapOr(_fallback: T): T {
    return this.value;
  }
}

export class Err<E extends DomainError> {
  readonly ok = false as const;

  constructor(readonly error: E) {}

  isOk(): this is Ok<never> {
    return false;
  }

  isErr(): this is Err<E> {
    return true;
  }

  map<U>(_fn: (value: never) => U): Result<U, E> {
    return this as unknown as Result<U, E>;
  }

  flatMap<U, E2 extends DomainError>(_fn: (value: never) => Result<U, E2>): Result<U, E | E2> {
    return this as unknown as Result<U, E | E2>;
  }

  unwrap(): never {
    throw this.error;
  }

  unwrapOr<U>(fallback: U): U {
    return fallback;
  }
}

export type Result<T, E extends DomainError = DomainError> = Ok<T> | Err<E>;

export function ok<T>(value: T): Result<T, never> {
  return new Ok(value);
}

export function err<E extends DomainError>(error: E): Result<never, E> {
  return new Err(error);
}
