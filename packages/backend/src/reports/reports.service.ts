import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MovementType } from '@prisma/client';
import Decimal from 'decimal.js';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private to2dp(value: string | number | Decimal): string {
    return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }

  // Identical to InventoryService.computeStock
  private async computeStock(itemId: string): Promise<number> {
    const lastAdj = await (this.prisma as any).stockMovement.findFirst({
      where: { itemId, type: MovementType.ADJUSTMENT },
      orderBy: { createdAt: 'desc' },
    });
    const baseDate: Date | null = lastAdj ? lastAdj.createdAt : null;
    const baseQty = lastAdj ? lastAdj.quantity : 0;

    const inAgg = await (this.prisma as any).stockMovement.aggregate({
      where: {
        itemId,
        type: MovementType.IN,
        ...(baseDate ? { createdAt: { gt: baseDate } } : {}),
      },
      _sum: { quantity: true },
    });
    const outAgg = await (this.prisma as any).stockMovement.aggregate({
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

  private getAlgeriaStartOfDay(now: Date): Date {
    const algeriaMs = now.getTime() + 60 * 60 * 1000;
    const algeriaDate = new Date(algeriaMs);
    const y = algeriaDate.getUTCFullYear();
    const m = algeriaDate.getUTCMonth();
    const d = algeriaDate.getUTCDate();
    return new Date(Date.UTC(y, m, d, 0, 0, 0) - 60 * 60 * 1000);
  }

  private getAlgeriaStartOfMonth(now: Date): Date {
    const algeriaMs = now.getTime() + 60 * 60 * 1000;
    const algeriaDate = new Date(algeriaMs);
    const y = algeriaDate.getUTCFullYear();
    const m = algeriaDate.getUTCMonth();
    return new Date(Date.UTC(y, m, 1, 0, 0, 0) - 60 * 60 * 1000);
  }

  private async getProfitForRange(start: Date, end: Date): Promise<{ serviceProfit: Decimal; itemProfit: Decimal; totalProfit: Decimal }> {
    const serviceLines = await (this.prisma as any).transactionService.findMany({
      where: {
        transaction: {
          createdAt: { gte: start, lte: end },
        },
      },
      include: { transaction: true },
    });

    let serviceProfit = new Decimal(0);
    for (const sl of serviceLines) {
      serviceProfit = serviceProfit.plus(new Decimal(sl.profit));
    }

    const saleItems = await (this.prisma as any).transactionItem.findMany({
      where: {
        transaction: {
          type: 'SALE',
          createdAt: { gte: start, lte: end },
        },
      },
      include: { item: true },
    });

    let itemProfit = new Decimal(0);
    for (const ti of saleItems) {
      const sellingRaw = (ti as any).sellingPrice ?? (ti as any).unitPrice;
      const selling = new Decimal(sellingRaw);
      const cost = new Decimal(ti.item.costPrice);
      const profitPerUnit = selling.minus(cost);
      itemProfit = itemProfit.plus(profitPerUnit.times(ti.quantity));
    }

    const totalProfit = serviceProfit.plus(itemProfit);
    return { serviceProfit, itemProfit, totalProfit };
  }

  async getContactPosition(contactId: string) {
    const contact = await (this.prisma as any).contact.findFirst({
      where: { id: contactId, isActive: true },
      include: { accounts: true },
    });
    if (!contact) {
      throw new NotFoundException(`Contact with id ${contactId} not found`);
    }

    const supplierAccount = contact.accounts.find((a: any) => a.role === 'SUPPLIER');
    const customerAccount = contact.accounts.find((a: any) => a.role === 'CUSTOMER');

    const supplierBalance = supplierAccount ? new Decimal(supplierAccount.currentBalance) : new Decimal(0);
    const customerBalance = customerAccount ? new Decimal(customerAccount.currentBalance) : new Decimal(0);

    const netPosition = customerBalance.minus(supplierBalance).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

    const result: any = {
      contactId: contact.id,
      contactName: contact.name,
      contactRole: contact.role,
      netPosition,
    };

    if (supplierAccount) {
      result.supplierAccount = {
        accountId: supplierAccount.id,
        currentBalance: this.to2dp(supplierAccount.currentBalance),
      };
    }

    if (customerAccount) {
      result.customerAccount = {
        accountId: customerAccount.id,
        currentBalance: this.to2dp(customerAccount.currentBalance),
      };
    }

    return result;
  }

  async getAllContactPositions() {
    const contacts = await (this.prisma as any).contact.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { accounts: true },
    });

    const positions = [];
    for (const contact of contacts) {
      const supplierAccount = contact.accounts.find((a: any) => a.role === 'SUPPLIER');
      const customerAccount = contact.accounts.find((a: any) => a.role === 'CUSTOMER');
      const supplierBalance = supplierAccount ? new Decimal(supplierAccount.currentBalance) : new Decimal(0);
      const customerBalance = customerAccount ? new Decimal(customerAccount.currentBalance) : new Decimal(0);
      const netPosition = customerBalance.minus(supplierBalance).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

      const pos: any = {
        contactId: contact.id,
        contactName: contact.name,
        contactRole: contact.role,
        netPosition,
      };
      if (supplierAccount) {
        pos.supplierAccount = {
          accountId: supplierAccount.id,
          currentBalance: this.to2dp(supplierAccount.currentBalance),
        };
      }
      if (customerAccount) {
        pos.customerAccount = {
          accountId: customerAccount.id,
          currentBalance: this.to2dp(customerAccount.currentBalance),
        };
      }
      positions.push(pos);
    }
    return positions;
  }

  async getCapital() {
    const customerAccounts = await (this.prisma as any).account.findMany({
      where: {
        role: 'CUSTOMER',
        contact: { isActive: true },
      },
    });
    const supplierAccounts = await (this.prisma as any).account.findMany({
      where: {
        role: 'SUPPLIER',
        contact: { isActive: true },
      },
    });

    let totalReceivables = new Decimal(0);
    for (const acc of customerAccounts) {
      totalReceivables = totalReceivables.plus(new Decimal(acc.currentBalance));
    }

    let totalPayables = new Decimal(0);
    for (const acc of supplierAccounts) {
      totalPayables = totalPayables.plus(new Decimal(acc.currentBalance));
    }

    const items = await (this.prisma as any).item.findMany({
      where: { isActive: true },
    });

    let inventoryValue = new Decimal(0);
    for (const item of items) {
      const stock = await this.computeStock(item.id);
      const cost = new Decimal(item.costPrice);
      inventoryValue = inventoryValue.plus(cost.times(stock));
    }

    const netCapital = totalReceivables.minus(totalPayables).plus(inventoryValue);

    return {
      totalReceivables: this.to2dp(totalReceivables),
      totalPayables: this.to2dp(totalPayables),
      inventoryValue: this.to2dp(inventoryValue),
      netCapital: this.to2dp(netCapital),
    };
  }

  async getNetProfit() {
    const saleTxs = await (this.prisma as any).transaction.findMany({
      where: { type: 'SALE' },
    });
    const purchaseTxs = await (this.prisma as any).transaction.findMany({
      where: { type: 'PURCHASE' },
    });

    let totalRevenue = new Decimal(0);
    for (const tx of saleTxs) {
      totalRevenue = totalRevenue.plus(new Decimal(tx.amount));
    }

    let totalCost = new Decimal(0);
    for (const tx of purchaseTxs) {
      totalCost = totalCost.plus(new Decimal(tx.amount));
    }

    const serviceLines = await (this.prisma as any).transactionService.findMany();
    let serviceProfit = new Decimal(0);
    for (const sl of serviceLines) {
      serviceProfit = serviceProfit.plus(new Decimal(sl.profit));
    }

    // itemProfit: sum (sellingPrice - costPrice) * quantity for SALE transactionItems (current costPrice)
    const saleItems = await (this.prisma as any).transactionItem.findMany({
      where: { transaction: { type: 'SALE' } },
      include: { item: true },
    });

    let itemProfit = new Decimal(0);
    for (const ti of saleItems) {
      const sellingRaw = (ti as any).sellingPrice ?? (ti as any).unitPrice;
      const selling = new Decimal(sellingRaw);
      const cost = new Decimal(ti.item.costPrice);
      const profitPerUnit = selling.minus(cost);
      itemProfit = itemProfit.plus(profitPerUnit.times(ti.quantity));
    }

    const grossProfit = serviceProfit.plus(itemProfit);
    const netProfit = grossProfit; // same for now

    return {
      totalRevenue: this.to2dp(totalRevenue),
      totalCost: this.to2dp(totalCost),
      serviceProfit: this.to2dp(serviceProfit),
      itemProfit: this.to2dp(itemProfit),
      grossProfit: this.to2dp(grossProfit),
      netProfit: this.to2dp(netProfit),
    };
  }

  async getLedger(accountId: string) {
    const account = await (this.prisma as any).account.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      throw new NotFoundException(`Account with id ${accountId} not found`);
    }

    const entries = await (this.prisma as any).ledgerEntry.findMany({
      where: { accountId },
      orderBy: { createdAt: 'asc' },
    });

    return entries.map((e: any) => ({
      id: e.id,
      transactionId: e.transactionId,
      entryType: e.entryType,
      amount: e.amount,
      balanceBefore: e.balanceBefore,
      balanceAfter: e.balanceAfter,
      createdAt: e.createdAt,
    }));
  }

  async getDebtSummary() {
    const capital = await this.getCapital();
    const contacts = await this.getAllContactPositions();

    const totalReceivables = new Decimal(capital.totalReceivables);
    const totalPayables = new Decimal(capital.totalPayables);
    const netDebtPosition = totalReceivables.minus(totalPayables).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

    return {
      totalReceivables: capital.totalReceivables,
      totalPayables: capital.totalPayables,
      netDebtPosition,
      contacts,
    };
  }

  async getSummary() {
    const now = new Date();
    const startOfDay = this.getAlgeriaStartOfDay(now);
    const startOfMonth = this.getAlgeriaStartOfMonth(now);

    // Capital
    const capitalData = await this.getCapital();
    const totalCapital = capitalData.netCapital;
    const cashAndReceivables = capitalData.totalReceivables;
    const stockValue = capitalData.inventoryValue;

    // Profit — today and month
    const todayProfitData = await this.getProfitForRange(startOfDay, now);
    const monthProfitData = await this.getProfitForRange(startOfMonth, now);

    // Debts
    const totalCustomerDebt = capitalData.totalReceivables;
    const totalSupplierDebt = capitalData.totalPayables;
    const netPosition = new Decimal(totalCustomerDebt).minus(new Decimal(totalSupplierDebt)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

    // Inventory
    const items = await (this.prisma as any).item.findMany({
      where: { isActive: true },
    });
    const totalItems = items.length;
    let lowStockItems = 0;
    let outOfStockItems = 0;
    let lowStockThreshold = 5;
    try {
      const row = await (this.prisma as any).setting.findUnique({ where: { key: 'low_stock_threshold' } });
      if (row?.value) {
        const parsed = parseInt(row.value, 10);
        if (!Number.isNaN(parsed) && parsed >= 0) lowStockThreshold = parsed;
      }
    } catch {
      // fallback to default 5 on any error — never throw from summary
    }
    for (const item of items) {
      const stock = await this.computeStock(item.id);
      if (stock <= lowStockThreshold) lowStockItems++;
      if (stock === 0) outOfStockItems++;
    }

    // Recent transactions — last 5 newest first
    const recentRaw = await (this.prisma as any).transaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        account: {
          include: { contact: true },
        },
      },
    });

    const recentTransactions = recentRaw.map((tx: any) => ({
      id: tx.id,
      type: tx.type,
      totalAmount: this.to2dp(tx.amount),
      contactName: tx.account?.contact?.name ?? '—',
      createdAt: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : String(tx.createdAt),
    }));

    return {
      capital: {
        totalCapital: this.to2dp(totalCapital),
        cashAndReceivables: this.to2dp(cashAndReceivables),
        stockValue: this.to2dp(stockValue),
      },
      todayProfit: {
        totalProfit: this.to2dp(todayProfitData.totalProfit),
        serviceProfit: this.to2dp(todayProfitData.serviceProfit),
        itemProfit: this.to2dp(todayProfitData.itemProfit),
      },
      monthProfit: {
        totalProfit: this.to2dp(monthProfitData.totalProfit),
        serviceProfit: this.to2dp(monthProfitData.serviceProfit),
        itemProfit: this.to2dp(monthProfitData.itemProfit),
      },
      debts: {
        totalCustomerDebt: this.to2dp(totalCustomerDebt),
        totalSupplierDebt: this.to2dp(totalSupplierDebt),
        netPosition: this.to2dp(netPosition),
      },
      inventory: {
        totalItems,
        lowStockItems,
        outOfStockItems,
      },
      recentTransactions,
    };
  }
}
