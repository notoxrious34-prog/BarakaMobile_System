import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BusinessDocument, CatalogItem, DocumentLine, PaymentAllocation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../core/money';
import { NotFoundError, ValidationError } from '../core/result';
import { TransactionOrchestrator } from '../core/transaction-orchestrator';
import { IdempotencyEngine } from '../core/idempotency';
import { DocumentNumberService } from '../core/document-number.service';
import { AuditService } from '../core/audit.service';
import { InventoryDomainService } from '../inventory/inventory-domain.service';
import { SerializedInventoryService, validateImeiOrSerial } from '../inventory/serialized-inventory.service';
import { PostingService } from '../accounting/posting.service';
import { PartiesService } from '../parties/parties.service';
import { PartySubledgerService } from '../parties/party-subledger.service';
import type { PaymentSplitInput } from '../sales/sales-orchestrator.service';

/**
 * TASK BRIEF-015 Stage 5.2 — purchase orchestrator (v3.0 business engine).
 *
 * Executes a complete supplier purchase inside ONE interactive transaction:
 * supplier validation → line/cost validation → totals → PUR numbering →
 * stock receipts + serial registration → document persistence → balanced
 * GL journal (inventory, cash/wallet/bank, AP) → supplier subledger leg →
 * audit. Anything throws → everything rolls back.
 *
 * Serialized lines record BOTH per-unit registrations (specific
 * identification for future COGS) AND one bulk receipt (physical units in
 * the moving-average pool) — mirroring the sales side, which expenses
 * serialized units by specific cost. Purchase document lines mirror this:
 * bulk lines stay aggregated, serialized lines are stored per unit with
 * their serialId linked and unitPrice == unitCost (purchases carry cost,
 * not price, in every money column).
 */

export interface PurchaseLineSerialInput {
  imei1: string;
  imei2?: string;
  warrantyMonths?: number;
}

export interface PurchaseLineItemInput {
  itemId: string;
  quantity: number;
  unitCost: string | Money;
  serials?: PurchaseLineSerialInput[];
}

export interface ExecutePurchaseCommand {
  /** Supplier party — required, must be SUPPLIER or BOTH and active. */
  partyId: string;
  lines: PurchaseLineItemInput[];
  discountAmount?: string | Money;
  payments: PaymentSplitInput[];
  actorUserId?: string;
  idempotencyKey?: string;
}

export interface PurchaseExecutionResult {
  document: BusinessDocument;
  lines: DocumentLine[];
  payments: PaymentAllocation[];
  journalEntryId: string;
  journalNumber: string;
}

const PAYMENT_ACCOUNT: Record<string, string> = {
  CASH: '10000',
  DIGITAL_WALLET: '10100',
  BANK_TRANSFER: '10200',
};

const INVENTORY_ON_HAND = '12000';
const AP_CONTROL = '20000';

interface ValidatedPurchaseLine {
  item: CatalogItem;
  quantity: number;
  cost: Money;
  lineTotal: Money;
  serials: PurchaseLineSerialInput[];
}

function toMoney(value: string | Money, what: string): Money {
  if (value instanceof Money) return value;
  try {
    return Money.from(value);
  } catch {
    throw new ValidationError(`PurchasesOrchestratorService: ${what} is not a valid amount.`, { value });
  }
}

function unwrapReplay(response: unknown): PurchaseExecutionResult {
  if (response && typeof response === 'object' && 'body' in response) {
    const body = (response as { body: unknown }).body;
    if (body && typeof body === 'object' && 'document' in body) {
      return body as PurchaseExecutionResult;
    }
  }
  return response as PurchaseExecutionResult;
}

@Injectable()
export class PurchasesOrchestratorService {
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

  async executePurchase(
    command: ExecutePurchaseCommand,
    outerTx?: Prisma.TransactionClient,
  ): Promise<PurchaseExecutionResult> {
    let begunKey: string | null = null;
    if (command.idempotencyKey) {
      if (command.idempotencyKey.trim().length === 0) {
        throw new ValidationError('PurchasesOrchestratorService.executePurchase: idempotencyKey must be a non-empty string.');
      }
      const attempt = await this.idempotency.begin(command.idempotencyKey, 'purchase.execute');
      if (attempt.isReplay) return unwrapReplay(attempt.response);
      begunKey = command.idempotencyKey;
    }

    const run = async (tx: Prisma.TransactionClient): Promise<PurchaseExecutionResult> => {
      // --- 2. Supplier validation ---
      if (!command.partyId || command.partyId.trim().length === 0) {
        throw new ValidationError('PurchasesOrchestratorService.executePurchase: partyId (supplier) is required.');
      }
      const party = await this.parties.getParty(command.partyId, tx);
      if (!party.isActive) {
        throw new ValidationError(`Supplier ${party.name} is inactive.`, { partyId: party.id });
      }
      if (party.type !== 'SUPPLIER' && party.type !== 'BOTH') {
        throw new ValidationError(
          `Party ${party.name} is a ${party.type} — purchases require a SUPPLIER (or BOTH).`,
          { partyId: party.id, type: party.type },
        );
      }

      // --- 3. Line validation ---
      if (!command.lines || command.lines.length < 1) {
        throw new ValidationError('PurchasesOrchestratorService.executePurchase: at least 1 line is required.');
      }
      if (!Array.isArray(command.payments)) {
        throw new ValidationError('PurchasesOrchestratorService.executePurchase: payments must be an array.');
      }
      const validated: ValidatedPurchaseLine[] = [];
      for (let index = 0; index < command.lines.length; index += 1) {
        const line = command.lines[index];
        const what = `line ${index + 1}`;
        if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
          throw new ValidationError(
            `PurchasesOrchestratorService.executePurchase: ${what} quantity must be a positive integer.`,
          );
        }
        const cost = toMoney(line.unitCost, `${what} unitCost`);
        if (cost.isNegative()) {
          throw new ValidationError(`PurchasesOrchestratorService.executePurchase: ${what} unitCost must be >= 0.`);
        }
        const item = await tx.catalogItem.findUnique({ where: { id: line.itemId } });
        if (!item) {
          throw new NotFoundError(`Catalog item "${line.itemId}" not found.`, { itemId: line.itemId });
        }
        if (!item.isActive) {
          throw new ValidationError(`Catalog item ${item.sku} is inactive.`, { itemId: item.id });
        }
        let serials: PurchaseLineSerialInput[] = [];
        if (item.isSerialized) {
          if (!line.serials || line.serials.length !== line.quantity) {
            throw new ValidationError(
              `PurchasesOrchestratorService.executePurchase: serialized line ${item.sku} requires exactly ${line.quantity} serial(s).`,
            );
          }
          for (const serial of line.serials) {
            if (!serial || !serial.imei1) {
              throw new ValidationError(
                `PurchasesOrchestratorService.executePurchase: serialized line ${item.sku} has a serial without imei1.`,
              );
            }
            validateImeiOrSerial(serial.imei1);
            if (serial.imei2 !== undefined && serial.imei2.trim().length > 0) {
              validateImeiOrSerial(serial.imei2);
            }
          }
          serials = line.serials;
        } else if (line.serials && line.serials.length > 0) {
          throw new ValidationError(
            `PurchasesOrchestratorService.executePurchase: non-serialized line ${item.sku} must not carry serials.`,
          );
        }
        validated.push({ item, quantity: line.quantity, cost, lineTotal: cost.mul(line.quantity), serials });
      }

      // --- 4. Totals ---
      let subtotal = Money.zero();
      for (const line of validated) {
        subtotal = subtotal.add(line.lineTotal);
      }
      const discount = toMoney(command.discountAmount ?? '0.00', 'discountAmount');
      if (discount.isNegative()) {
        throw new ValidationError('PurchasesOrchestratorService.executePurchase: discountAmount must be >= 0.');
      }
      if (discount.greaterThan(subtotal)) {
        throw new ValidationError(
          `PurchasesOrchestratorService.executePurchase: discount ${discount.to2dp()} exceeds subtotal ${subtotal.to2dp()}.`,
        );
      }
      const total = subtotal.sub(discount);
      let paid = Money.zero();
      for (let index = 0; index < command.payments.length; index += 1) {
        const payment = command.payments[index];
        if (!PAYMENT_ACCOUNT[payment.paymentMethod]) {
          throw new ValidationError(
            `PurchasesOrchestratorService.executePurchase: payment ${index + 1} has unknown method "${payment.paymentMethod}".`,
          );
        }
        const amount = toMoney(payment.amount, `payment ${index + 1} amount`);
        if (amount.isNegative()) {
          throw new ValidationError(`PurchasesOrchestratorService.executePurchase: payment ${index + 1} amount must be >= 0.`);
        }
        paid = paid.add(amount);
      }
      if (paid.greaterThan(total)) {
        throw new ValidationError('Overpayment is not permitted in purchase invoice.');
      }
      const outstanding = total.sub(paid);

      // --- 5. Document number ---
      const documentNumber = await this.sequences.nextNumber('PUR-', tx, 6);

      // --- 6. Inventory receipts + serial registration ---
      const registeredSerialIds: Array<string | null>[] = [];
      for (const line of validated) {
        if (line.item.isSerialized) {
          const ids: Array<string | null> = [];
          for (const serial of line.serials) {
            const device = await this.serials.registerSerial(
              {
                imei1: serial.imei1,
                imei2: serial.imei2,
                itemId: line.item.id,
                acquisitionCost: line.cost,
                warrantyMonths: serial.warrantyMonths,
                referenceId: documentNumber,
              },
              tx,
            );
            ids.push(device.id);
          }
          registeredSerialIds.push(ids);
          await this.inventory.receiveStock(
            {
              itemId: line.item.id,
              quantity: line.quantity,
              unitCost: line.cost,
              referenceType: 'PURCHASE',
              referenceId: documentNumber,
            },
            tx,
          );
        } else {
          registeredSerialIds.push([]);
          await this.inventory.receiveStock(
            {
              itemId: line.item.id,
              quantity: line.quantity,
              unitCost: line.cost,
              referenceType: 'PURCHASE',
              referenceId: documentNumber,
            },
            tx,
          );
        }
      }

      // --- 7. Persist document (serialized lines stored per unit with serial link) ---
      const document = await tx.businessDocument.create({
        data: {
          documentNumber,
          type: 'PURCHASE_INVOICE',
          partyId: party.id,
          status: 'POSTED',
          subtotalAmount: subtotal.to2dp(),
          discountAmount: discount.to2dp(),
          totalAmount: total.to2dp(),
          paidAmount: paid.to2dp(),
          outstandingAmount: outstanding.to2dp(),
          lines: {
            create: validated.flatMap((line, lineIndex) => {
              if (line.item.isSerialized) {
                return registeredSerialIds[lineIndex].map((serialId) => ({
                  itemId: line.item.id,
                  serialId,
                  quantity: 1,
                  unitCost: line.cost.to2dp(),
                  unitPrice: line.cost.to2dp(),
                  lineTotal: line.cost.to2dp(),
                }));
              }
              return [
                {
                  itemId: line.item.id,
                  serialId: null,
                  quantity: line.quantity,
                  unitCost: line.cost.to2dp(),
                  unitPrice: line.cost.to2dp(),
                  lineTotal: line.lineTotal.to2dp(),
                },
              ];
            }),
          },
          payments: {
            create: command.payments.map((payment, index) => ({
              paymentMethod: payment.paymentMethod,
              amount: toMoney(payment.amount, `payment ${index + 1} amount`).to2dp(),
              walletId: null,
            })),
          },
        },
        include: { lines: true, payments: true },
      });

      // --- 8. Double-entry journal ---
      const legs: Array<{ accountCode: string; debit?: string; credit?: string; partyId?: string }> = [];
      if (total.isPositive()) {
        legs.push({ accountCode: INVENTORY_ON_HAND, debit: total.to2dp() });
      }
      for (let index = 0; index < command.payments.length; index += 1) {
        const amount = toMoney(command.payments[index].amount, `payment ${index + 1} amount`);
        if (amount.isPositive()) {
          legs.push({ accountCode: PAYMENT_ACCOUNT[command.payments[index].paymentMethod], credit: amount.to2dp() });
        }
      }
      if (outstanding.isPositive()) {
        legs.push({ accountCode: AP_CONTROL, credit: outstanding.to2dp(), partyId: party.id });
      }
      let journalEntryId = '';
      let journalNumber = '';
      if (legs.length >= 2) {
        const posted = await this.posting.post(
          {
            documentType: 'PURCHASE_INVOICE',
            documentId: document.id,
            description: `Purchase ${documentNumber} — ${party.name}`,
            lines: legs,
            postingDate: new Date(),
            actorUserId: command.actorUserId,
          },
          tx,
        );
        journalEntryId = posted.id;
        journalNumber = posted.entryNumber;
        // --- 9. Supplier subledger leg off the AP journal line ---
        if (outstanding.isPositive()) {
          const apLeg = posted.lines.find((line) => line.accountCode === AP_CONTROL);
          if (!apLeg) {
            throw new ValidationError('Purchase journal is missing its AP leg.', { journalEntryId: posted.id });
          }
          await this.subledger.recordSubledgerEntry(
            {
              partyId: party.id,
              journalLineId: apLeg.id,
              entryType: 'INVOICE_CHARGE',
              amount: outstanding,
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
          action: 'PURCHASE.EXECUTE',
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
        : await this.orchestrator.run((otx) => run(otx), { operationName: 'purchase.execute' });
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
}
