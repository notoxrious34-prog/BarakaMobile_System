import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { FiscalPeriod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictError, FiscalPeriodClosedError, NotFoundError, ValidationError } from '../core/result';

/**
 * TASK BRIEF-009 Stage 2.1 — fiscal period lifecycle (v3.0 double-entry foundation).
 *
 * Periods are calendar months named "YYYY-MM" covering the full local month.
 * Lifecycle: OPEN → CLOSED → LOCKED. Posting is allowed only in OPEN
 * (enforced here and, in Stage 2.2, by the journal service via
 * `assertPeriodOpenForPosting`). CLOSED is a soft close (reopenable);
 * LOCKED is terminal (audited periods must never reopen).
 */

export const PERIOD_OPEN = 'OPEN';
export const PERIOD_CLOSED = 'CLOSED';
export const PERIOD_LOCKED = 'LOCKED';

function monthBounds(date: Date): { name: string; start: Date; end: Date } {
  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    name: `${year}-${String(month + 1).padStart(2, '0')}`,
    start: new Date(year, month, 1, 0, 0, 0, 0),
    end: new Date(year, month + 1, 0, 23, 59, 59, 999),
  };
}

/** Prisma P2002 unique-violation (periodName race between concurrent creators). */
function isUniqueViolation(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

@Injectable()
export class FiscalPeriodService {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Prisma.TransactionClient): Prisma.TransactionClient {
    return tx ?? (this.prisma as unknown as Prisma.TransactionClient);
  }

  private async requirePeriod(periodId: string, tx?: Prisma.TransactionClient): Promise<FiscalPeriod> {
    if (!periodId || periodId.trim().length === 0) {
      throw new ValidationError('FiscalPeriodService: periodId must be a non-empty string.');
    }
    const period = await this.db(tx).fiscalPeriod.findUnique({ where: { id: periodId } });
    if (!period) {
      throw new NotFoundError(`Fiscal period "${periodId}" not found.`, { periodId });
    }
    return period;
  }

  /** Derives "YYYY-MM" from the date; auto-creates the OPEN month on first use. */
  async getOrCreatePeriodForDate(date: Date, tx?: Prisma.TransactionClient): Promise<FiscalPeriod> {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      throw new ValidationError('FiscalPeriodService.getOrCreatePeriodForDate: date must be a valid Date.');
    }
    const { name, start, end } = monthBounds(date);
    const db = this.db(tx);
    const existing = await db.fiscalPeriod.findUnique({ where: { periodName: name } });
    if (existing) return existing;
    try {
      return await db.fiscalPeriod.create({
        data: { periodName: name, startDate: start, endDate: end, status: PERIOD_OPEN },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Lost a creation race — the winner's row is authoritative.
      const raced = await db.fiscalPeriod.findUnique({ where: { periodName: name } });
      if (raced) return raced;
      throw error;
    }
  }

  /** Throws FiscalPeriodClosedError unless the period is OPEN. */
  async assertPeriodOpenForPosting(periodId: string, tx?: Prisma.TransactionClient): Promise<FiscalPeriod> {
    const period = await this.requirePeriod(periodId, tx);
    if (period.status !== PERIOD_OPEN) {
      throw new FiscalPeriodClosedError(
        `Fiscal period ${period.periodName} is ${period.status} — posting is blocked.`,
        { periodId, periodName: period.periodName, status: period.status },
      );
    }
    return period;
  }

  /** OPEN → CLOSED (idempotent; LOCKED rejects). */
  async closePeriod(periodId: string, tx?: Prisma.TransactionClient): Promise<FiscalPeriod> {
    const db = this.db(tx);
    const period = await this.requirePeriod(periodId, tx);
    if (period.status === PERIOD_CLOSED) return period;
    if (period.status === PERIOD_LOCKED) {
      throw new ConflictError(`Fiscal period ${period.periodName} is LOCKED and cannot be closed.`, {
        periodId,
        status: period.status,
      });
    }
    if (period.status !== PERIOD_OPEN) {
      throw new ValidationError(`Fiscal period ${period.periodName} has unknown status "${period.status}".`, {
        periodId,
        status: period.status,
      });
    }
    return db.fiscalPeriod.update({
      where: { id: period.id },
      data: { status: PERIOD_CLOSED, closedAt: new Date() },
    });
  }

  /** CLOSED → LOCKED (idempotent; OPEN must be closed first). */
  async lockPeriod(periodId: string, tx?: Prisma.TransactionClient): Promise<FiscalPeriod> {
    const db = this.db(tx);
    const period = await this.requirePeriod(periodId, tx);
    if (period.status === PERIOD_LOCKED) return period;
    if (period.status !== PERIOD_CLOSED) {
      throw new ConflictError(
        `Fiscal period ${period.periodName} must be CLOSED before it can be LOCKED (current: ${period.status}).`,
        { periodId, status: period.status },
      );
    }
    return db.fiscalPeriod.update({ where: { id: period.id }, data: { status: PERIOD_LOCKED } });
  }

  /**
   * CLOSED → OPEN (clears closedAt). OPEN is returned unchanged.
   * LOCKED periods are terminal and can never reopen.
   */
  async reopenPeriod(periodId: string, tx?: Prisma.TransactionClient): Promise<FiscalPeriod> {
    const db = this.db(tx);
    const period = await this.requirePeriod(periodId, tx);
    if (period.status === PERIOD_OPEN) return period;
    if (period.status === PERIOD_LOCKED) {
      throw new FiscalPeriodClosedError(
        `Fiscal period ${period.periodName} is LOCKED and cannot be reopened.`,
        { periodId, periodName: period.periodName, status: period.status },
      );
    }
    if (period.status !== PERIOD_CLOSED) {
      throw new ValidationError(`Fiscal period ${period.periodName} has unknown status "${period.status}".`, {
        periodId,
        status: period.status,
      });
    }
    return db.fiscalPeriod.update({
      where: { id: period.id },
      data: { status: PERIOD_OPEN, closedAt: null },
    });
  }
}
