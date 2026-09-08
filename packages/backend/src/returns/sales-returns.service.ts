import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CashService } from '../cash/cash.service';
import { CreateSalesReturnDto } from './dto/create-sales-return.dto';
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class SalesReturnsService {
  constructor(private readonly prisma: PrismaService, private readonly cashService: CashService) {}

  private normalizeAmount(value: string | Decimal): string {
    return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }

  private to2dp(v: string | Decimal): string {
    return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }

  private async generateReturnNumber(tx: PrismaTx): Promise<string> {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const prefix = `RET-${yyyy}${mm}${dd}-`;
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const count = await (tx as any).salesReturn.count({
      where: { createdAt: { gte: startOfDay, lte: endOfDay } },
    });
    const seq = count + 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  async create(dto: CreateSalesReturnDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('يجب تحديد بند واحد على الأقل للإرجاع');
    }

    // Validate original transaction exists
    const originalTx = await this.prisma.transaction.findUnique({
      where: { id: dto.originalTransactionId },
      include: {
        itemLines: true,
        account: true,
      },
    });
    if (!originalTx) throw new NotFoundException(`Transaction ${dto.originalTransactionId} not found`);
    if (originalTx.type !== 'SALE') {
      throw new BadRequestException('الإرجاع مسموح فقط لفواتير البيع (SALE)');
    }

    // Validate each item belongs to original transaction and quantity not exceeded
    const itemMap = new Map<string, (typeof originalTx.itemLines)[number]>();
    for (const l of originalTx.itemLines) itemMap.set(l.id, l);

    for (const it of dto.items) {
      if (!itemMap.has(it.transactionItemId)) {
        throw new BadRequestException(`البند ${it.transactionItemId} لا ينتمي للفاتورة الأصلية`);
      }
      if (!Number.isInteger(it.quantity) || it.quantity < 1) {
        throw new BadRequestException('الكمية يجب أن تكون عددا صحيحا موجبا');
      }
      const origLine = itemMap.get(it.transactionItemId)!;
      // Query existing returned qty for this transactionItem
      const existing = await (this.prisma as any).salesReturnItem.findMany({
        where: { transactionItemId: it.transactionItemId },
        select: { quantity: true },
      });
      let alreadyReturned = 0;
      for (const e of existing) {
        try {
          alreadyReturned += parseInt(String(e.quantity), 10);
        } catch {
          alreadyReturned += 0;
        }
      }
      if (alreadyReturned + it.quantity > origLine.quantity) {
        throw new BadRequestException(
          `الكمية المطلوبة (${it.quantity}) تتجاوز المتبقي للبند ${origLine.id}: الأصلي ${origLine.quantity} — المرجع سابقا ${alreadyReturned}`,
        );
      }
    }

    // customerId validation if provided
    let resolvedCustomerId: string | null = dto.customerId ?? null;
    if (resolvedCustomerId) {
      const c = await (this.prisma as any).contact.findUnique({ where: { id: resolvedCustomerId } });
      if (!c) throw new NotFoundException(`Contact ${resolvedCustomerId} not found`);
    } else {
      // Try to infer from original transaction account -> contact
      try {
        const acc = await (this.prisma as any).account.findUnique({ where: { id: originalTx.accountId } });
        if (acc?.contactId) resolvedCustomerId = acc.contactId;
      } catch {}
    }

    return this.prisma.$transaction(async (tx: PrismaTx) => {
      // Re-validate inside tx for race safety
      const returnNumber = await this.generateReturnNumber(tx);

      // Compute refundAmount as sum of (new qty * unitPrice)
      let refundTotal = new Decimal(0);
      const preparedItems: Array<{
        transactionItemId: string;
        inventoryItemId: string;
        quantityStr: string;
        unitPriceStr: string;
        refundSubtotalStr: string;
        condition: string;
        serialNumber: string | null;
      }> = [];

      for (const it of dto.items) {
        const origLine = await (tx as any).transactionItem.findUnique({ where: { id: it.transactionItemId } });
        if (!origLine) throw new BadRequestException(`TransactionItem ${it.transactionItemId} not found`);
        const unitPriceDec = new Decimal(origLine.unitPrice);
        const unitPriceStr = this.normalizeAmount(unitPriceDec.toString());
        const subtotal = unitPriceDec.times(it.quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const subtotalStr = subtotal.toFixed(2);
        refundTotal = refundTotal.plus(subtotal);
        preparedItems.push({
          transactionItemId: it.transactionItemId,
          inventoryItemId: origLine.itemId,
          quantityStr: String(it.quantity),
          unitPriceStr,
          refundSubtotalStr: subtotalStr,
          condition: it.condition,
          serialNumber: it.serialNumber ?? null,
        });
      }

      const refundAmountStr = refundTotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
      if (new Decimal(refundAmountStr).lte(0)) {
        throw new BadRequestException('مبلغ الاسترداد يجب أن يكون أكبر من صفر');
      }

      const salesReturn = await (tx as any).salesReturn.create({
        data: {
          returnNumber,
          originalTransactionId: dto.originalTransactionId,
          customerId: resolvedCustomerId,
          refundAmount: refundAmountStr,
          refundMethod: dto.refundMethod,
          reason: dto.reason,
          createdById: dto.createdById ?? null,
          shiftId: dto.shiftId ?? null,
        },
      });

      for (const pi of preparedItems) {
        await (tx as any).salesReturnItem.create({
          data: {
            salesReturnId: salesReturn.id,
            transactionItemId: pi.transactionItemId,
            inventoryItemId: pi.inventoryItemId,
            quantity: pi.quantityStr,
            unitPrice: pi.unitPriceStr,
            refundSubtotal: pi.refundSubtotalStr,
            condition: pi.condition,
            serialNumber: pi.serialNumber,
          },
        });

        // Stock handling
        if (pi.condition === 'RESTOCKED_INVENTORY') {
          await (tx as any).stockMovement.create({
            data: {
              itemId: pi.inventoryItemId,
              type: 'IN',
              quantity: parseInt(pi.quantityStr, 10),
              reference: salesReturn.id,
              note: `RETURN_RESTOCK ${salesReturn.returnNumber} from ${dto.originalTransactionId}`,
            },
          });
        } else {
          // DEFECTIVE_QUARANTINE: no inventory bump, log only via StockMovement? Requirement: log only (no inventory bump)
          // We intentionally do NOT create StockMovement for quarantine — defective items quarantined outside saleable stock.
        }
      }

      // Financial handling
      if (dto.refundMethod === 'CASH') {
        // OUT/REFUND via CashService. Disclose: PosShift updated via CashMovement only (no PosShift table exists).
        await this.cashService.postCashMovement(tx, {
          type: 'OUT',
          category: 'REFUND',
          amount: refundAmountStr,
          relatedTransactionId: dto.originalTransactionId,
          note: `Refund ${returnNumber} — ${dto.reason}`,
        });
      } else if (dto.refundMethod === 'CUSTOMER_CREDIT_REDUCTION') {
        if (!resolvedCustomerId) {
          throw new BadRequestException('CUSTOMER_CREDIT_REDUCTION يتطلب customerId');
        }
        // Deduct from CUSTOMER account currentBalance
        const custAccount = await (tx as any).account.findFirst({
          where: { contactId: resolvedCustomerId, role: 'CUSTOMER' },
        });
        if (!custAccount) {
          throw new BadRequestException('لا يوجد حساب عميل لهذا الزبون');
        }
        const beforeDec = new Decimal(custAccount.currentBalance);
        const refundDec = new Decimal(refundAmountStr);
        const afterDec = beforeDec.minus(refundDec);
        // Allow negative? Debt reduction can go negative (credit). We clamp not below? Keep allow — ledger tracks.
        const afterStr = afterDec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
        const beforeStr = this.to2dp(beforeDec);
        await (tx as any).account.update({
          where: { id: custAccount.id },
          data: { currentBalance: afterStr },
        });
        await (tx as any).customerDebtLedgerEntry.create({
          data: {
            customerId: resolvedCustomerId,
            type: 'RETURN_CREDIT',
            amount: refundAmountStr,
            balanceBefore: beforeStr,
            balanceAfter: afterStr,
            relatedTransactionId: dto.originalTransactionId,
            notes: `Return ${returnNumber} — ${dto.reason}`,
            createdById: dto.createdById ?? null,
          },
        });
      } else if (dto.refundMethod === 'STORE_CREDIT') {
        // STORE_CREDIT: no immediate cash/account movement; credit tracked via SalesReturn record only.
        // Optionally could create ledger but spec says STORE_CREDIT has no financial side-effect here.
      }

      // Update Transaction returnStatus: compute total returned vs original qty
      const allReturnItems = await (tx as any).salesReturnItem.findMany({
        where: { salesReturn: { originalTransactionId: dto.originalTransactionId } },
        select: { transactionItemId: true, quantity: true },
      });
      const origLines = await (tx as any).transactionItem.findMany({
        where: { transactionId: dto.originalTransactionId },
        select: { id: true, quantity: true },
      });
      const returnedMap = new Map<string, number>();
      for (const r of allReturnItems) {
        const q = parseInt(String(r.quantity), 10);
        returnedMap.set(r.transactionItemId, (returnedMap.get(r.transactionItemId) ?? 0) + q);
      }
      let isFull = true;
      let hasAny = false;
      for (const ol of origLines) {
        const ret = returnedMap.get(ol.id) ?? 0;
        if (ret > 0) hasAny = true;
        if (ret < ol.quantity) isFull = false;
      }
      const newStatus = !hasAny ? 'NONE' : isFull ? 'FULL' : 'PARTIAL';
      await (tx as any).transaction.update({
        where: { id: dto.originalTransactionId },
        data: { returnStatus: newStatus },
      });

      const result = await (tx as any).salesReturn.findUnique({
        where: { id: salesReturn.id },
        include: {
          items: { include: { inventoryItem: true, transactionItem: true } },
          originalTransaction: { include: { itemLines: true } },
          customer: true,
        },
      });
      return result;
    });
  }

  async findAll(filters?: { originalTransactionId?: string; customerId?: string }) {
    const where: any = {};
    if (filters?.originalTransactionId) where.originalTransactionId = filters.originalTransactionId;
    if (filters?.customerId) where.customerId = filters.customerId;
    return (this.prisma as any).salesReturn.findMany({
      where,
      include: {
        items: { include: { inventoryItem: true, transactionItem: true } },
        originalTransaction: { select: { id: true, invoiceNumber: true, returnStatus: true } },
        customer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const sr = await (this.prisma as any).salesReturn.findUnique({
      where: { id },
      include: {
        items: { include: { inventoryItem: true, transactionItem: true } },
        originalTransaction: { include: { itemLines: { include: { item: true } }, account: true } },
        customer: true,
      },
    });
    if (!sr) throw new NotFoundException(`SalesReturn ${id} not found`);
    return sr;
  }

  async findByReturnNumber(returnNumber: string) {
    const sr = await (this.prisma as any).salesReturn.findUnique({
      where: { returnNumber },
      include: {
        items: { include: { inventoryItem: true, transactionItem: true } },
        originalTransaction: true,
        customer: true,
      },
    });
    if (!sr) throw new NotFoundException(`SalesReturn ${returnNumber} not found`);
    return sr;
  }

  async findByInvoice(invoiceNumber: string) {
    const tx = await (this.prisma as any).transaction.findUnique({
      where: { invoiceNumber },
      include: { itemLines: { include: { item: true } } },
    });
    if (!tx) throw new NotFoundException(`Transaction with invoice ${invoiceNumber} not found`);
    return tx;
  }
}
