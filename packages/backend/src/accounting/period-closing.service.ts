import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../core/money';
import { ConflictError, FiscalPeriodClosedError, LedgerImbalanceError, NotFoundError, ValidationError } from '../core/result';
import { TransactionOrchestrator } from '../core/transaction-orchestrator';
import { AuditService } from '../core/audit.service';
import { FiscalPeriodService, PERIOD_CLOSED, PERIOD_LOCKED, PERIOD_OPEN } from './fiscal-period.service';
import { PostingService } from './posting.service';
import { ReconciliationService } from './reconciliation.service';

/**
 * DIRECTIVE-017 Stage 8 — fiscal period-end closing (v3.0 reporting).
 *
 * Atomic nominal close: zeroes every REVENUE/EXPENSE-type account posted
 * in the period into Retained Earnings (30100), then transitions the
 * period OPEN → CLOSED. PostingService derives the journal's period from
 * `postingDate` (there is no fiscalPeriodId override), so the closing
 * entry is posted with `postingDate = period.endDate` while the period is
 * still OPEN — the status flip happens strictly after the post, inside
 * the same orchestrator transaction.
 *
 * Lines from a previous PERIOD_CLOSING entry are excluded defensively so
 * a close can never double-count. Every mutation honors caller-tx reuse
 * (Rule ⑬): pass `tx` to join an outer transaction.
 */

const RETAINED_EARNINGS = '30100';

export interface CloseFiscalPeriodParams {
  periodId: string;
  actorUserId?: string;
}

export interface CloseFiscalPeriodResult {
  periodId: string;
  periodName: string;
  status: string;
  closedAt: Date;
  hadNominalActivity: boolean;
  netIncome: string;
  closingJournalEntryId: string | null;
  closingJournalNumber: string | null;
}

@Injectable()
export class PeriodClosingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: TransactionOrchestrator,
    private readonly periods: FiscalPeriodService,
    private readonly posting: PostingService,
    private readonly reconciliation: ReconciliationService,
    private readonly audit: AuditService,
  ) {}

  private db(tx?: Prisma.TransactionClient): Prisma.TransactionClient {
    return tx ?? (this.prisma as unknown as Prisma.TransactionClient);
  }

  async closeFiscalPeriod(params: CloseFiscalPeriodParams, outerTx?: Prisma.TransactionClient): Promise<CloseFiscalPeriodResult> {
    const run = async (db: Prisma.TransactionClient): Promise<CloseFiscalPeriodResult> => {
      if (!params.periodId || params.periodId.trim().length === 0) {
        throw new ValidationError('PeriodClosingService.closeFiscalPeriod: periodId must be a non-empty string.');
      }
      const period = await db.fiscalPeriod.findUnique({ where: { id: params.periodId } });
      if (!period) {
        throw new NotFoundError(`Fiscal period "${params.periodId}" not found.`, { periodId: params.periodId });
      }
      if (period.status === PERIOD_LOCKED) {
        throw new ConflictError(`Fiscal period ${period.periodName} is LOCKED and cannot be closed.`, {
          periodId: period.id,
        });
      }
      if (period.status === PERIOD_CLOSED) {
        throw new FiscalPeriodClosedError(`Fiscal period ${period.periodName} is already CLOSED.`, {
          periodId: period.id,
        });
      }
      if (period.status !== PERIOD_OPEN) {
        throw new ValidationError(`Fiscal period ${period.periodName} has unknown status "${period.status}".`, {
          periodId: period.id,
          status: period.status,
        });
      }

      const integrity = await this.reconciliation.verifyLedgerIntegrity(db);
      if (!integrity.isHealthy) {
        throw new LedgerImbalanceError(
          `Cannot close fiscal period ${period.periodName}: ledger integrity check failed ` +
            `(${integrity.unbalancedEntriesCount} unbalanced entries, discrepancy ${integrity.trialBalanceDiscrepancy}).`,
          { periodId: period.id },
        );
      }

      const lines = await db.journalEntryLine.findMany({
        where: {
          journalEntry: {
            status: 'POSTED',
            postingDate: { gte: period.startDate, lte: period.endDate },
            documentType: { not: 'PERIOD_CLOSING' },
          },
        },
        include: { account: true },
      });

      const nominals = new Map<string, { name: string; type: string; debit: Money; credit: Money }>();
      for (const line of lines) {
        const type = line.account?.type;
        if (type !== 'REVENUE' && type !== 'EXPENSE') continue;
        let bucket = nominals.get(line.accountCode);
        if (!bucket) {
          bucket = { name: line.account.name, type, debit: Money.zero(), credit: Money.zero() };
          nominals.set(line.accountCode, bucket);
        }
        bucket.debit = bucket.debit.add(Money.from(line.debit));
        bucket.credit = bucket.credit.add(Money.from(line.credit));
      }

      let totalRevenue = Money.zero();
      let totalExpense = Money.zero();
      const closingLines: Array<{ accountCode: string; debit?: string; credit?: string; memo?: string }> = [];

      for (const [accountCode, bucket] of [...nominals.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
        if (bucket.type === 'REVENUE') {
          const net = bucket.credit.sub(bucket.debit);
          if (net.isZero()) continue;
          totalRevenue = totalRevenue.add(net);
          if (net.isPositive()) {
            closingLines.push({ accountCode, debit: net.to2dp(), memo: `Close ${accountCode}` });
          } else {
            closingLines.push({ accountCode, credit: net.abs().to2dp(), memo: `Close ${accountCode}` });
          }
        } else {
          const net = bucket.debit.sub(bucket.credit);
          if (net.isZero()) continue;
          totalExpense = totalExpense.add(net);
          if (net.isPositive()) {
            closingLines.push({ accountCode, credit: net.to2dp(), memo: `Close ${accountCode}` });
          } else {
            closingLines.push({ accountCode, debit: net.abs().to2dp(), memo: `Close ${accountCode}` });
          }
        }
      }

      const netIncome = totalRevenue.sub(totalExpense);
      let closingJournalEntryId: string | null = null;
      let closingJournalNumber: string | null = null;

      if (closingLines.length > 0) {
        if (netIncome.isPositive()) {
          closingLines.push({ accountCode: RETAINED_EARNINGS, credit: netIncome.to2dp(), memo: 'Net profit to retained earnings' });
        } else if (netIncome.isNegative()) {
          closingLines.push({ accountCode: RETAINED_EARNINGS, debit: netIncome.abs().to2dp(), memo: 'Net loss from retained earnings' });
        }
        const posted = await this.posting.post(
          {
            documentType: 'PERIOD_CLOSING',
            description: `Closing entry for fiscal period ${period.periodName}`,
            lines: closingLines,
            postingDate: new Date(period.endDate),
            actorUserId: params.actorUserId,
          },
          db,
        );
        closingJournalEntryId = posted.id;
        closingJournalNumber = posted.entryNumber;
      }

      const closed = await this.periods.closePeriod(period.id, db);
      await this.audit.record(
        {
          actorUserId: params.actorUserId,
          action: 'ACCOUNTING.PERIOD_CLOSE',
          entityType: 'FiscalPeriod',
          entityId: period.id,
          after: {
            periodName: period.periodName,
            netIncome: netIncome.to2dp(),
            closingJournalNumber,
          },
        },
        db,
      );

      return {
        periodId: period.id,
        periodName: period.periodName,
        status: closed.status,
        closedAt: closed.closedAt as Date,
        hadNominalActivity: closingLines.length > 0,
        netIncome: netIncome.to2dp(),
        closingJournalEntryId,
        closingJournalNumber,
      };
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `period-close:${params.periodId}` });
  }

  /** Read-only accessor used by operators: delegates to FiscalPeriodService. */
  async getPeriod(periodId: string, tx?: Prisma.TransactionClient): Promise<{ id: string; periodName: string; status: string }> {
    const period = await this.db(tx).fiscalPeriod.findUnique({ where: { id: periodId } });
    if (!period) {
      throw new NotFoundError(`Fiscal period "${periodId}" not found.`, { periodId });
    }
    return { id: period.id, periodName: period.periodName, status: period.status };
  }
}
