import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationError } from '../core/result';
import { Money } from '../core/money';

/**
 * TASK BRIEF-010 Stage 2.2 — trial balance & ledger integrity (v3.0 operational ledger).
 *
 * Read-only diagnostics over POSTED lines. `netBalance` follows the
 * account's normal side (DEBIT-normal: debit−credit, CREDIT-normal:
 * credit−debit) so control/subledger reviewers see signed positions.
 * All aggregation is exact Money math — the report itself can never
 * introduce float drift.
 */

export interface AccountBalanceSummary {
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  totalDebit: string;
  totalCredit: string;
  /** debit−credit when normal is DEBIT, credit−debit when normal is CREDIT. */
  netBalance: string;
}

export interface TrialBalanceReport {
  asOfDate: Date;
  accounts: AccountBalanceSummary[];
  totalDebits: string;
  totalCredits: string;
  isBalanced: boolean;
  imbalanceAmount: string;
}

export interface LedgerIntegrityReport {
  isHealthy: boolean;
  totalJournalEntries: number;
  totalJournalLines: number;
  unbalancedEntriesCount: number;
  trialBalanceDiscrepancy: string;
  checkedAt: Date;
}

@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Prisma.TransactionClient): Prisma.TransactionClient {
    return tx ?? (this.prisma as unknown as Prisma.TransactionClient);
  }

  async getTrialBalance(asOfDate = new Date(), tx?: Prisma.TransactionClient): Promise<TrialBalanceReport> {
    if (!(asOfDate instanceof Date) || Number.isNaN(asOfDate.getTime())) {
      throw new ValidationError('ReconciliationService.getTrialBalance: asOfDate must be a valid Date.');
    }
    const lines = await this.db(tx).journalEntryLine.findMany({
      where: { journalEntry: { status: 'POSTED', postingDate: { lte: asOfDate } } },
      include: { account: true },
    });

    const buckets = new Map<string, { name: string; type: string; normal: string; debit: Money; credit: Money }>();
    for (const line of lines) {
      let bucket = buckets.get(line.accountCode);
      if (!bucket) {
        bucket = {
          name: line.account.name,
          type: line.account.type,
          normal: line.account.normalBalance,
          debit: Money.zero(),
          credit: Money.zero(),
        };
        buckets.set(line.accountCode, bucket);
      }
      bucket.debit = bucket.debit.add(Money.from(line.debit));
      bucket.credit = bucket.credit.add(Money.from(line.credit));
    }

    const accounts: AccountBalanceSummary[] = [];
    let totalDebits = Money.zero();
    let totalCredits = Money.zero();
    for (const [accountCode, bucket] of [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const net = bucket.normal === 'DEBIT' ? bucket.debit.sub(bucket.credit) : bucket.credit.sub(bucket.debit);
      accounts.push({
        accountCode,
        accountName: bucket.name,
        accountType: bucket.type,
        normalBalance: bucket.normal,
        totalDebit: bucket.debit.to2dp(),
        totalCredit: bucket.credit.to2dp(),
        netBalance: net.to2dp(),
      });
      totalDebits = totalDebits.add(bucket.debit);
      totalCredits = totalCredits.add(bucket.credit);
    }

    const imbalance = totalDebits.sub(totalCredits);
    return {
      asOfDate,
      accounts,
      totalDebits: totalDebits.to2dp(),
      totalCredits: totalCredits.to2dp(),
      isBalanced: imbalance.isZero(),
      imbalanceAmount: imbalance.abs().to2dp(),
    };
  }

  async verifyLedgerIntegrity(tx?: Prisma.TransactionClient): Promise<LedgerIntegrityReport> {
    const db = this.db(tx);
    const [entries, totalJournalEntries, totalJournalLines] = await Promise.all([
      db.journalEntry.findMany({ include: { lines: true } }),
      db.journalEntry.count(),
      db.journalEntryLine.count(),
    ]);

    let unbalancedEntriesCount = 0;
    let postedDebits = Money.zero();
    let postedCredits = Money.zero();
    for (const entry of entries) {
      let debit = Money.zero();
      let credit = Money.zero();
      for (const line of entry.lines) {
        debit = debit.add(Money.from(line.debit));
        credit = credit.add(Money.from(line.credit));
      }
      if (!debit.equals(credit)) unbalancedEntriesCount += 1;
      if (entry.status === 'POSTED') {
        postedDebits = postedDebits.add(debit);
        postedCredits = postedCredits.add(credit);
      }
    }

    const discrepancy = postedDebits.sub(postedCredits);
    return {
      isHealthy: unbalancedEntriesCount === 0 && discrepancy.isZero(),
      totalJournalEntries,
      totalJournalLines,
      unbalancedEntriesCount,
      trialBalanceDiscrepancy: discrepancy.abs().to2dp(),
      checkedAt: new Date(),
    };
  }
}
