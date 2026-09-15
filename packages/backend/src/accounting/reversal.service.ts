import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { JournalEntry, JournalEntryLine } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictError, NotFoundError, ValidationError } from '../core/result';
import { TransactionOrchestrator } from '../core/transaction-orchestrator';
import { PostingService } from './posting.service';

/**
 * TASK BRIEF-010 Stage 2.2 — journal reversals (v3.0 operational ledger).
 *
 * Corrections are new balanced entries, never edits: the reversal mirrors
 * every original line (debit↔credit, same accounts/memos/partyIds), links
 * `reversalOfId`, and flips the original to REVERSED — all inside ONE
 * transaction. The reversal posts into the CURRENT open period; the
 * original stays in its own period (audit trail preserved on both sides).
 * Reversals route through PostingService, so balance, period-gate,
 * numbering and audit invariants hold identically.
 */
@Injectable()
export class ReversalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: PostingService,
    private readonly orchestrator: TransactionOrchestrator,
  ) {}

  async reverse(
    journalEntryId: string,
    reason: string,
    actorUserId?: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<JournalEntry & { lines: JournalEntryLine[] }> {
    if (!journalEntryId || journalEntryId.trim().length === 0) {
      throw new ValidationError('ReversalService.reverse: journalEntryId must be a non-empty string.');
    }
    if (!reason || reason.trim().length === 0) {
      throw new ValidationError('ReversalService.reverse: reason must be a non-empty string.');
    }

    const run = async (
      tx: Prisma.TransactionClient,
    ): Promise<JournalEntry & { lines: JournalEntryLine[] }> => {
      const original = await tx.journalEntry.findUnique({
        where: { id: journalEntryId },
        include: { lines: true },
      });
      if (!original) {
        throw new NotFoundError(`Journal entry "${journalEntryId}" not found.`, { journalEntryId });
      }
      if (original.status !== 'POSTED') {
        throw new ConflictError(
          `Journal entry ${original.entryNumber} is ${original.status} and cannot be reversed.`,
          { journalEntryId, status: original.status },
        );
      }
      const reversal = await this.posting.post(
        {
          documentType: original.documentType,
          documentId: original.documentId ?? undefined,
          description: `Reversal of ${original.entryNumber}: ${reason.trim()}`,
          lines: original.lines.map((line) => ({
            accountCode: line.accountCode,
            debit: line.credit,
            credit: line.debit,
            memo: line.memo ?? undefined,
            partyId: line.partyId ?? undefined,
          })),
          postingDate: new Date(),
          actorUserId,
          reversalOfId: original.id,
        },
        tx,
      );
      await tx.journalEntry.update({ where: { id: original.id }, data: { status: 'REVERSED' } });
      return reversal;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `journal-reverse:${journalEntryId}` });
  }
}
