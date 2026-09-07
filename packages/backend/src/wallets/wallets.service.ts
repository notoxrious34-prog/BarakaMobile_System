import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CashService } from '../cash/cash.service';
import { Prisma, WalletEntryType, TransactionType, LedgerEntryType } from '@prisma/client';
import Decimal from 'decimal.js';
import { CreateWalletDto, UpdateWalletDto, CreateWalletServiceDto, UpdateWalletServiceDto, AdjustLedgerDto, TopupWalletDto } from './dto/wallet.dto';

type PrismaTx = Prisma.TransactionClient;

function toMoney(v: string | number | Decimal): string {
  return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function toRate(v: string): string {
  return new Decimal(v).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
}

@Injectable()
export class WalletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cashService: CashService,
  ) {}

  /** Ground-truth quote: deduction + profit from nominal + commission rate. */
  quoteDeduction(nominalAmount: string, commissionRate: string): { walletDeductionAmount: string; commissionProfit: string } {
    const nominal = new Decimal(nominalAmount);
    const rate = new Decimal(commissionRate);
    const walletDeductionAmount = nominal
      .times(new Decimal(1).minus(rate))
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2);
    const commissionProfit = nominal.minus(new Decimal(walletDeductionAmount)).toFixed(2);
    return { walletDeductionAmount, commissionProfit };
  }

  /** Exact live balance: Decimal-sum of all append-only entries. */
  async computeWalletBalance(walletId: string, tx?: PrismaTx): Promise<Decimal> {
    const db: PrismaTx | PrismaService = tx ?? this.prisma;
    const entries = await db.walletLedgerEntry.findMany({
      where: { walletId },
      select: { amount: true },
    });
    let total = new Decimal(0);
    for (const e of entries) {
      total = total.plus(new Decimal(e.amount));
    }
    return total;
  }

  private async requireWallet(walletId: string, tx?: PrismaTx) {
    const db: PrismaTx | PrismaService = tx ?? this.prisma;
    const wallet = await db.digitalWallet.findUnique({ where: { id: walletId } });
    if (!wallet) {
      throw new NotFoundException({ code: 'WALLET_NOT_FOUND', walletId });
    }
    return wallet;
  }

  async listWallets() {
    const wallets = await this.prisma.digitalWallet.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        services: { select: { id: true, name: true, isActive: true } },
      },
    });
    return Promise.all(
      wallets.map(async (w) => {
        const balance = await this.computeWalletBalance(w.id);
        const balanceStr = toMoney(balance);
        return {
          ...w,
          currentBalance: balanceStr,
          isLowBalance: balance.lessThan(new Decimal(w.lowBalanceThreshold)),
          serviceSummary: {
            total: w.services.length,
            active: w.services.filter((s) => s.isActive).length,
          },
        };
      }),
    );
  }

  async createWallet(dto: CreateWalletDto) {
    return this.prisma.digitalWallet.create({
      data: {
        name: dto.name,
        type: (dto.type ?? 'FLEXY') as any,
        currency: dto.currency ?? 'DZD',
        defaultSupplierId: dto.defaultSupplierId ?? null,
        lowBalanceThreshold: dto.lowBalanceThreshold ? toMoney(dto.lowBalanceThreshold) : '2000.00',
        isActive: dto.isActive ?? true,
      },
    });
  }

  async getWallet(id: string) {
    const wallet = await this.prisma.digitalWallet.findUnique({
      where: { id },
      include: {
        services: { where: { isActive: true }, orderBy: { createdAt: 'asc' } },
        defaultSupplier: { select: { id: true, name: true, phone: true } },
      },
    });
    if (!wallet) {
      throw new NotFoundException({ code: 'WALLET_NOT_FOUND', walletId: id });
    }
    const balance = await this.computeWalletBalance(id);
    const balanceStr = toMoney(balance);
    return {
      ...wallet,
      currentBalance: balanceStr,
      isLowBalance: balance.lessThan(new Decimal(wallet.lowBalanceThreshold)),
    };
  }

  async updateWallet(id: string, dto: UpdateWalletDto) {
    await this.requireWallet(id);
    return this.prisma.digitalWallet.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.defaultSupplierId !== undefined ? { defaultSupplierId: dto.defaultSupplierId || null } : {}),
        ...(dto.lowBalanceThreshold !== undefined ? { lowBalanceThreshold: toMoney(dto.lowBalanceThreshold) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async getLedger(
    id: string,
    opts: { entryType?: string; startDate?: string; endDate?: string; page?: number; limit?: number },
  ) {
    await this.requireWallet(id);
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const where: any = { walletId: id };
    if (opts.entryType) {
      const allowed = ['TOPUP', 'SALE_DEDUCTION', 'ADJUSTMENT', 'REVERSAL'];
      if (!allowed.includes(opts.entryType)) {
        throw new BadRequestException({ code: 'INVALID_ENTRY_TYPE', entryType: opts.entryType });
      }
      where.entryType = opts.entryType;
    }
    if (opts.startDate || opts.endDate) {
      where.createdAt = {};
      if (opts.startDate) where.createdAt.gte = new Date(opts.startDate);
      if (opts.endDate) where.createdAt.lte = new Date(opts.endDate);
    }
    const [total, entries] = await Promise.all([
      this.prisma.walletLedgerEntry.count({ where }),
      this.prisma.walletLedgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { page, limit, total, pages: Math.ceil(total / limit), entries };
  }

  /** Atomic append of an entry with balance snapshot; rejects deductions that overdraw. */
  private async appendEntry(
    tx: PrismaTx,
    walletId: string,
    entryType: WalletEntryType,
    amount: Decimal,
    extra: { notes?: string | null; createdBy?: string | null; relatedPurchaseId?: string | null; relatedSaleId?: string | null } = {},
  ) {
    const current = await this.computeWalletBalance(walletId, tx);
    const next = current.plus(amount);
    if (entryType === 'SALE_DEDUCTION' && next.lessThan(new Decimal(0))) {
      const required = amount.abs();
      throw new ConflictException({
        code: 'INSUFFICIENT_WALLET_BALANCE',
        available_balance: toMoney(current),
        required_amount: toMoney(required),
        shortfall: toMoney(required.minus(current)),
      });
    }
    return tx.walletLedgerEntry.create({
      data: {
        walletId,
        entryType,
        amount: toMoney(amount),
        balanceAfter: toMoney(next),
        notes: extra.notes ?? null,
        createdBy: extra.createdBy ?? null,
        relatedPurchaseId: extra.relatedPurchaseId ?? null,
        relatedSaleId: extra.relatedSaleId ?? null,
      },
    });
  }

  /** Domain engine: top-up / correction entries (signed amount, atomic). */
  async adjustLedger(id: string, dto: AdjustLedgerDto) {
    await this.requireWallet(id);
    const amount = new Decimal(dto.amount);
    return this.prisma.$transaction(async (tx: PrismaTx) => {
      const entry = await this.appendEntry(tx, id, 'ADJUSTMENT', amount, {
        notes: dto.notes ?? null,
        createdBy: dto.createdBy ?? null,
      });
      const currentBalance = toMoney(await this.computeWalletBalance(id, tx));
      return { entry, currentBalance };
    });
  }

  /**
   * Domain engine: Flexy sale deduction.
   * Derives wallet cost + commission profit from nominal + rate (ground-truth
   * formulas), enforces non-negative balance, appends SALE_DEDUCTION atomically.
   */
  async applyDeduction(
    walletId: string,
    input: {
      nominalAmount: string;
      commissionRate?: string;
      serviceId?: string;
      relatedSaleId?: string;
      beneficiaryPhone?: string;
      notes?: string;
      createdBy?: string;
    },
  ) {
    const wallet = await this.requireWallet(walletId);
    if (!wallet.isActive) {
      throw new ConflictException({ code: 'WALLET_INACTIVE', walletId });
    }
    let rate = input.commissionRate ?? '0.0000';
    if (input.serviceId) {
      const service = await this.prisma.walletService.findUnique({ where: { id: input.serviceId } });
      if (!service || service.walletId !== walletId) {
        throw new NotFoundException({ code: 'WALLET_SERVICE_NOT_FOUND', serviceId: input.serviceId });
      }
      if (!service.isActive) {
        throw new ConflictException({ code: 'WALLET_SERVICE_INACTIVE', serviceId: input.serviceId });
      }
      rate = service.commissionRate;
    }
    const { walletDeductionAmount, commissionProfit } = this.quoteDeduction(input.nominalAmount, toRate(rate));
    const result = await this.prisma.$transaction(async (tx: PrismaTx) => {
      const entry = await this.appendEntry(tx, walletId, 'SALE_DEDUCTION', new Decimal(walletDeductionAmount).neg(), {
        notes: input.notes ?? null,
        createdBy: input.createdBy ?? null,
        relatedSaleId: input.relatedSaleId ?? null,
      });
      const currentBalance = toMoney(await this.computeWalletBalance(walletId, tx));
      return { entry, currentBalance };
    });
    return {
      ...result,
      walletDeductionAmount,
      commissionProfit,
      nominalAmount: toMoney(input.nominalAmount),
      beneficiaryPhone: input.beneficiaryPhone ?? null,
      serviceId: input.serviceId ?? null,
    };
  }

  async addService(walletId: string, dto: CreateWalletServiceDto) {
    await this.requireWallet(walletId);
    return this.prisma.walletService.create({
      data: {
        walletId,
        name: dto.name,
        networkBrandColor: dto.networkBrandColor ?? null,
        commissionRate: dto.commissionRate ? toRate(dto.commissionRate) : '0.0000',
        pricingMode: (dto.pricingMode ?? 'PERCENTAGE') as any,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateService(serviceId: string, dto: UpdateWalletServiceDto) {
    const service = await this.prisma.walletService.findUnique({ where: { id: serviceId } });
    if (!service) {
      throw new NotFoundException({ code: 'WALLET_SERVICE_NOT_FOUND', serviceId });
    }
    return this.prisma.walletService.update({
      where: { id: serviceId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.networkBrandColor !== undefined ? { networkBrandColor: dto.networkBrandColor } : {}),
        ...(dto.commissionRate !== undefined ? { commissionRate: toRate(dto.commissionRate) } : {}),
        ...(dto.pricingMode !== undefined ? { pricingMode: dto.pricingMode as any } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /**
   * Atomic wallet top-up: supplier PURCHASE invoice + optional Treasury
   * outflow + TOPUP wallet credit, all inside one Prisma transaction.
   * Mirrors the TransactionsService PURCHASE posting pattern (CREDIT invoice
   * leg, DEBIT paid leg, PURCHASE_PAYMENT cash leg, account balance update).
   */
  async topupWallet(walletId: string, dto: TopupWalletDto) {
    const wallet = await this.requireWallet(walletId);
    if (!wallet.isActive) {
      throw new ConflictException({ code: 'WALLET_INACTIVE', walletId });
    }
    const topup = new Decimal(dto.topupAmount);
    const paid = new Decimal(dto.paidAmount);
    if (topup.lte(0) || paid.lt(0) || paid.gt(topup)) {
      throw new BadRequestException({
        code: 'INVALID_TOPUP_AMOUNTS',
        topupAmount: toMoney(topup),
        paidAmount: toMoney(paid),
      });
    }
    const debt = topup.minus(paid);
    const method = dto.paymentMethod ?? 'CASH';
    const purchaseNote = dto.notes ?? `Top-up for wallet: ${wallet.name}`;

    return this.prisma.$transaction(async (tx: PrismaTx) => {
      // Resolve supplier SUPPLIER account (explicit → wallet default → generic fallback).
      const supplierContactId = dto.supplierId ?? wallet.defaultSupplierId ?? null;
      let contactId: string;
      if (supplierContactId) {
        const contact = await tx.contact.findUnique({ where: { id: supplierContactId } });
        if (!contact) {
          throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND', supplierId: supplierContactId });
        }
        contactId = contact.id;
      } else {
        let generic = await tx.contact.findFirst({ where: { name: 'مورد الشحن العام', role: 'SUPPLIER' } });
        if (!generic) {
          generic = await tx.contact.create({ data: { name: 'مورد الشحن العام', role: 'SUPPLIER', isActive: true } });
        }
        contactId = generic.id;
      }
      let account = await tx.account.findFirst({ where: { contactId, role: 'SUPPLIER' } });
      if (!account) {
        account = await tx.account.create({
          data: { contactId, role: 'SUPPLIER', openingBalance: '0.00', currentBalance: '0.00' },
        });
      }

      const amountStr = toMoney(topup);
      const paidStr = toMoney(paid);

      const transaction = await tx.transaction.create({
        data: {
          type: TransactionType.PURCHASE,
          accountId: account.id,
          amount: amountStr,
          amountPaidNow: paidStr,
          note: purchaseNote,
          reference: `WALLET-TOPUP:${walletId}`,
        },
      });

      // CREDIT leg: supplier invoice liability (+topup on account balance).
      const beforeDec = new Decimal(account.currentBalance);
      const afterInvoice = beforeDec.plus(topup);
      const afterInvoiceStr = toMoney(afterInvoice);
      await tx.ledgerEntry.create({
        data: {
          transactionId: transaction.id,
          accountId: account.id,
          entryType: LedgerEntryType.CREDIT,
          amount: amountStr,
          balanceBefore: toMoney(beforeDec),
          balanceAfter: afterInvoiceStr,
        },
      });

      let finalAccountBalance = afterInvoiceStr;
      if (paid.gt(0)) {
        // DEBIT leg: immediate payment reduces supplier liability.
        const afterPaid = afterInvoice.minus(paid);
        const afterPaidStr = toMoney(afterPaid);
        await tx.ledgerEntry.create({
          data: {
            transactionId: transaction.id,
            accountId: account.id,
            entryType: LedgerEntryType.DEBIT,
            amount: paidStr,
            balanceBefore: afterInvoiceStr,
            balanceAfter: afterPaidStr,
          },
        });
        finalAccountBalance = afterPaidStr;
        // Treasury outflow (throws 400 when cash is insufficient).
        await this.cashService.postCashMovement(tx, {
          type: 'OUT',
          category: 'PURCHASE_PAYMENT',
          amount: paidStr,
          relatedTransactionId: transaction.id,
          note: `${purchaseNote} [${method}]`,
        });
      }
      await tx.account.update({ where: { id: account.id }, data: { currentBalance: finalAccountBalance } });

      // Wallet TOPUP credit (entry 4 of the atomic bundle).
      const topupEntry = await this.appendEntry(tx, walletId, 'TOPUP', topup, {
        notes: dto.notes ?? 'Wallet Top-up',
        relatedPurchaseId: transaction.id,
      });
      const newWalletBalance = toMoney(await this.computeWalletBalance(walletId, tx));

      return {
        success: true,
        transactionId: transaction.id,
        ledgerEntryId: topupEntry.id,
        newWalletBalance,
        topupAmount: amountStr,
        paidAmount: paidStr,
        debtAmount: toMoney(debt),
        status: debt.isZero() ? 'COMPLETED' : 'PARTIALLY_PAID',
      };
    });
  }

}
