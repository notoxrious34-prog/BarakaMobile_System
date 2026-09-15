import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationError } from './result';
import { TransactionOrchestrator } from './transaction-orchestrator';

/**
 * TASK BRIEF-008 Stage 1.2 — atomic document numbering (v3.0 foundation).
 *
 * Successor to the v2.x `Setting`-row counters (`invoice_sequence_next`,
 * `repair_sequence_next`): one `DocumentSequence` row per prefix, advanced
 * by a SINGLE upsert statement (`lastNumber: { increment: 1 }`) inside the
 * caller's transaction — or a fresh orchestrator run when no `tx` is given.
 * Single-statement increment inside SQLite's SERIALIZABLE transactions is
 * what makes the sequence gapless under concurrency; callers MUST pass
 * their outer `tx` so the number and its document commit atomically.
 *
 * Format: `${prefix}${lastNumber padded}` — e.g. `INV-000001`.
 */
@Injectable()
export class DocumentNumberService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly orchestrator?: TransactionOrchestrator,
  ) {}

  async nextNumber(prefix: string, tx?: Prisma.TransactionClient, padding = 6): Promise<string> {
    if (!prefix || prefix.trim().length === 0) {
      throw new ValidationError('DocumentNumberService.nextNumber: prefix must be a non-empty string.');
    }
    if (!Number.isInteger(padding) || padding < 1 || padding > 12) {
      throw new ValidationError('DocumentNumberService.nextNumber: padding must be an integer in [1, 12].');
    }

    const run = async (db: Prisma.TransactionClient): Promise<string> => {
      const row = await db.documentSequence.upsert({
        where: { prefix },
        update: { lastNumber: { increment: 1 } },
        create: { prefix, lastNumber: 1 },
      });
      return `${prefix}${String(row.lastNumber).padStart(padding, '0')}`;
    };

    if (tx) return run(tx);
    if (this.orchestrator) {
      return this.orchestrator.run((otx) => run(otx), { operationName: `docseq:${prefix}` });
    }
    return this.prisma.$transaction((otx) => run(otx));
  }
}
