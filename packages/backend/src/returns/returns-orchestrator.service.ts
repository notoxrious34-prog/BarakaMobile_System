import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BusinessDocument, DocumentLine, JournalEntry, JournalEntryLine, SerializedItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../core/money';
import { ConflictError, NotFoundError, ValidationError } from '../core/result';
import { TransactionOrchestrator } from '../core/transaction-orchestrator';
import { IdempotencyEngine } from '../core/idempotency';
import { DocumentNumberService } from '../core/document-number.service';
import { AuditService } from '../core/audit.service';
import { InventoryDomainService } from '../inventory/inventory-domain.service';
import { SerializedInventoryService, SERIAL_STATUS } from '../inventory/serialized-inventory.service';
import { PostingService } from '../accounting/posting.service';
import { PartySubledgerService } from '../parties/party-subledger.service';

/**
 * TASK BRIEF-015 Stage 5.2 — sales return orchestrator (v3.0 business engine).
 *
 * Executes a complete customer return inside ONE interactive transaction:
 * original-sale validation → quantity guard against prior returns →
 * refund/cost math → RET numbering → restock (saleable only) → return
 * document (linked via `reversalDocumentId`) → balanced GL journal
 * (revenue reversal, refund leg, COGS reversal) → subledger leg for
 * credit reductions → audit.
 *
 * Design notes (literal brief compliance):
 *  - One return document per original sale: `reversalDocumentId` is
 *    @unique by schema. A second return attempt surfaces the database
 *    unique violation. A future `ReturnLink` table would lift this.
 *  - DEFECTIVE bulk units never re-enter saleable stock (v2.9.2
 *    quarantine semantics); their cost stays expensed.
 *  - Serialized cost recovery counts only units that actually return to
 *    IN_STOCK (DEFECTIVE outcomes keep their cost in COGS).
 */

export interface ReturnLineItemInput {
  /** ID of the original sale's DocumentLine being returned. */
  documentLineId: string;
  quantity: number;
  condition: 'RESTOCKED_INVENTORY' | 'DEFECTIVE_QUARANTINE';
}

export interface ExecuteSalesReturnCommand {
  originalDocumentId: string;
  lines: ReturnLineItemInput[];
  refundMethod: 'CASH' | 'BANK_TRANSFER' | 'CUSTOMER_CREDIT_REDUCTION';
  reason: string;
  actorUserId?: string;
  idempotencyKey?: string;
}

export interface ReturnExecutionResult {
  returnDocument: BusinessDocument;
  lines: DocumentLine[];
  journalEntryId: string;
  journalNumber: string;
}

export interface ReturnDetailsResult {
  document: BusinessDocument;
  lines: Array<DocumentLine & { serial: SerializedItem | null }>;
  journalEntry: (JournalEntry & { lines: JournalEntryLine[] }) | null;
}

const REFUND_ACCOUNT: Record<string, string> = {
  CASH: '10000',
  BANK_TRANSFER: '10200',
  CUSTOMER_CREDIT_REDUCTION: '11000',
};

const REVENUE_SALES = '40000';
const COGS_DEVICES = '50000';
const INVENTORY_ON_HAND = '12000';
const AR_CONTROL = '11000';

interface ValidatedReturnLine {
  originalLine: DocumentLine;
  quantity: number;
  condition: 'RESTOCKED_INVENTORY' | 'DEFECTIVE_QUARANTINE';
  refund: Money;
  costShare: Money;
}

function unwrapReplay(response: unknown): ReturnExecutionResult {
  if (response && typeof response === 'object' && 'body' in response) {
    const body = (response as { body: unknown }).body;
    if (body && typeof body === 'object' && 'returnDocument' in body) {
      return body as ReturnExecutionResult;
    }
  }
  return response as ReturnExecutionResult;
}

@Injectable()
export class ReturnsOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: TransactionOrchestrator,
    private readonly idempotency: IdempotencyEngine,
    private readonly sequences: DocumentNumberService,
    private readonly inventory: InventoryDomainService,
    private readonly serials: SerializedInventoryService,
    private readonly posting: PostingService,
    private readonly subledger: PartySubledgerService,
    private readonly audit: AuditService,
  ) {}

  async executeSalesReturn(
    command: ExecuteSalesReturnCommand,
    outerTx?: Prisma.TransactionClient,
  ): Promise<ReturnExecutionResult> {
    let begunKey: string | null = null;
    if (command.idempotencyKey) {
      if (command.idempotencyKey.trim().length === 0) {
        throw new ValidationError('ReturnsOrchestratorService.executeSalesReturn: idempotencyKey must be a non-empty string.');
      }
      const attempt = await this.idempotency.begin(command.idempotencyKey, 'return.execute');
      if (attempt.isReplay) return unwrapReplay(attempt.response);
      begunKey = command.idempotencyKey;
    }
    if (!command.reason || command.reason.trim().length === 0) {
      throw new ValidationError('ReturnsOrchestratorService.executeSalesReturn: reason must be a non-empty string.');
    }
    if (!REFUND_ACCOUNT[command.refundMethod]) {
      throw new ValidationError(
        `ReturnsOrchestratorService.executeSalesReturn: unknown refundMethod "${command.refundMethod}".`,
      );
    }

    const run = async (tx: Prisma.TransactionClient): Promise<ReturnExecutionResult> => {
      // --- 2. Original document validation ---
      if (!command.originalDocumentId || command.originalDocumentId.trim().length === 0) {
        throw new ValidationError('ReturnsOrchestratorService.executeSalesReturn: originalDocumentId is required.');
      }
      const original = await tx.businessDocument.findUnique({
        where: { id: command.originalDocumentId },
        include: { lines: true, payments: true, party: true },
      });
      if (!original) {
        throw new NotFoundError(`Original document "${command.originalDocumentId}" not found.`, {
          originalDocumentId: command.originalDocumentId,
        });
      }
      if (original.type !== 'SALE_INVOICE') {
        throw new ValidationError(
          `Only SALE_INVOICE documents can be returned (got ${original.type}).`,
          { originalDocumentId: original.id },
        );
      }
      if (original.status !== 'POSTED') {
        throw new ConflictError(
          `Original document ${original.documentNumber} is ${original.status} and cannot be returned.`,
          { originalDocumentId: original.id, status: original.status },
        );
      }

      // --- 3. Line validation with prior-return guard ---
      if (!command.lines || command.lines.length < 1) {
        throw new ValidationError('ReturnsOrchestratorService.executeSalesReturn: at least 1 line is required.');
      }
      const priorReturns = await tx.businessDocument.findMany({
        where: { type: 'SALES_RETURN', reversalDocumentId: original.id },
        include: { lines: true },
      });
      const alreadyReturned = new Map<string, number>();
      for (const prior of priorReturns) {
        for (const line of prior.lines) {
          const key = `${line.itemId}|${line.serialId ?? ''}`;
          alreadyReturned.set(key, (alreadyReturned.get(key) ?? 0) + line.quantity);
        }
      }
      const validated: ValidatedReturnLine[] = [];
      for (let index = 0; index < command.lines.length; index += 1) {
        const line = command.lines[index];
        const what = `return line ${index + 1}`;
        const originalLine = original.lines.find((candidate) => candidate.id === line.documentLineId);
        if (!originalLine) {
          throw new ValidationError(
            `ReturnsOrchestratorService.executeSalesReturn: ${what} references unknown document line "${line.documentLineId}".`,
          );
        }
        if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
          throw new ValidationError(
            `ReturnsOrchestratorService.executeSalesReturn: ${what} quantity must be a positive integer.`,
          );
        }
        if (line.condition !== 'RESTOCKED_INVENTORY' && line.condition !== 'DEFECTIVE_QUARANTINE') {
          throw new ValidationError(
            `ReturnsOrchestratorService.executeSalesReturn: ${what} condition must be RESTOCKED_INVENTORY or DEFECTIVE_QUARANTINE.`,
          );
        }
        const key = `${originalLine.itemId}|${originalLine.serialId ?? ''}`;
        const returned = alreadyReturned.get(key) ?? 0;
        if (returned + line.quantity > originalLine.quantity) {
          throw new ValidationError(
            `ReturnsOrchestratorService.executeSalesReturn: ${what} quantity ${line.quantity} exceeds remaining ${originalLine.quantity - returned} (original ${originalLine.quantity}, already returned ${returned}).`,
          );
        }
        if (originalLine.serialId) {
          const serial = await tx.serializedItem.findUnique({ where: { id: originalLine.serialId } });
          if (!serial) {
            throw new NotFoundError(`Serialized device "${originalLine.serialId}" not found.`, {
              serialId: originalLine.serialId,
            });
          }
          if (serial.currentStatus !== SERIAL_STATUS.SOLD) {
            throw new ConflictError(
              `Device ${serial.imei1} must be SOLD to accept a return (current: ${serial.currentStatus}).`,
              { serialId: serial.id, status: serial.currentStatus },
            );
          }
        }
        validated.push({
          originalLine,
          quantity: line.quantity,
          condition: line.condition,
          refund: Money.from(originalLine.unitPrice).mul(line.quantity),
          costShare: Money.from(originalLine.unitCost).mul(line.quantity),
        });
      }

      // --- 4. Refund totals (cost recovery filtered at restock time) ---
      let totalRefund = Money.zero();
      for (const line of validated) {
        totalRefund = totalRefund.add(line.refund);
      }

      // --- 5. Document number ---
      const returnNumber = await this.sequences.nextNumber('RET-', tx, 6);

      // --- 6. Stock & serial restock ---
      let restockedCost = Money.zero();
      for (const line of validated) {
        if (line.originalLine.serialId) {
          const device = await this.serials.restockFromReturn(
            {
              serialId: line.originalLine.serialId,
              returnDocumentId: returnNumber,
              condition: line.condition,
              actorUserId: command.actorUserId,
            },
            tx,
          );
          if (device.currentStatus === SERIAL_STATUS.IN_STOCK) {
            restockedCost = restockedCost.add(line.costShare);
          }
        } else if (line.condition === 'RESTOCKED_INVENTORY') {
          await this.inventory.receiveStock(
            {
              itemId: line.originalLine.itemId,
              quantity: line.quantity,
              unitCost: Money.from(line.originalLine.unitCost),
              referenceType: 'RETURN',
              referenceId: returnNumber,
            },
            tx,
          );
          restockedCost = restockedCost.add(line.costShare);
        }
        // DEFECTIVE_QUARANTINE bulk units stay out of saleable stock by design.
      }

      // --- 7. Persist return document ---
      const returnDocument = await tx.businessDocument.create({
        data: {
          documentNumber: returnNumber,
          type: 'SALES_RETURN',
          partyId: original.partyId,
          status: 'POSTED',
          subtotalAmount: totalRefund.to2dp(),
          discountAmount: '0.00',
          totalAmount: totalRefund.to2dp(),
          paidAmount: totalRefund.to2dp(),
          outstandingAmount: '0.00',
          reversalDocumentId: original.id,
          lines: {
            create: validated.map((line) => ({
              itemId: line.originalLine.itemId,
              serialId: line.originalLine.serialId,
              quantity: line.quantity,
              unitCost: line.originalLine.unitCost,
              unitPrice: line.originalLine.unitPrice,
              lineTotal: line.refund.to2dp(),
            })),
          },
          payments: {},
        },
        include: { lines: true, payments: true },
      });

      // --- 8. Double-entry journal ---
      const legs: Array<{ accountCode: string; debit?: string; credit?: string; partyId?: string }> = [];
      if (totalRefund.isPositive()) {
        legs.push({ accountCode: REVENUE_SALES, debit: totalRefund.to2dp() });
        const creditLeg: { accountCode: string; credit: string; partyId?: string } = {
          accountCode: REFUND_ACCOUNT[command.refundMethod],
          credit: totalRefund.to2dp(),
        };
        if (command.refundMethod === 'CUSTOMER_CREDIT_REDUCTION') {
          if (!original.partyId) {
            throw new ValidationError(
              'CUSTOMER_CREDIT_REDUCTION requires a registered customer on the original sale.',
              { originalDocumentId: original.id },
            );
          }
          creditLeg.partyId = original.partyId;
        }
        legs.push(creditLeg);
      }
      if (restockedCost.isPositive()) {
        legs.push({ accountCode: INVENTORY_ON_HAND, debit: restockedCost.to2dp() });
        legs.push({ accountCode: COGS_DEVICES, credit: restockedCost.to2dp() });
      }
      let journalEntryId = '';
      let journalNumber = '';
      if (legs.length >= 2) {
        const posted = await this.posting.post(
          {
            documentType: 'RETURN',
            documentId: returnDocument.id,
            description: `Sales return ${returnNumber} of ${original.documentNumber}: ${command.reason.trim()}`,
            lines: legs,
            postingDate: new Date(),
            actorUserId: command.actorUserId,
          },
          tx,
        );
        journalEntryId = posted.id;
        journalNumber = posted.entryNumber;
        // --- 9. Customer subledger leg off the AR journal line ---
        if (command.refundMethod === 'CUSTOMER_CREDIT_REDUCTION' && original.partyId) {
          const arLeg = posted.lines.find((line) => line.accountCode === AR_CONTROL);
          if (!arLeg) {
            throw new ValidationError('Return journal is missing its AR leg.', { journalEntryId: posted.id });
          }
          await this.subledger.recordSubledgerEntry(
            {
              partyId: original.partyId,
              journalLineId: arLeg.id,
              entryType: 'RETURN_CREDIT',
              amount: totalRefund,
              isDebit: false,
              actorUserId: command.actorUserId,
            },
            tx,
          );
        }
      }

      // --- 10. Audit trail ---
      await this.audit.record(
        {
          actorUserId: command.actorUserId,
          action: 'RETURN.EXECUTE',
          entityType: 'BusinessDocument',
          entityId: returnDocument.id,
          after: {
            returnNumber,
            originalDocumentNumber: original.documentNumber,
            totalRefund: totalRefund.to2dp(),
            restockedCost: restockedCost.to2dp(),
            refundMethod: command.refundMethod,
            reason: command.reason.trim(),
            journalNumber,
          },
        },
        tx,
      );

      return { returnDocument, lines: returnDocument.lines, journalEntryId, journalNumber };
    };

    try {
      const result = outerTx
        ? await run(outerTx)
        : await this.orchestrator.run((otx) => run(otx), { operationName: 'return.execute' });
      if (begunKey) {
        await this.idempotency.commit(begunKey, result);
      }
      return result;
    } catch (error) {
      if (begunKey) {
        await this.idempotency.rollback(begunKey);
      }
      throw error;
    }
  }

  /**
   * DIRECTIVE-018 Stage 9.1 — return read model for `GET /api/v3/returns/:id`.
   *
   * Return document with lines (each carrying its serial, if any) and the
   * POSTED journal entry linked via `documentId`. Read-only: joins the
   * caller tx or reads directly.
   */
  async getReturnDetails(documentId: string, tx?: Prisma.TransactionClient): Promise<ReturnDetailsResult> {
    if (!documentId || documentId.trim().length === 0) {
      throw new ValidationError('ReturnsOrchestratorService.getReturnDetails: documentId must be a non-empty string.');
    }
    const db = tx ?? (this.prisma as unknown as Prisma.TransactionClient);
    const document = await db.businessDocument.findUnique({
      where: { id: documentId },
      include: { lines: { include: { serial: true } } },
    });
    if (!document || document.type !== 'SALES_RETURN') {
      throw new NotFoundError(`Return document "${documentId}" not found.`, { documentId });
    }
    const journalEntry = await db.journalEntry.findFirst({
      where: { documentId: document.id, status: 'POSTED' },
      include: { lines: true },
    });
    return { document, lines: document.lines, journalEntry };
  }
}
