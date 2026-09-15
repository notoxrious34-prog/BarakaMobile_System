import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PartySubledgerEntry } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../core/money';
import { ConflictError, ValidationError } from '../core/result';
import { TransactionOrchestrator } from '../core/transaction-orchestrator';
import { AuditService } from '../core/audit.service';
import { PartiesService } from './parties.service';

/**
 * TASK BRIEF-013 Stage 4 — party subledger postings (v3.0 parties domain).
 *
 * Each `PartySubledgerEntry` mirrors exactly one GL `JournalEntryLine`
 * (via unique `journalLineId`) and carries a `balanceBefore/After`
 * snapshot, so the party position is exact without aggregation.
 *
 * Direction convention (balances are always non-negative positions):
 *  - CUSTOMER (receivable): debit +amount, credit −amount.
 *  - SUPPLIER (payable):    credit +amount, debit −amount.
 *  - BOTH follows the CUSTOMER (receivable-side) convention — a future
 *    stage may split BOTH into per-side chains; reconciliation already
 *    counts BOTH in both control sums, per the brief.
 *
 * Credit limits apply to CUSTOMER/BOTH debits only (0 = unlimited).
 * Supplier balances are intentionally unclamped: overpayment is a real
 * position, not an error.
 */

export type SubledgerEntryType =
  | 'INVOICE_CHARGE'
  | 'PAYMENT'
  | 'RETURN_CREDIT'
  | 'DEBT_ADJUSTMENT'
  | 'OPENING_BALANCE';

const ENTRY_TYPES: readonly string[] = [
  'INVOICE_CHARGE',
  'PAYMENT',
  'RETURN_CREDIT',
  'DEBT_ADJUSTMENT',
  'OPENING_BALANCE',
];

export interface RecordSubledgerParams {
  partyId: string;
  journalLineId: string;
  entryType: string;
  amount: string | Money;
  isDebit: boolean;
  actorUserId?: string;
}

function toMoney(value: string | Money, what: string): Money {
  if (value instanceof Money) return value;
  try {
    return Money.from(value);
  } catch {
    throw new ValidationError(`PartySubledgerService: ${what} is not a valid amount.`, { value });
  }
}

@Injectable()
export class PartySubledgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parties: PartiesService,
    private readonly orchestrator: TransactionOrchestrator,
    private readonly audit: AuditService,
  ) {}

  async recordSubledgerEntry(
    params: RecordSubledgerParams,
    outerTx?: Prisma.TransactionClient,
  ): Promise<PartySubledgerEntry> {
    if (!params.partyId || params.partyId.trim().length === 0) {
      throw new ValidationError('PartySubledgerService.recordSubledgerEntry: partyId must be a non-empty string.');
    }
    if (!params.journalLineId || params.journalLineId.trim().length === 0) {
      throw new ValidationError('PartySubledgerService.recordSubledgerEntry: journalLineId must be a non-empty string.');
    }
    if (!ENTRY_TYPES.includes(params.entryType)) {
      throw new ValidationError(
        `PartySubledgerService.recordSubledgerEntry: unknown entryType "${params.entryType}" (expected one of ${ENTRY_TYPES.join(', ')}).`,
      );
    }
    const amount = toMoney(params.amount, 'amount');
    if (!amount.isPositive()) {
      throw new ValidationError('PartySubledgerService.recordSubledgerEntry: amount must be > 0.');
    }

    const run = async (db: Prisma.TransactionClient): Promise<PartySubledgerEntry> => {
      const party = await this.parties.getParty(params.partyId, db);
      if (!party.isActive) {
        throw new ValidationError(`Party ${party.name} is inactive — subledger posting blocked.`, {
          partyId: party.id,
        });
      }
      const duplicate = await db.partySubledgerEntry.findUnique({
        where: { journalLineId: params.journalLineId },
      });
      if (duplicate) {
        throw new ConflictError(
          `Journal line ${params.journalLineId} is already recorded in the subledger.`,
          { journalLineId: params.journalLineId },
        );
      }
      const current = await this.latestBalance(party.id, db);
      let balanceAfter: Money;
      if (party.type === 'SUPPLIER') {
        balanceAfter = params.isDebit ? current.sub(amount) : current.add(amount);
      } else {
        balanceAfter = params.isDebit ? current.add(amount) : current.sub(amount);
        if (params.isDebit) {
          const limit = Money.from(party.creditLimit);
          if (limit.isPositive() && balanceAfter.greaterThan(limit)) {
            throw new ValidationError(
              `Credit limit exceeded for customer ${party.name}. Limit: ${limit.to2dp()}, Projected Balance: ${balanceAfter.to2dp()}.`,
              { partyId: party.id, creditLimit: limit.to2dp(), projected: balanceAfter.to2dp() },
            );
          }
        }
      }
      const entry = await db.partySubledgerEntry.create({
        data: {
          partyId: party.id,
          journalLineId: params.journalLineId,
          entryType: params.entryType,
          amount: amount.to2dp(),
          balanceBefore: current.to2dp(),
          balanceAfter: balanceAfter.to2dp(),
        },
      });
      if (params.actorUserId) {
        await this.audit.record(
          {
            actorUserId: params.actorUserId,
            action: 'SUBLEDGER.RECORD',
            entityType: 'PartySubledgerEntry',
            entityId: entry.id,
            after: {
              partyId: party.id,
              journalLineId: params.journalLineId,
              entryType: params.entryType,
              amount: amount.to2dp(),
              balanceAfter: balanceAfter.to2dp(),
            },
          },
          db,
        );
      }
      return entry;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `subledger-record:${params.partyId}` });
  }

  /** Latest `balanceAfter` snapshot; zero when the party has no entries. */
  async latestBalance(partyId: string, tx?: Prisma.TransactionClient): Promise<Money> {
    if (!partyId || partyId.trim().length === 0) {
      throw new ValidationError('PartySubledgerService.latestBalance: partyId must be a non-empty string.');
    }
    const db: Prisma.TransactionClient = tx ?? (this.prisma as unknown as Prisma.TransactionClient);
    const latest = await db.partySubledgerEntry.findFirst({
      where: { partyId },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) return Money.zero();
    return Money.from(latest.balanceAfter);
  }
}
