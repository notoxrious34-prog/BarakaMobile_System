import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ChartOfAccount } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError, ValidationError } from '../core/result';

/**
 * TASK BRIEF-009 Stage 2.1 — Chart of Accounts (v3.0 double-entry foundation).
 *
 * The 25-code skeleton (codes + class groupings) is mandated by
 * TASK BRIEF-009 §2. NOTE — SPEC-BM3-001 §3.1 is not present anywhere in
 * the repository (verified by repo-wide search), so account NAMES,
 * normal-balance assignments and control flags below are derived from the
 * v2.9.2 domain (cash drawer, Flexy float, AR/AP ledgers, inventory,
 * IMEI devices, repair workshop, owner current account). Treat this table
 * as the Architect's review surface: rename freely before first production
 * posting — codes are the stable identifiers.
 *
 * Control-account convention: 11000 (AR) and 20000 (AP) mirror the
 * customer/supplier subledgers. Stage 2.2 journal posting must reject
 * MANUAL lines against control accounts.
 *
 * Stage 6.2 adds 12300 (Repair Work in Progress): the IAS 2 WIP clearing
 * account for workshop part consumption (Dr on consume, Cr on delivery
 * into COGS or on cancellation back into spares). It is a plain posting
 * account, never a control.
 */

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type NormalBalance = 'DEBIT' | 'CREDIT';

export interface StandardAccountDef {
  accountCode: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
  isControl: boolean;
}

const A = (accountCode: string, name: string, isControl = false): StandardAccountDef => ({
  accountCode,
  name,
  type: 'ASSET',
  normalBalance: 'DEBIT',
  isControl,
});
const L = (accountCode: string, name: string, isControl = false): StandardAccountDef => ({
  accountCode,
  name,
  type: 'LIABILITY',
  normalBalance: 'CREDIT',
  isControl,
});
const E = (accountCode: string, name: string): StandardAccountDef => ({
  accountCode,
  name,
  type: 'EQUITY',
  normalBalance: 'CREDIT',
  isControl: false,
});
const R = (accountCode: string, name: string): StandardAccountDef => ({
  accountCode,
  name,
  type: 'REVENUE',
  normalBalance: 'CREDIT',
  isControl: false,
});
const X = (accountCode: string, name: string): StandardAccountDef => ({
  accountCode,
  name,
  type: 'EXPENSE',
  normalBalance: 'DEBIT',
  isControl: false,
});

export const STANDARD_ACCOUNTS: readonly StandardAccountDef[] = [
  // Assets (9: the Stage 2.1 eight plus 12300 Repair WIP from Stage 6.2)
  A('10000', 'Cash on Hand — Register Drawer'),
  A('10100', 'Digital Wallets Float'),
  A('10200', 'Bank & External Accounts'),
  A('10300', 'Owner Advances Receivable'),
  A('11000', 'Accounts Receivable — Customers', true),
  A('12000', 'Inventory on Hand'),
  A('12100', 'Serialized Devices in Stock'),
  A('12200', 'Spare Parts Stock'),
  A('12300', 'Repair Work in Progress'),
  // Liabilities (3)
  L('20000', 'Accounts Payable — Suppliers', true),
  L('21000', 'Customer Deposits & Store Credit'),
  L('22000', 'Due to Owner'),
  // Equity (4)
  E('30000', 'Owner Capital'),
  E('30100', 'Opening Balance Equity'),
  E('30200', 'Current Year Earnings'),
  E('30300', 'Retained Earnings'),
  // Revenue (5)
  R('40000', 'Sales Revenue — Devices & Accessories'),
  R('40100', 'Service & Commission Revenue'),
  R('40200', 'Repair Labor Revenue'),
  R('40300', 'Flexy & Digital Margin Revenue'),
  R('40400', 'Other Income'),
  // Expenses (5)
  X('50000', 'Cost of Goods Sold — Devices'),
  X('50100', 'Cost of Repair Parts Consumed'),
  X('50200', 'Operating Expenses'),
  X('50300', 'External Repair Costs'),
  X('50400', 'Salaries, Rent & Utilities'),
];

const ACCOUNT_TYPES: readonly AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

@Injectable()
export class ChartOfAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent seed: upserts all standard accounts (names/flags refresh
   * on re-run; ledger history untouched). Returns the ensured total.
   */
  async seedStandardAccounts(tx?: Prisma.TransactionClient): Promise<number> {
    const db: Prisma.TransactionClient = tx ?? (this.prisma as unknown as Prisma.TransactionClient);
    for (const account of STANDARD_ACCOUNTS) {
      await db.chartOfAccount.upsert({
        where: { accountCode: account.accountCode },
        update: {
          name: account.name,
          type: account.type,
          normalBalance: account.normalBalance,
          isControl: account.isControl,
          isActive: true,
        },
        create: {
          accountCode: account.accountCode,
          name: account.name,
          type: account.type,
          normalBalance: account.normalBalance,
          isControl: account.isControl,
          isActive: true,
        },
      });
    }
    return STANDARD_ACCOUNTS.length;
  }

  async getAccount(code: string): Promise<ChartOfAccount> {
    if (!code || code.trim().length === 0) {
      throw new ValidationError('ChartOfAccountsService.getAccount: code must be a non-empty string.');
    }
    const account = await this.prisma.chartOfAccount.findUnique({ where: { accountCode: code } });
    if (!account) {
      throw new NotFoundError(`Chart of accounts has no account "${code}".`, { accountCode: code });
    }
    return account;
  }

  async listAccounts(type?: string): Promise<ChartOfAccount[]> {
    let where: { type?: string } = {};
    if (type !== undefined) {
      const normalized = type.trim().toUpperCase();
      if (!ACCOUNT_TYPES.includes(normalized as AccountType)) {
        throw new ValidationError(
          `ChartOfAccountsService.listAccounts: unknown type "${type}" (expected one of ${ACCOUNT_TYPES.join(', ')}).`,
        );
      }
      where = { type: normalized };
    }
    return this.prisma.chartOfAccount.findMany({ where, orderBy: { accountCode: 'asc' } });
  }

  async isControlAccount(code: string): Promise<boolean> {
    return (await this.getAccount(code)).isControl;
  }
}
