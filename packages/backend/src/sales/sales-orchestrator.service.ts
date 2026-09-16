import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BusinessDocument, CatalogItem, DocumentLine, JournalEntry, JournalEntryLine, PaymentAllocation, SerializedItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../core/money';
import { ConflictError, NotFoundError, ValidationError } from '../core/result';
import { TransactionOrchestrator } from '../core/transaction-orchestrator';
import { IdempotencyEngine } from '../core/idempotency';
import { DocumentNumberService } from '../core/document-number.service';
import { AuditService } from '../core/audit.service';
import { InventoryDomainService } from '../inventory/inventory-domain.service';
import { SerializedInventoryService } from '../inventory/serialized-inventory.service';
import { PostingService } from '../accounting/posting.service';
import { PartiesService } from '../parties/parties.service';
import { PartySubledgerService } from '../parties/party-subledger.service';

/**
 * TASK BRIEF-014 Stage 5.1 — POS sales orchestrator (v3.0 business engine).
 *
 * Executes a complete counter sale inside ONE interactive transaction:
 * validation → totals → INV numbering → stock/serial mutation with cost
 * capture → document persistence → balanced GL journal (cash/wallet/bank,
 * AR, revenue, COGS/inventory) → customer subledger leg → audit.
 *
 * Anything throws → everything rolls back (single orchestrator run).
 * Retried submissions carry an `idempotencyKey`: the first execution's
 * result is cached and replayed verbatim — no duplicate stock, journal,
 * or subledger writes.
 *
 * Posting map (Stage 2.1 COA): CASH→10000, DIGITAL_WALLET→10100,
 * BANK_TRANSFER→10200, receivable→11000, revenue→40000,
 * COGS→50000 / inventory→12000. DIGITAL_WALLET legs record the drawer
 * float only — wallet-provider settlement arrives in a later stage
 * (`walletId` stays null until then).
 */

export interface SaleLineItemInput {
  itemId: string;
  serialId?: string;
  quantity: number;
  unitPrice: string | Money;
}

export interface PaymentSplitInput {
  paymentMethod: 'CASH' | 'DIGITAL_WALLET' | 'BANK_TRANSFER';
  amount: string | Money;
}

export interface ExecuteSaleCommand {
  partyId?: string;
  lines: SaleLineItemInput[];
  discountAmount?: string | Money;
  payments: PaymentSplitInput[];
  actorUserId?: string;
  idempotencyKey?: string;
}

export interface SaleExecutionResult {
  document: BusinessDocument;
  lines: DocumentLine[];
  payments: PaymentAllocation[];
  journalEntryId: string;
  journalNumber: string;
}

export interface SaleDetailsResult {
  document: BusinessDocument;
  lines: Array<DocumentLine & { serial: SerializedItem | null }>;
  payments: PaymentAllocation[];
  journalEntry: (JournalEntry & { lines: JournalEntryLine[] }) | null;
}

const PAYMENT_ACCOUNT: Record<string, string> = {
  CASH: '10000',
  DIGITAL_WALLET: '10100',
  BANK_TRANSFER: '10200',
};

const AR_CONTROL = '11000';
const REVENUE_SALES = '40000';
const COGS_DEVICES = '50000';
const INVENTORY_ON_HAND = '12000';

interface ValidatedSaleLine {
  item: CatalogItem;
  serial: SerializedItem | null;
  quantity: number;
  price: Money;
  lineTotal: Money;
}

interface ValidatedPayment {
  method: string;
  amount: Money;
}

function toMoney(value: string | Money, what: string): Money {
  if (value instanceof Money) return value;
  try {
    return Money.from(value);
  } catch {
    throw new ValidationError(`SalesOrchestratorService: ${what} is not a valid amount.`, { value });
  }
}

/** Unwraps an idempotency envelope back to the cached execution result. */
function unwrapReplay(response: unknown): SaleExecutionResult {
  if (response && typeof response === 'object' && 'body' in response) {
    const body = (response as { body: unknown }).body;
    if (body && typeof body === 'object' && 'document' in body) {
      return body as SaleExecutionResult;
    }
  }
  return response as SaleExecutionResult;
}

@Injectable()
export class SalesOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: TransactionOrchestrator,
    private readonly idempotency: IdempotencyEngine,
    private readonly sequences: DocumentNumberService,
    private readonly inventory: InventoryDomainService,
    private readonly serials: SerializedInventoryService,
    private readonly posting: PostingService,
    private readonly parties: PartiesService,
    private readonly subledger: PartySubledgerService,
    private readonly audit: AuditService,
  ) {}

  async executeSale(command: ExecuteSaleCommand, outerTx?: Prisma.TransactionClient): Promise<SaleExecutionResult> {
    let begunKey: string | null = null;
    if (command.idempotencyKey) {
      if (command.idempotencyKey.trim().length === 0) {
        throw new ValidationError('SalesOrchestratorService.executeSale: idempotencyKey must be a non-empty string.');
      }
      const attempt = await this.idempotency.begin(command.idempotencyKey, 'sale.execute');
      if (attempt.isReplay) return unwrapReplay(attempt.response);
      begunKey = command.idempotencyKey;
    }

    const run = async (tx: Prisma.TransactionClient): Promise<SaleExecutionResult> => {
      // --- 2. Line validation (snapshot reads inside the tx) ---
      if (!command.lines || command.lines.length < 1) {
        throw new ValidationError('SalesOrchestratorService.executeSale: at least 1 line is required.');
      }
      if (!Array.isArray(command.payments)) {
        throw new ValidationError('SalesOrchestratorService.executeSale: payments must be an array.');
      }
      const validated: ValidatedSaleLine[] = [];
      for (let index = 0; index < command.lines.length; index += 1) {
        const line = command.lines[index];
        const what = `line ${index + 1}`;
        if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
          throw new ValidationError(
            `SalesOrchestratorService.executeSale: ${what} quantity must be a positive integer.`,
          );
        }
        const price = toMoney(line.unitPrice, `${what} unitPrice`);
        if (price.isNegative()) {
          throw new ValidationError(`SalesOrchestratorService.executeSale: ${what} unitPrice must be >= 0.`);
        }
        const item = await tx.catalogItem.findUnique({ where: { id: line.itemId } });
        if (!item) {
          throw new NotFoundError(`Catalog item "${line.itemId}" not found.`, { itemId: line.itemId });
        }
        if (!item.isActive) {
          throw new ValidationError(`Catalog item ${item.sku} is inactive.`, { itemId: item.id });
        }
        let serial: SerializedItem | null = null;
        if (item.isSerialized) {
          if (line.quantity !== 1) {
            throw new ValidationError(
              `SalesOrchestratorService.executeSale: serialized line ${item.sku} quantity must be exactly 1.`,
            );
          }
          if (!line.serialId) {
            throw new ValidationError(
              `SalesOrchestratorService.executeSale: serialized line ${item.sku} requires a serialId.`,
            );
          }
          serial = await tx.serializedItem.findUnique({ where: { id: line.serialId } });
          if (!serial) {
            throw new NotFoundError(`Serialized device "${line.serialId}" not found.`, { serialId: line.serialId });
          }
          if (serial.itemId !== item.id) {
            throw new ValidationError(
              `Serial ${serial.imei1} does not belong to item ${item.sku}.`,
              { serialId: serial.id, itemId: item.id },
            );
          }
        } else if (line.serialId) {
          throw new ValidationError(
            `SalesOrchestratorService.executeSale: non-serialized line ${item.sku} must not carry a serialId.`,
          );
        }
        validated.push({ item, serial, quantity: line.quantity, price, lineTotal: price.mul(line.quantity) });
      }

      // --- 3. Financial totals (exact Money math) ---
      let subtotal = Money.zero();
      for (const line of validated) {
        subtotal = subtotal.add(line.lineTotal);
      }
      const discount = toMoney(command.discountAmount ?? '0.00', 'discountAmount');
      if (discount.isNegative()) {
        throw new ValidationError('SalesOrchestratorService.executeSale: discountAmount must be >= 0.');
      }
      if (discount.greaterThan(subtotal)) {
        throw new ValidationError(
          `SalesOrchestratorService.executeSale: discount ${discount.to2dp()} exceeds subtotal ${subtotal.to2dp()}.`,
        );
      }
      const total = subtotal.sub(discount);

      const validatedPayments: ValidatedPayment[] = [];
      for (let index = 0; index < command.payments.length; index += 1) {
        const payment = command.payments[index];
        if (!PAYMENT_ACCOUNT[payment.paymentMethod]) {
          throw new ValidationError(
            `SalesOrchestratorService.executeSale: payment ${index + 1} has unknown method "${payment.paymentMethod}".`,
          );
        }
        const amount = toMoney(payment.amount, `payment ${index + 1} amount`);
        if (amount.isNegative()) {
          throw new ValidationError(`SalesOrchestratorService.executeSale: payment ${index + 1} amount must be >= 0.`);
        }
        validatedPayments.push({ method: payment.paymentMethod, amount });
      }
      let paid = Money.zero();
      for (const payment of validatedPayments) {
        paid = paid.add(payment.amount);
      }
      if (paid.greaterThan(total)) {
        throw new ValidationError('Overpayment is not permitted in POS sale.');
      }
      const outstanding = total.sub(paid);
      if (outstanding.isPositive() && !command.partyId) {
        throw new ValidationError('A registered customer (partyId) is required for credit sales.');
      }
      const party = command.partyId ? await this.parties.getParty(command.partyId, tx) : null;

      // --- 4. Document number ---
      const documentNumber = await this.sequences.nextNumber('INV-', tx, 6);

      // --- 5. Stock mutations with cost capture (reference = document number) ---
      const unitCosts: Money[] = [];
      for (const line of validated) {
        if (line.serial) {
          await this.serials.attachToSale({ serialId: line.serial.id, saleDocumentId: documentNumber }, tx);
          unitCosts.push(await this.serials.getAcquisitionCost(line.serial.id, tx));
        } else {
          const movement = await this.inventory.issueStock(
            { itemId: line.item.id, quantity: line.quantity, referenceType: 'SALE', referenceId: documentNumber },
            tx,
          );
          unitCosts.push(Money.from(movement.unitCost));
        }
      }
      let totalCost = Money.zero();
      for (let index = 0; index < validated.length; index += 1) {
        totalCost = totalCost.add(unitCosts[index].mul(validated[index].quantity));
      }

      // --- 6. Persist document + lines + payments ---
      const document = await tx.businessDocument.create({
        data: {
          documentNumber,
          type: 'SALE_INVOICE',
          partyId: party ? party.id : null,
          status: 'POSTED',
          subtotalAmount: subtotal.to2dp(),
          discountAmount: discount.to2dp(),
          totalAmount: total.to2dp(),
          paidAmount: paid.to2dp(),
          outstandingAmount: outstanding.to2dp(),
          lines: {
            create: validated.map((line, index) => ({
              itemId: line.item.id,
              serialId: line.serial ? line.serial.id : null,
              quantity: line.quantity,
              unitCost: unitCosts[index].to2dp(),
              unitPrice: line.price.to2dp(),
              lineTotal: line.lineTotal.to2dp(),
            })),
          },
          payments: {
            create: validatedPayments.map((payment) => ({
              paymentMethod: payment.method,
              amount: payment.amount.to2dp(),
              walletId: null,
            })),
          },
        },
        include: { lines: true, payments: true },
      });

      // --- 7. Double-entry journal ---
      const legs: Array<{ accountCode: string; debit?: string; credit?: string; partyId?: string }> = [];
      for (const payment of validatedPayments) {
        if (payment.amount.isPositive()) {
          legs.push({ accountCode: PAYMENT_ACCOUNT[payment.method], debit: payment.amount.to2dp() });
        }
      }
      if (outstanding.isPositive() && party) {
        legs.push({ accountCode: AR_CONTROL, debit: outstanding.to2dp(), partyId: party.id });
      }
      if (total.isPositive()) {
        legs.push({ accountCode: REVENUE_SALES, credit: total.to2dp() });
      }
      if (totalCost.isPositive()) {
        legs.push({ accountCode: COGS_DEVICES, debit: totalCost.to2dp() });
        legs.push({ accountCode: INVENTORY_ON_HAND, credit: totalCost.to2dp() });
      }
      let journalEntryId = '';
      let journalNumber = '';
      if (legs.length >= 2) {
        const posted = await this.posting.post(
          {
            documentType: 'SALE_INVOICE',
            documentId: document.id,
            description: `POS sale ${documentNumber}${party ? ` — ${party.name}` : ''}`,
            lines: legs,
            postingDate: new Date(),
            actorUserId: command.actorUserId,
          },
          tx,
        );
        journalEntryId = posted.id;
        journalNumber = posted.entryNumber;
        // --- 8. Customer subledger leg off the AR journal line ---
        if (outstanding.isPositive() && party) {
          const arLeg = posted.lines.find((line) => line.accountCode === AR_CONTROL);
          if (!arLeg) {
            throw new ConflictError('Sales journal is missing its AR leg.', { journalEntryId: posted.id });
          }
          await this.subledger.recordSubledgerEntry(
            {
              partyId: party.id,
              journalLineId: arLeg.id,
              entryType: 'INVOICE_CHARGE',
              amount: outstanding,
              isDebit: true,
              actorUserId: command.actorUserId,
            },
            tx,
          );
        }
      }

      // --- 9. Audit trail ---
      await this.audit.record(
        {
          actorUserId: command.actorUserId,
          action: 'SALE.EXECUTE',
          entityType: 'BusinessDocument',
          entityId: document.id,
          after: {
            documentNumber,
            totalAmount: total.to2dp(),
            paidAmount: paid.to2dp(),
            outstandingAmount: outstanding.to2dp(),
            lineCount: validated.length,
            journalNumber,
          },
        },
        tx,
      );

      return { document, lines: document.lines, payments: document.payments, journalEntryId, journalNumber };
    };

    try {
      const result = outerTx
        ? await run(outerTx)
        : await this.orchestrator.run((otx) => run(otx), { operationName: 'sale.execute' });
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
   * DIRECTIVE-018 Stage 9.1 — sale read model for `GET /api/v3/sales/:id`.
   *
   * Document with lines (each carrying its serialized device, if any),
   * payment allocations, and the POSTED journal entry linked via
   * `documentId`. Read-only: joins the caller tx or reads directly.
   */
  async getSaleDetails(documentId: string, tx?: Prisma.TransactionClient): Promise<SaleDetailsResult> {
    if (!documentId || documentId.trim().length === 0) {
      throw new ValidationError('SalesOrchestratorService.getSaleDetails: documentId must be a non-empty string.');
    }
    const db = tx ?? (this.prisma as unknown as Prisma.TransactionClient);
    const document = await db.businessDocument.findUnique({
      where: { id: documentId },
      include: { lines: { include: { serial: true } }, payments: true },
    });
    if (!document || document.type !== 'SALE_INVOICE') {
      throw new NotFoundError(`Sale document "${documentId}" not found.`, { documentId });
    }
    const journalEntry = await db.journalEntry.findFirst({
      where: { documentId: document.id, status: 'POSTED' },
      include: { lines: true },
    });
    return { document, lines: document.lines, payments: document.payments, journalEntry };
  }
}
