import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MovementType } from '@prisma/client';
import Decimal from 'decimal.js';
import { CashService } from '../cash/cash.service';
import { ExpensesService } from '../expenses/expenses.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cashService: CashService,
    private readonly expensesService: ExpensesService,
  ) {}

  private to2dp(value: string | number | Decimal): string {
    return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }

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

  private getAlgeriaEndOfDay(now: Date): Date {
    const start = this.getAlgeriaStartOfDay(now);
    return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  }

  private getAlgeriaStartOfMonth(now: Date): Date {
    const algeriaMs = now.getTime() + 60 * 60 * 1000;
    const algeriaDate = new Date(algeriaMs);
    const y = algeriaDate.getUTCFullYear();
    const m = algeriaDate.getUTCMonth();
    return new Date(Date.UTC(y, m, 1, 0, 0, 0) - 60 * 60 * 1000);
  }

  private parseDateBound(dateStr: string, isStart: boolean): Date | null {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const trimmed = dateStr.trim();
    if (trimmed.length === 0) return null;
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return null;
    if (isStart) return this.getAlgeriaStartOfDay(d);
    return this.getAlgeriaEndOfDay(d);
  }

  private resolveRange(startDate?: string, endDate?: string, defaultToMonth = false): { start: Date | null; end: Date | null } {
    let start: Date | null = null;
    let end: Date | null = null;
    if (startDate) start = this.parseDateBound(startDate, true);
    if (endDate) end = this.parseDateBound(endDate, false);
    if (!start && !end && defaultToMonth) {
      const now = new Date();
      start = this.getAlgeriaStartOfMonth(now);
      end = now;
    }
    if (start && end && start.getTime() > end.getTime()) {
      const tmp = start;
      start = end;
      end = tmp;
    }
    return { start, end };
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
    });

    let itemProfit = new Decimal(0);
    for (const ti of saleItems) {
      const selling = new Decimal(ti.unitPrice);
      const cost = new Decimal(ti.unitCost ?? '0.00');
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

    const cash = await this.cashService.getCurrentBalance();
    const cashInHand = new Decimal(cash.currentBalance);
    const netCapital = inventoryValue.plus(totalReceivables).plus(cashInHand).minus(totalPayables);

    return {
      totalReceivables: this.to2dp(totalReceivables),
      totalPayables: this.to2dp(totalPayables),
      inventoryValue: this.to2dp(inventoryValue),
      cashInHand: this.to2dp(cashInHand),
      netCapital: this.to2dp(netCapital),
    };
  }

  async getNetProfit(startDate?: string, endDate?: string) {
    const { start, end } = this.resolveRange(startDate, endDate, false);

    let txWhere: any = { type: 'SALE' };
    if (start || end) {
      txWhere.createdAt = {};
      if (start) txWhere.createdAt.gte = start;
      if (end) txWhere.createdAt.lte = end;
    }

    const saleTxs = await (this.prisma as any).transaction.findMany({
      where: txWhere,
    });

    let totalRevenue = new Decimal(0);
    for (const tx of saleTxs) {
      totalRevenue = totalRevenue.plus(new Decimal(tx.amount));
    }

    let totalCost = new Decimal(0);
    const hasRange = !!(start || end);
    if (hasRange && start && end) {
      const cogsItems = await (this.prisma as any).transactionItem.findMany({
        where: {
          transaction: {
            type: 'SALE',
            createdAt: { gte: start, lte: end },
          },
        },
      });
      for (const ti of cogsItems) {
        const cost = new Decimal(ti.unitCost ?? '0.00');
        totalCost = totalCost.plus(cost.times(ti.quantity));
      }
    } else if (!hasRange) {
      const allItems = await (this.prisma as any).transactionItem.findMany({
        where: { transaction: { type: 'SALE' } },
      });
      for (const ti of allItems) {
        const cost = new Decimal(ti.unitCost ?? '0.00');
        totalCost = totalCost.plus(cost.times(ti.quantity));
      }
    } else {
      const cogsItems = await (this.prisma as any).transactionItem.findMany({
        where: {
          transaction: {
            type: 'SALE',
            ...(start ? { createdAt: { gte: start } } : {}),
            ...(end ? { createdAt: { lte: end } } : {}),
          },
        },
      });
      for (const ti of cogsItems) {
        const cost = new Decimal(ti.unitCost ?? '0.00');
        totalCost = totalCost.plus(cost.times(ti.quantity));
      }
    }

    let serviceProfit = new Decimal(0);
    let itemProfit = new Decimal(0);
    if (hasRange && start && end) {
      const rangeProfit = await this.getProfitForRange(start, end);
      serviceProfit = rangeProfit.serviceProfit;
      itemProfit = rangeProfit.itemProfit;
    } else if (!hasRange) {
      const allStart = new Date('1970-01-01T00:00:00.000Z');
      const allEnd = new Date('2100-01-01T00:00:00.000Z');
      const rangeProfit = await this.getProfitForRange(allStart, allEnd);
      serviceProfit = rangeProfit.serviceProfit;
      itemProfit = rangeProfit.itemProfit;
    } else {
      const fallbackStart = start ?? new Date('1970-01-01T00:00:00.000Z');
      const fallbackEnd = end ?? new Date('2100-01-01T00:00:00.000Z');
      const rangeProfit = await this.getProfitForRange(fallbackStart, fallbackEnd);
      serviceProfit = rangeProfit.serviceProfit;
      itemProfit = rangeProfit.itemProfit;
    }

    const grossProfit = serviceProfit.plus(itemProfit);
    const netProfit = grossProfit;

    // totalExpenses within same range, independent of owner draws
    let expenseWhere: any = {};
    if (start) expenseWhere.expenseDate = { ...(expenseWhere.expenseDate ?? {}), gte: start };
    if (end) expenseWhere.expenseDate = { ...(expenseWhere.expenseDate ?? {}), lte: end };
    const expenses = await (this.prisma as any).expense.findMany({ where: expenseWhere });
    let totalExpenses = new Decimal(0);
    for (const e of expenses) {
      totalExpenses = totalExpenses.plus(new Decimal(e.amount));
    }
    const netProfitAfterExpenses = grossProfit.minus(totalExpenses);

    let grossMarginPct = '0.00';
    if (!totalRevenue.eq(0)) {
      grossMarginPct = grossProfit.div(totalRevenue).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
    }

    return {
      totalRevenue: this.to2dp(totalRevenue),
      totalCost: this.to2dp(totalCost),
      serviceProfit: this.to2dp(serviceProfit),
      itemProfit: this.to2dp(itemProfit),
      grossProfit: this.to2dp(grossProfit),
      netProfit: this.to2dp(netProfit),
      totalExpenses: this.to2dp(totalExpenses),
      netProfitAfterExpenses: this.to2dp(netProfitAfterExpenses),
      grossMarginPct,
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

    const customerAccounts = await (this.prisma as any).account.findMany({
      where: { role: 'CUSTOMER', contact: { isActive: true } },
      include: { contact: true },
      orderBy: { currentBalance: 'desc' },
    });
    const supplierAccounts = await (this.prisma as any).account.findMany({
      where: { role: 'SUPPLIER', contact: { isActive: true } },
      include: { contact: true },
      orderBy: { currentBalance: 'desc' },
    });

    const sortedCustomers = [...customerAccounts].sort((a: any, b: any) => {
      const av = new Decimal(a.currentBalance);
      const bv = new Decimal(b.currentBalance);
      return bv.comparedTo(av);
    });
    const sortedSuppliers = [...supplierAccounts].sort((a: any, b: any) => {
      const av = new Decimal(a.currentBalance);
      const bv = new Decimal(b.currentBalance);
      return bv.comparedTo(av);
    });

    const topDebtors = sortedCustomers.slice(0, 5).map((a: any) => ({
      contactId: a.contactId,
      contactName: a.contact?.name ?? '—',
      currentBalance: this.to2dp(a.currentBalance),
    })).filter((x: any) => new Decimal(x.currentBalance).gt(0));

    const topCreditors = sortedSuppliers.slice(0, 5).map((a: any) => ({
      contactId: a.contactId,
      contactName: a.contact?.name ?? '—',
      currentBalance: this.to2dp(a.currentBalance),
    })).filter((x: any) => new Decimal(x.currentBalance).gt(0));

    return {
      totalReceivables: capital.totalReceivables,
      totalPayables: capital.totalPayables,
      netDebtPosition,
      contacts,
      topDebtors,
      topCreditors,
    };
  }

  async getSummary(startDate?: string, endDate?: string) {
    const now = new Date();
    const defaultStart = this.getAlgeriaStartOfMonth(now);
    const { start, end } = this.resolveRange(startDate, endDate, false);
    const rangeStart = start ?? defaultStart;
    const rangeEnd = end ?? now;

    const capitalData = await this.getCapital();
    const totalCapital = capitalData.netCapital;
    const cashAndReceivables = capitalData.totalReceivables;
    const stockValue = capitalData.inventoryValue;

    const todayStart = this.getAlgeriaStartOfDay(now);
    const todayProfitData = await this.getProfitForRange(todayStart, now);
    const monthProfitData = await this.getProfitForRange(rangeStart, rangeEnd);

    const saleWhere: any = { type: 'SALE', createdAt: { gte: rangeStart, lte: rangeEnd } };
    const salesInRange = await (this.prisma as any).transaction.findMany({
      where: saleWhere,
    });
    const salesCount = salesInRange.length;
    let salesVolume = new Decimal(0);
    for (const tx of salesInRange) {
      salesVolume = salesVolume.plus(new Decimal(tx.amount));
    }

    const totalCustomerDebt = capitalData.totalReceivables;
    const totalSupplierDebt = capitalData.totalPayables;
    const netPosition = new Decimal(totalCustomerDebt).minus(new Decimal(totalSupplierDebt)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

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
    } catch {}
    for (const item of items) {
      const stock = await this.computeStock(item.id);
      if (stock <= lowStockThreshold) lowStockItems++;
      if (stock === 0) outOfStockItems++;
    }

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
      profit: {
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
      },
      sales: {
        salesCount,
        salesVolume: this.to2dp(salesVolume),
      },
      debts: {
        totalCustomerDebt: this.to2dp(totalCustomerDebt),
        totalSupplierDebt: this.to2dp(totalSupplierDebt),
        netPosition,
      },
      inventory: {
        totalItems,
        lowStockItems,
        outOfStockItems,
      },
      recentTransactions,
    };
  }

  async getExpenseReport(startDate?: string, endDate?: string) {
    const breakdown = await this.expensesService.getExpenseBreakdown(startDate, endDate);
    let totalExpenses = new Decimal(0);
    for (const b of breakdown) {
      totalExpenses = totalExpenses.plus(new Decimal(b.totalAmount));
    }
    return {
      breakdown,
      totalExpenses: this.to2dp(totalExpenses),
    };
  }
}
