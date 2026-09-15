import Decimal from 'decimal.js';
import { DomainError } from './result';

/**
 * TASK BRIEF-007 Stage 1.1 — Money value object (v3.0 foundation).
 *
 * Immutable monetary primitive. Every instance wraps a `decimal.js` Decimal
 * and every arithmetic operation returns a NEW Money — inputs are never
 * mutated. Use `to2dp()` at persistence boundaries (ROUND_HALF_UP, 2dp —
 * the v2.x storage convention) and `to4dp()` for rates (wallet commissions).
 */
export class MoneyDomainError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'MONEY_DOMAIN_ERROR', details);
    Object.setPrototypeOf(this, MoneyDomainError.prototype);
  }
}

export type MoneyInput = string | number | Decimal;

function parseMoneyInput(value: MoneyInput, what: string): Decimal {
  let candidate: Decimal;
  try {
    if (value instanceof Decimal) {
      candidate = new Decimal(value);
    } else if (typeof value === 'string' || typeof value === 'number') {
      if (typeof value === 'string' && value.trim().length === 0) {
        throw new MoneyDomainError(`${what} must be a valid numeric value, got an empty string.`);
      }
      candidate = new Decimal(value);
    } else {
      throw new MoneyDomainError(`${what} must be string | number | Decimal.`);
    }
  } catch (error) {
    if (error instanceof MoneyDomainError) throw error;
    throw new MoneyDomainError(`${what} must be a valid numeric value, got ${JSON.stringify(value)}.`, {
      value,
    });
  }
  if (!candidate.isFinite()) {
    throw new MoneyDomainError(`${what} must be finite (NaN/Infinity rejected), got ${String(value)}.`, {
      value,
    });
  }
  return candidate;
}

function assertMoney(other: unknown): asserts other is Money {
  if (!(other instanceof Money)) {
    throw new MoneyDomainError('Money arithmetic requires a Money operand.');
  }
}

export class Money {
  private readonly amount: Decimal;

  private constructor(amount: Decimal) {
    this.amount = amount;
    Object.freeze(this);
  }

  static from(value: MoneyInput): Money {
    return new Money(parseMoneyInput(value, 'Money.from'));
  }

  static zero(): Money {
    return new Money(new Decimal(0));
  }

  add(other: Money): Money {
    assertMoney(other);
    return new Money(this.amount.plus(other.amount));
  }

  sub(other: Money): Money {
    assertMoney(other);
    return new Money(this.amount.minus(other.amount));
  }

  mul(factor: MoneyInput): Money {
    return new Money(this.amount.mul(parseMoneyInput(factor, 'Money.mul')));
  }

  div(divisor: MoneyInput): Money {
    const d = parseMoneyInput(divisor, 'Money.div');
    if (d.isZero()) {
      throw new MoneyDomainError('Money.div: division by zero is not allowed.');
    }
    return new Money(this.amount.div(d));
  }

  abs(): Money {
    return new Money(this.amount.abs());
  }

  negate(): Money {
    return new Money(this.amount.neg());
  }

  equals(other: Money): boolean {
    assertMoney(other);
    return this.amount.equals(other.amount);
  }

  greaterThan(other: Money): boolean {
    assertMoney(other);
    return this.amount.gt(other.amount);
  }

  greaterThanOrEqual(other: Money): boolean {
    assertMoney(other);
    return this.amount.gte(other.amount);
  }

  lessThan(other: Money): boolean {
    assertMoney(other);
    return this.amount.lt(other.amount);
  }

  lessThanOrEqual(other: Money): boolean {
    assertMoney(other);
    return this.amount.lte(other.amount);
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isPositive(): boolean {
    return this.amount.gt(0);
  }

  isNegative(): boolean {
    return this.amount.lt(0);
  }

  /** ROUND_HALF_UP, fixed 2dp — the persistence/exchange format. */
  to2dp(): string {
    return this.amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }

  /** ROUND_HALF_UP, fixed 4dp — the rate format (e.g. wallet commissions). */
  to4dp(): string {
    return this.amount.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
  }

  toString(): string {
    return this.amount.toString();
  }
}
