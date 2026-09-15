import { Injectable } from '@nestjs/common';
import type Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';
import type { JournalEntry, JournalEntryLine } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../core/money';
import { LedgerImbalanceError, ValidationError } from '../core/result';
import { TransactionOrchestrator } from '../core/transaction-orchestrator';
import { AuditService } from '../core/audit.service';
import { DocumentNumberService } from '../core/document-number.service';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { FiscalPeriodService } from './fiscal-period.service';

/**
 * TASK BRIEF-010 Stage 2.2 — double-entry posting engine (v3.0 operational ledger).
 *
 * Single choke point for every journal write. Enforces, in order:
 *  1. Structural validity (≥2 lines, known + active accounts, sane amounts).
 *  2. Control-account guard (no MANUAL lines against subledger controls).
 *  3. Strict balance (Σdebit == Σcredit via Money — never floats).
 *  4. Fiscal period gate (auto-create month, must be OPEN).
 *  5. Gapless JRN numbering inside the same transaction as the entry.
 *  6. Atomic persistence (entry + lines in one nested create) + audit trail.
 *
 * Amounts are Strings at rest (Rule ②) and Money in motion. Journal rows
 * are insert-only — corrections happen via ReversalService, never edits.
 */

export interface JournalLineInput {
  accountCode: string;
  debit?: string | number | Decimal | Money;
  credit?: string | number | Decimal | Money;
  memo?: string;
  partyId?: string;
}

export interface PostJournalCommand {
  /** SALE_INVOICE, REPAIR_DELIVERY, RETURN, PAYMENT_VOUCHER, EXPENSE, MANUAL, OPENING_BALANCE */
  documentType: string;
  documentId?: string;
  description: string;
  lines: JournalLineInput[];
  postingDate?: Date;
  actorUserId?: string;
  /** Set ONLY by ReversalService — links this entry as the reversal of another. */
  reversalOfId?: string;
}

interface ParsedLine {
  accountCode: string;
  debit: Money;
  credit: Money;
  memo?: string;
  partyId?: string;
}

function toMoney(value: string | number | Decimal | Money | undefined, what: string): Money {
  if (value === undefined) return Money.zero();
  if (value instanceof Money) return value;
  try {
    return Money.from(value);
  } catch (error) {
    throw new ValidationError(`PostingService.post: ${what} is not a valid amount.`, { value });
  }
}

@Injectable()
export class PostingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: ChartOfAccountsService,
    private readonly periods: FiscalPeriodService,
    private readonly sequences: DocumentNumberService,
    private readonly audit: AuditService,
    private readonly orchestrator: TransactionOrchestrator,
  ) {}

  async post(
    command: PostJournalCommand,
    tx?: Prisma.TransactionClient,
  ): Promise<JournalEntry & { lines: JournalEntryLine[] }> {
    if (!command.documentType || command.documentType.trim().length === 0) {
      throw new ValidationError('PostingService.post: documentType must be a non-empty string.');
    }
    if (!command.description || command.description.trim().length === 0) {
      throw new ValidationError('PostingService.post: description must be a non-empty string.');
    }
    if (!command.lines || command.lines.length < 2) {
      throw new ValidationError(
        `PostingService.post: at least 2 lines are required, got ${command.lines ? command.lines.length : 0}.`,
      );
    }

    const parsed: ParsedLine[] = [];
    for (let index = 0; index < command.lines.length; index += 1) {
      const line = command.lines[index];
      const what = `line ${index + 1} (${line && line.accountCode ? line.accountCode : 'no account'})`;
      if (!line || !line.accountCode || line.accountCode.trim().length === 0) {
        throw new ValidationError(`PostingService.post: ${what} has no accountCode.`);
      }
      const debit = toMoney(line.debit, `${what} debit`);
      const credit = toMoney(line.credit, `${what} credit`);
      if (debit.isNegative() || credit.isNegative()) {
        throw new ValidationError(
          `PostingService.post: ${what} rejects negative amounts (debit ${debit.toString()}, credit ${credit.toString()}).`,
        );
      }
      if (debit.isPositive() && credit.isPositive()) {
        throw new ValidationError(`PostingService.post: ${what} must have either a debit or a credit, not both.`);
      }
      if (debit.isZero() && credit.isZero()) {
        throw new ValidationError(`PostingService.post: ${what} must have a non-zero debit or credit.`);
      }
      // NotFoundError when the code is unknown (fail-fast, friendly message).
      const account = await this.accounts.getAccount(line.accountCode);
      if (!account.isActive) {
        throw new ValidationError(`PostingService.post: account ${account.accountCode} is inactive.`);
      }
      if (account.isControl && command.documentType === 'MANUAL') {
        throw new ValidationError(
          `Direct manual posting to control account ${account.accountCode} is forbidden.`,
        );
      }
      parsed.push({
        accountCode: account.accountCode,
        debit,
        credit,
        memo: line.memo,
        partyId: line.partyId,
      });
    }

    let totalDebit = Money.zero();
    let totalCredit = Money.zero();
    for (const line of parsed) {
      totalDebit = totalDebit.add(line.debit);
      totalCredit = totalCredit.add(line.credit);
    }
    if (!totalDebit.equals(totalCredit)) {
      throw new LedgerImbalanceError(
        `Journal entry is not balanced. Debits: ${totalDebit.to2dp()}, Credits: ${totalCredit.to2dp()}.`,
      );
    }

    const postingDate = command.postingDate ?? new Date();
    if (!(postingDate instanceof Date) || Number.isNaN(postingDate.getTime())) {
      throw new ValidationError('PostingService.post: postingDate must be a valid Date.');
    }

    const persist = async (
      db: Prisma.TransactionClient,
    ): Promise<JournalEntry & { lines: JournalEntryLine[] }> => {
      const period = await this.periods.getOrCreatePeriodForDate(postingDate, db);
      await this.periods.assertPeriodOpenForPosting(period.id, db);
      const entryNumber = await this.sequences.nextNumber('JRN-', db, 6);
      const entry = await db.journalEntry.create({
        data: {
          entryNumber,
          postingDate,
          documentType: command.documentType,
          documentId: command.documentId ?? null,
          description: command.description,
          status: 'POSTED',
          ...(command.reversalOfId ? { reversalOfId: command.reversalOfId } : {}),
          fiscalPeriodId: period.id,
          createdByUserId: command.actorUserId ?? null,
          lines: {
            create: parsed.map((line) => ({
              accountCode: line.accountCode,
              debit: line.debit.to2dp(),
              credit: line.credit.to2dp(),
              memo: line.memo ?? null,
              partyId: line.partyId ?? null,
            })),
          },
        },
        include: { lines: true },
      });
      if (command.actorUserId) {
        await this.audit.record(
          {
            actorUserId: command.actorUserId,
            action: 'JOURNAL.POST',
            entityType: 'JournalEntry',
            entityId: entry.id,
            after: {
              entryNumber: entry.entryNumber,
              documentType: entry.documentType,
              documentId: entry.documentId,
              totalDebit: totalDebit.to2dp(),
              totalCredit: totalCredit.to2dp(),
              reversalOfId: entry.reversalOfId,
            },
          },
          db,
        );
      }
      return entry;
    };

    if (tx) return persist(tx);
    return this.orchestrator.run((otx) => persist(otx), {
      operationName: `journal-post:${command.documentType}`,
    });
  }
}
