import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateOffsetDto } from './dto/create-offset.dto';
import { TransactionType, LedgerEntryType, MovementType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeAmount(value: string): string {
    return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }

  private async computeStock(itemId: string, tx: PrismaTx): Promise<number> {
    const lastAdj = await (tx as any).stockMovement.findFirst({
      where: { itemId, type: MovementType.ADJUSTMENT },
      orderBy: { createdAt: 'desc' },
    });
    const baseDate: Date | null = lastAdj ? lastAdj.createdAt : null;
    const baseQty = lastAdj ? lastAdj.quantity : 0;

    const inAgg = await (tx as any).stockMovement.aggregate({
      where: {
        itemId,
        type: MovementType.IN,
        ...(baseDate ? { createdAt: { gt: baseDate } } : {}),
      },
      _sum: { quantity: true },
    });
    const outAgg = await (tx as any).stockMovement.aggregate({
      where: {
        itemId,
        type: MovementType.OUT,
        ...(baseDate ? { createdAt: { gt: baseDate } } : {}),
      },
      _sum: { quantity: true },
    });
    const inAfter = inAgg._sum.quantity ?? 0;
    const outAfter = outAgg._sum.quantity ?? 0;
    return baseQty + inAfter - outAfter;
  }

  async createTransaction(dto: CreateTransactionDto) {
    const normalizedAmount = this.normalizeAmount(dto.amount);

    if (dto.type !== TransactionType.SALE && dto.type !== TransactionType.PURCHASE) {
      throw new BadRequestException('createTransaction only supports SALE and PURCHASE');
    }

    return this.prisma.$transaction(async (tx: PrismaTx) => {
      const account = await (tx as any).account.findUnique({
        where: { id: dto.accountId },
        include: { contact: true },
      });
      if (!account) {
        throw new NotFoundException(`Account with id ${dto.accountId} not found`);
      }

      // Role validation
      if (dto.type === TransactionType.SALE && account.role !== 'CUSTOMER') {
        throw new BadRequestException('SALE requires CUSTOMER account');
      }
      if (dto.type === TransactionType.PURCHASE && account.role !== 'SUPPLIER') {
        throw new BadRequestException('PURCHASE requires SUPPLIER account');
      }

      if (dto.type === TransactionType.PURCHASE && dto.serviceLines && dto.serviceLines.length > 0) {
        throw new BadRequestException('serviceLines not allowed for PURCHASE');
      }

      // Pre-validate item lines and service lines and compute stock checks
      const itemLinesData: Array<{
        itemId: string;
        quantity: number;
        unitPrice: string;
        unitCost: string;
        totalPrice: string;
      }> = [];
      if (dto.itemLines && dto.itemLines.length > 0) {
        for (const line of dto.itemLines) {
          const item = await (tx as any).item.findFirst({
            where: { id: line.itemId, isActive: true },
          });
          if (!item) {
            throw new BadRequestException(`Item with id ${line.itemId} not found or inactive`);
          }
          const unitPrice = this.normalizeAmount(line.unitPrice);
          const totalPrice = new Decimal(unitPrice)
            .times(line.quantity)
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
            .toFixed(2);

          if (dto.type === TransactionType.SALE) {
            const currentStock = await this.computeStock(line.itemId, tx);
            if (currentStock < line.quantity) {
              throw new BadRequestException(
                `Insufficient stock for item ${item.name}: available ${currentStock}, requested ${line.quantity}`,
              );
            }
          }

          itemLinesData.push({
            itemId: line.itemId,
            quantity: line.quantity,
            unitPrice,
            unitCost: item.costPrice,
            totalPrice,
          });
        }
      }

      const serviceLinesData: Array<{
        serviceId: string;
        amount: string;
        profit: string;
      }> = [];
      if (dto.serviceLines && dto.serviceLines.length > 0) {
        for (const line of dto.serviceLines) {
          const service = await (tx as any).service.findFirst({
            where: { id: line.serviceId, isActive: true },
          });
          if (!service) {
            throw new BadRequestException(`Service with id ${line.serviceId} not found or inactive`);
          }
          const amount = this.normalizeAmount(line.amount);
          let profit: string;
          if (service.pricingType === 'FIXED') {
            profit = service.fixedProfit ?? '0.00';
            // Ensure normalized 2dp
            profit = new Decimal(profit).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
          } else {
            // COMMISSION
            const pct = service.commissionPct ?? '0.0000';
            profit = new Decimal(amount)
              .times(new Decimal(pct))
              .div(100)
              .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
              .toFixed(2);
          }
          serviceLinesData.push({
            serviceId: line.serviceId,
            amount,
            profit,
          });
        }
      }

      // Invoice numbering (SALE only, atomic inside this $transaction per AD-9/AD-25)
      let computedInvoiceNumber: string | null = null;
      if (dto.type === TransactionType.SALE) {
        const seqSetting = await (tx as any).setting.findUnique({
          where: { key: 'invoice_sequence_next' },
        });
        const currentSeqStr: string = seqSetting?.value ?? '1';
        const currentSeq = Number.parseInt(currentSeqStr, 10);
        const seq = Number.isNaN(currentSeq) || currentSeq < 1 ? 1 : currentSeq;
        computedInvoiceNumber = `INV-${String(seq).padStart(6, '0')}`;
        await (tx as any).setting.upsert({
          where: { key: 'invoice_sequence_next' },
          update: { value: String(seq + 1) },
          create: { key: 'invoice_sequence_next', value: String(seq + 1) },
        });
      }

      // Create Transaction
      const transaction = await (tx as any).transaction.create({
        data: {
          type: dto.type,
          accountId: dto.accountId,
          amount: normalizedAmount,
          note: dto.note,
          reference: dto.reference,
          ...(computedInvoiceNumber ? { invoiceNumber: computedInvoiceNumber } : {}),
        },
      });

      // Ledger posting
      const currentBalanceStr: string = account.currentBalance;
      const currentBalance = new Decimal(currentBalanceStr);
      const txAmount = new Decimal(normalizedAmount);
      let balanceAfter: Decimal;
      let entryType: LedgerEntryType;

      if (dto.type === TransactionType.SALE) {
        entryType = LedgerEntryType.DEBIT;
        balanceAfter = currentBalance.plus(txAmount);
      } else {
        // PURCHASE
        entryType = LedgerEntryType.CREDIT;
        balanceAfter = currentBalance.plus(txAmount);
      }

      const balanceAfterStr = balanceAfter.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

      await (tx as any).ledgerEntry.create({
        data: {
          transactionId: transaction.id,
          accountId: account.id,
          entryType,
          amount: normalizedAmount,
          balanceBefore: currentBalanceStr,
          balanceAfter: balanceAfterStr,
        },
      });

      await (tx as any).account.update({
        where: { id: account.id },
        data: { currentBalance: balanceAfterStr },
      });

      // Create item lines and stock movements
      for (const line of itemLinesData) {
        await (tx as any).transactionItem.create({
          data: {
            transactionId: transaction.id,
            itemId: line.itemId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            unitCost: line.unitCost,
            totalPrice: line.totalPrice,
          },
        });

        if (dto.type === TransactionType.SALE) {
          await (tx as any).stockMovement.create({
            data: {
              itemId: line.itemId,
              type: MovementType.OUT,
              quantity: line.quantity,
              reference: transaction.id,
              note: `SALE ${transaction.id}`,
            },
          });
        } else if (dto.type === TransactionType.PURCHASE) {
          await (tx as any).stockMovement.create({
            data: {
              itemId: line.itemId,
              type: MovementType.IN,
              quantity: line.quantity,
              reference: transaction.id,
              note: `PURCHASE ${transaction.id}`,
            },
          });
        }
      }

      // Create service lines
      for (const line of serviceLinesData) {
        await (tx as any).transactionService.create({
          data: {
            transactionId: transaction.id,
            serviceId: line.serviceId,
            amount: line.amount,
            profit: line.profit,
          },
        });
      }

      // Return with relations
      const result = await (tx as any).transaction.findUnique({
        where: { id: transaction.id },
        include: {
          ledgerEntries: true,
          itemLines: { include: { item: true } },
          serviceLines: { include: { service: true } },
          account: true,
        },
      });
      return result;
    });
  }

  async createPayment(dto: CreatePaymentDto, type: TransactionType) {
    const normalizedAmount = this.normalizeAmount(dto.amount);

    return this.prisma.$transaction(async (tx: PrismaTx) => {
      const account = await (tx as any).account.findUnique({
        where: { id: dto.accountId },
      });
      if (!account) {
        throw new NotFoundException(`Account with id ${dto.accountId} not found`);
      }

      if (type === TransactionType.PAYMENT_IN && account.role !== 'CUSTOMER') {
        throw new BadRequestException('PAYMENT_IN requires CUSTOMER account');
      }
      if (type === TransactionType.PAYMENT_OUT && account.role !== 'SUPPLIER') {
        throw new BadRequestException('PAYMENT_OUT requires SUPPLIER account');
      }

      const currentBalance = new Decimal(account.currentBalance);
      const payAmount = new Decimal(normalizedAmount);
      const balanceAfter = currentBalance.minus(payAmount);

      if (balanceAfter.lt(0)) {
        throw new BadRequestException('Payment exceeds outstanding balance');
      }

      const balanceAfterStr = balanceAfter.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
      const balanceBeforeStr = account.currentBalance;

      const transaction = await (tx as any).transaction.create({
        data: {
          type,
          accountId: account.id,
          amount: normalizedAmount,
          note: dto.note,
          reference: dto.reference,
        },
      });

      let entryType: LedgerEntryType;
      if (type === TransactionType.PAYMENT_IN) {
        entryType = LedgerEntryType.CREDIT;
      } else {
        entryType = LedgerEntryType.DEBIT;
      }

      await (tx as any).ledgerEntry.create({
        data: {
          transactionId: transaction.id,
          accountId: account.id,
          entryType,
          amount: normalizedAmount,
          balanceBefore: balanceBeforeStr,
          balanceAfter: balanceAfterStr,
        },
      });

      await (tx as any).account.update({
        where: { id: account.id },
        data: { currentBalance: balanceAfterStr },
      });

      const result = await (tx as any).transaction.findUnique({
        where: { id: transaction.id },
        include: {
          ledgerEntries: true,
          itemLines: { include: { item: true } },
          serviceLines: { include: { service: true } },
          account: true,
        },
      });
      return result;
    });
  }

  async createOffset(dto: CreateOffsetDto) {
    return this.prisma.$transaction(async (tx: PrismaTx) => {
      const supplierAccount = await (tx as any).account.findFirst({
        where: { contactId: dto.contactId, role: 'SUPPLIER' },
      });
      const customerAccount = await (tx as any).account.findFirst({
        where: { contactId: dto.contactId, role: 'CUSTOMER' },
      });

      if (!supplierAccount || !customerAccount) {
        throw new BadRequestException('Contact must have both SUPPLIER and CUSTOMER accounts for offset');
      }

      const supplierBalance = new Decimal(supplierAccount.currentBalance);
      const customerBalance = new Decimal(customerAccount.currentBalance);
      const offsetAmount = Decimal.min(supplierBalance, customerBalance);

      if (offsetAmount.eq(0)) {
        throw new BadRequestException('No offset possible: one or both balances are zero');
      }

      const offsetAmountStr = offsetAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

      const supplierAfter = supplierBalance.minus(offsetAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
      const customerAfter = customerBalance.minus(offsetAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

      const transaction = await (tx as any).transaction.create({
        data: {
          type: TransactionType.OFFSET,
          accountId: supplierAccount.id,
          amount: offsetAmountStr,
          note: dto.note,
        },
      });

      // Entry 1: SUPPLIER DEBIT
      await (tx as any).ledgerEntry.create({
        data: {
          transactionId: transaction.id,
          accountId: supplierAccount.id,
          entryType: LedgerEntryType.DEBIT,
          amount: offsetAmountStr,
          balanceBefore: supplierAccount.currentBalance,
          balanceAfter: supplierAfter,
        },
      });

      // Entry 2: CUSTOMER CREDIT
      await (tx as any).ledgerEntry.create({
        data: {
          transactionId: transaction.id,
          accountId: customerAccount.id,
          entryType: LedgerEntryType.CREDIT,
          amount: offsetAmountStr,
          balanceBefore: customerAccount.currentBalance,
          balanceAfter: customerAfter,
        },
      });

      await (tx as any).account.update({
        where: { id: supplierAccount.id },
        data: { currentBalance: supplierAfter },
      });
      await (tx as any).account.update({
        where: { id: customerAccount.id },
        data: { currentBalance: customerAfter },
      });

      const result = await (tx as any).transaction.findUnique({
        where: { id: transaction.id },
        include: {
          ledgerEntries: true,
          itemLines: true,
          serviceLines: true,
        },
      });
      return result;
    });
  }

  async findAll(filters?: { accountId?: string; type?: TransactionType }) {
    const where: any = {};
    if (filters?.accountId) where.accountId = filters.accountId;
    if (filters?.type) where.type = filters.type;
    return this.prisma.transaction.findMany({
      where,
      include: {
        ledgerEntries: true,
        itemLines: { include: { item: true } },
        serviceLines: { include: { service: true } },
        account: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        ledgerEntries: true,
        itemLines: { include: { item: true } },
        serviceLines: { include: { service: true } },
        account: { include: { contact: true } },
      },
    });
    if (!tx) {
      throw new NotFoundException(`Transaction with id ${id} not found`);
    }
    return tx;
  }
}
