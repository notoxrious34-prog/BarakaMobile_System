import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../core/money';
import { ReconciliationService } from '../accounting/reconciliation.service';

/**
 * TASK BRIEF-013 Stage 4 — GL control ↔ subledger reconciliation.
 *
 * Proves the foundational double-entry invariant: the GL control accounts
 * (11000 AR, 20000 AP) exactly equal the sum of their subledger positions.
 * GL side reuses the canonical trial balance (POSTED lines, DEBIT-normal
 * nets for AR, CREDIT-normal nets for AP); subledger side folds the latest
 * `balanceAfter` per active party (CUSTOMER+BOTH for AR, SUPPLIER+BOTH
 * for AP). Any bypass write (backdated import, manual fix without a
 * subledger leg) surfaces here as a non-zero discrepancy.
 */

export interface ControlReconciliation {
  isBalanced: boolean;
  glControlBalance: string;
  subledgerSum: string;
  discrepancy: string;
}

const AR_CONTROL = '11000';
const AP_CONTROL = '20000';

@Injectable()
export class SubledgerReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trialBalance: ReconciliationService,
  ) {}

  async reconcileCustomerReceivables(tx?: Prisma.TransactionClient): Promise<ControlReconciliation> {
    const db: Prisma.TransactionClient = tx ?? (this.prisma as unknown as Prisma.TransactionClient);
    const report = await this.trialBalance.getTrialBalance(new Date(), tx);
    const control = report.accounts.find((account) => account.accountCode === AR_CONTROL);
    const gl = control ? Money.from(control.netBalance) : Money.zero();
    const sum = await this.sumLatestBalances(db, ['CUSTOMER', 'BOTH']);
    return this.compare(gl, sum);
  }

  async reconcileSupplierPayables(tx?: Prisma.TransactionClient): Promise<ControlReconciliation> {
    const db: Prisma.TransactionClient = tx ?? (this.prisma as unknown as Prisma.TransactionClient);
    const report = await this.trialBalance.getTrialBalance(new Date(), tx);
    const control = report.accounts.find((account) => account.accountCode === AP_CONTROL);
    const gl = control ? Money.from(control.netBalance) : Money.zero();
    const sum = await this.sumLatestBalances(db, ['SUPPLIER', 'BOTH']);
    return this.compare(gl, sum);
  }

  private compare(gl: Money, sum: Money): ControlReconciliation {
    const discrepancy = gl.sub(sum);
    return {
      isBalanced: discrepancy.isZero(),
      glControlBalance: gl.to2dp(),
      subledgerSum: sum.to2dp(),
      discrepancy: discrepancy.abs().to2dp(),
    };
  }

  private async sumLatestBalances(db: Prisma.TransactionClient, types: string[]): Promise<Money> {
    const entries = await db.partySubledgerEntry.findMany({
      where: { party: { isActive: true, type: { in: types } } },
      orderBy: { createdAt: 'asc' },
    });
    // Ascending scan: the last row per party is its latest snapshot.
    const latest = new Map<string, Money>();
    for (const entry of entries) {
      latest.set(entry.partyId, Money.from(entry.balanceAfter));
    }
    let sum = Money.zero();
    for (const balance of latest.values()) {
      sum = sum.add(balance);
    }
    return sum;
  }
}
