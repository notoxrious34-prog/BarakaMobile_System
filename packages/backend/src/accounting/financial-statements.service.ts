import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../core/money';
import { NotFoundError, ValidationError } from '../core/result';
import { FiscalPeriodService } from './fiscal-period.service';
import { ImbalancedStatementsError } from './accounting.errors';

/**
 * DIRECTIVE-017 Stage 8 — formal financial statements (v3.0 reporting).
 *
 * Read-only diagnostics over POSTED journal lines. Classification is by
 * ChartOfAccount `type` (REVENUE / EXPENSE / ASSET / LIABILITY / EQUITY),
 * never by account name — the TB-009 seed names differ from earlier prose
 * (40400 'Other Income', 50200 'Operating Expenses', 50300
 * 'External Repair Costs', 50400 'Salaries, Rent & Utilities').
 *
 * Nominal presentation split: 50000/50100 are Cost of Goods Sold, every
 * other EXPENSE-type account is an operating expense; every REVENUE-type
 * account (including 40100) contributes to total revenue. All math is
 * exact Money — the report itself can never introduce float drift.
 */

const COGS_CODES: ReadonlySet<string> = new Set(['50000', '50100']);

export interface StatementLine {
  accountCode: string;
  accountName: string;
  /** Signed net on the account's normal side, 2dp string. */
  balance: string;
}

export interface IncomeStatementParams {
  periodId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface IncomeStatement {
  periodId: string | null;
  periodName: string | null;
  startDate: Date;
  endDate: Date;
  revenues: StatementLine[];
  totalRevenue: string;
  cogs: StatementLine[];
  totalCogs: string;
  grossProfit: string;
  expenses: StatementLine[];
  totalExpenses: string;
  netIncome: string;
}

export interface BalanceSheetParams {
  asOfDate?: Date;
  periodId?: string;
}

export interface BalanceSheet {
  asOfDate: Date;
  periodId: string | null;
  periodName: string | null;
  assets: StatementLine[];
  totalAssets: string;
  liabilities: StatementLine[];
  totalLiabilities: string;
  equity: StatementLine[];
  retainedEarnings: string;
  currentNetIncome: string;
  totalEquity: string;
  balanced: boolean;
}

type NominalBucket = { name: string; debit: Money; credit: Money };

function validDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

@Injectable()
export class FinancialStatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: FiscalPeriodService,
  ) {}

  private db(tx?: Prisma.TransactionClient): Prisma.TransactionClient {
    return tx ?? (this.prisma as unknown as Prisma.TransactionClient);
  }

  private async resolveRange(
    params: IncomeStatementParams,
    tx?: Prisma.TransactionClient,
  ): Promise<{ periodId: string | null; periodName: string | null; start: Date; end: Date }> {
    if (params.periodId) {
      const period = await this.db(tx).fiscalPeriod.findUnique({ where: { id: params.periodId } });
      if (!period) {
        throw new NotFoundError(`Fiscal period "${params.periodId}" not found.`, { periodId: params.periodId });
      }
      return { periodId: period.id, periodName: period.periodName, start: period.startDate, end: period.endDate };
    }
    if (!validDate(params.startDate)) {
      throw new ValidationError('FinancialStatementsService.getIncomeStatement: startDate or periodId is required.');
    }
    const end = validDate(params.endDate) ? (params.endDate as Date) : new Date();
    if ((params.startDate as Date).getTime() > end.getTime()) {
      throw new ValidationError('FinancialStatementsService.getIncomeStatement: startDate must be <= endDate.');
    }
    return { periodId: null, periodName: null, start: params.startDate as Date, end };
  }

  async getIncomeStatement(params: IncomeStatementParams, tx?: Prisma.TransactionClient): Promise<IncomeStatement> {
    const { periodId, periodName, start, end } = await this.resolveRange(params, tx);
    const lines = await this.db(tx).journalEntryLine.findMany({
      where: { journalEntry: { status: 'POSTED', postingDate: { gte: start, lte: end } } },
      include: { account: true },
    });

    const buckets = new Map<string, NominalBucket & { type: string }>();
    for (const line of lines) {
      const type = line.account?.type;
      if (type !== 'REVENUE' && type !== 'EXPENSE') continue;
      let bucket = buckets.get(line.accountCode);
      if (!bucket) {
        bucket = { name: line.account.name, type, debit: Money.zero(), credit: Money.zero() };
        buckets.set(line.accountCode, bucket);
      }
      bucket.debit = bucket.debit.add(Money.from(line.debit));
      bucket.credit = bucket.credit.add(Money.from(line.credit));
    }

    const revenues: StatementLine[] = [];
    const cogs: StatementLine[] = [];
    const expenses: StatementLine[] = [];
    let totalRevenue = Money.zero();
    let totalCogs = Money.zero();
    let totalExpenses = Money.zero();

    for (const [accountCode, bucket] of [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (bucket.type === 'REVENUE') {
        const net = bucket.credit.sub(bucket.debit);
        revenues.push({ accountCode, accountName: bucket.name, balance: net.to2dp() });
        totalRevenue = totalRevenue.add(net);
      } else {
        const net = bucket.debit.sub(bucket.credit);
        const row = { accountCode, accountName: bucket.name, balance: net.to2dp() };
        if (COGS_CODES.has(accountCode)) {
          cogs.push(row);
          totalCogs = totalCogs.add(net);
        } else {
          expenses.push(row);
          totalExpenses = totalExpenses.add(net);
        }
      }
    }

    const grossProfit = totalRevenue.sub(totalCogs);
    const netIncome = grossProfit.sub(totalExpenses);
    return {
      periodId,
      periodName,
      startDate: start,
      endDate: end,
      revenues,
      totalRevenue: totalRevenue.to2dp(),
      cogs,
      totalCogs: totalCogs.to2dp(),
      grossProfit: grossProfit.to2dp(),
      expenses,
      totalExpenses: totalExpenses.to2dp(),
      netIncome: netIncome.to2dp(),
    };
  }

  async getBalanceSheet(params: BalanceSheetParams, tx?: Prisma.TransactionClient): Promise<BalanceSheet> {
    let periodId: string | null = null;
    let periodName: string | null = null;
    let cutoff: Date;
    if (params.periodId) {
      const period = await this.db(tx).fiscalPeriod.findUnique({ where: { id: params.periodId } });
      if (!period) {
        throw new NotFoundError(`Fiscal period "${params.periodId}" not found.`, { periodId: params.periodId });
      }
      periodId = period.id;
      periodName = period.periodName;
      cutoff = period.endDate;
    } else {
      cutoff = validDate(params.asOfDate) ? (params.asOfDate as Date) : new Date();
    }

    const lines = await this.db(tx).journalEntryLine.findMany({
      where: { journalEntry: { status: 'POSTED', postingDate: { lte: cutoff } } },
      include: { account: true },
    });

    const buckets = new Map<string, NominalBucket & { type: string }>();
    for (const line of lines) {
      const type = line.account?.type;
      if (type !== 'ASSET' && type !== 'LIABILITY' && type !== 'EQUITY' && type !== 'REVENUE' && type !== 'EXPENSE') {
        throw new ValidationError(
          `FinancialStatementsService.getBalanceSheet: account ${line.accountCode} has unknown type "${type}".`,
          { accountCode: line.accountCode, type },
        );
      }
      let bucket = buckets.get(line.accountCode);
      if (!bucket) {
        bucket = { name: line.account.name, type, debit: Money.zero(), credit: Money.zero() };
        buckets.set(line.accountCode, bucket);
      }
      bucket.debit = bucket.debit.add(Money.from(line.debit));
      bucket.credit = bucket.credit.add(Money.from(line.credit));
    }

    const assets: StatementLine[] = [];
    const liabilities: StatementLine[] = [];
    const equity: StatementLine[] = [];
    let totalAssets = Money.zero();
    let totalLiabilities = Money.zero();
    let equityAccounts = Money.zero();
    let revenueNets = Money.zero();
    let expenseNets = Money.zero();
    let retainedEarnings = Money.zero();

    for (const [accountCode, bucket] of [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (bucket.type === 'ASSET') {
        const net = bucket.debit.sub(bucket.credit);
        assets.push({ accountCode, accountName: bucket.name, balance: net.to2dp() });
        totalAssets = totalAssets.add(net);
      } else if (bucket.type === 'LIABILITY') {
        const net = bucket.credit.sub(bucket.debit);
        liabilities.push({ accountCode, accountName: bucket.name, balance: net.to2dp() });
        totalLiabilities = totalLiabilities.add(net);
      } else if (bucket.type === 'EQUITY') {
        const net = bucket.credit.sub(bucket.debit);
        equity.push({ accountCode, accountName: bucket.name, balance: net.to2dp() });
        equityAccounts = equityAccounts.add(net);
        if (accountCode === '30100') retainedEarnings = retainedEarnings.add(net);
      } else if (bucket.type === 'REVENUE') {
        revenueNets = revenueNets.add(bucket.credit.sub(bucket.debit));
      } else {
        expenseNets = expenseNets.add(bucket.debit.sub(bucket.credit));
      }
    }

    const currentNetIncome = revenueNets.sub(expenseNets);
    const totalEquity = equityAccounts.add(currentNetIncome);
    const balanced = totalAssets.equals(totalLiabilities.add(totalEquity));
    if (!balanced) {
      throw new ImbalancedStatementsError(
        `Balance sheet does not balance. Assets: ${totalAssets.to2dp()}, Liabilities + Equity: ${totalLiabilities.add(totalEquity).to2dp()}.`,
        {
          totalAssets: totalAssets.to2dp(),
          totalLiabilities: totalLiabilities.to2dp(),
          totalEquity: totalEquity.to2dp(),
        },
      );
    }
    return {
      asOfDate: cutoff,
      periodId,
      periodName,
      assets,
      totalAssets: totalAssets.to2dp(),
      liabilities,
      totalLiabilities: totalLiabilities.to2dp(),
      equity,
      retainedEarnings: retainedEarnings.to2dp(),
      currentNetIncome: currentNetIncome.to2dp(),
      totalEquity: totalEquity.to2dp(),
      balanced: true,
    };
  }
}
