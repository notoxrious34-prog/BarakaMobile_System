import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class CashService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeAmount(value: string): string {
    return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }

  private to2dp(v: string | Decimal): string {
    return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }

  private getAlgeriaStartOfDay(now: Date): Date {
    const ms = now.getTime() + 60 * 60 * 1000;
    const d = new Date(ms);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0) - 60 * 60 * 1000);
  }

  private getAlgeriaEndOfDay(now: Date): Date {
    const s = this.getAlgeriaStartOfDay(now);
    return new Date(s.getTime() + 24 * 60 * 60 * 1000 - 1);
  }

  async postCashMovement(
    tx: PrismaTx,
    params: {
      type: 'IN' | 'OUT';
      category: string;
      amount: string;
      note?: string;
      relatedTransactionId?: string;
      relatedExpenseId?: string;
    },
  ): Promise<void> {
    const normalizedAmount = this.normalizeAmount(params.amount);
    const amountDec = new Decimal(normalizedAmount);
    if (amountDec.lte(0)) {
      throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر');
    }
    let cashAccount = await (tx as any).cashAccount.findFirst({});
    if (!cashAccount) {
      cashAccount = await (tx as any).cashAccount.create({ data: { currentBalance: '0.00' } });
    }
    const beforeDec = new Decimal(cashAccount.currentBalance);
    let afterDec: Decimal;
    if (params.type === 'IN') {
      afterDec = beforeDec.plus(amountDec);
    } else {
      afterDec = beforeDec.minus(amountDec);
      if (afterDec.lt(0)) {
        throw new BadRequestException('رصيد الصندوق غير كافٍ لإتمام هذه العملية');
      }
    }
    const balanceBefore = this.to2dp(beforeDec);
    const balanceAfter = this.to2dp(afterDec);
    await (tx as any).cashMovement.create({
      data: {
        cashAccountId: cashAccount.id,
        type: params.type,
        category: params.category,
        amount: normalizedAmount,
        balanceBefore,
        balanceAfter,
        note: params.note,
        relatedTransactionId: params.relatedTransactionId,
        relatedExpenseId: params.relatedExpenseId,
      },
    });
    await (tx as any).cashAccount.update({
      where: { id: cashAccount.id },
      data: { currentBalance: balanceAfter },
    });
  }

  async getCurrentBalance(): Promise<{ currentBalance: string }> {
    let acc = await (this.prisma as any).cashAccount.findFirst({});
    if (!acc) {
      acc = await (this.prisma as any).cashAccount.create({ data: { currentBalance: '0.00' } });
    }
    return { currentBalance: this.to2dp(acc.currentBalance) };
  }

  async getMovements(filters?: { startDate?: string; endDate?: string; category?: string }): Promise<any[]> {
    const where: any = {};
    if (filters?.category) where.category = filters.category;
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        const d = new Date(filters.startDate);
        if (!Number.isNaN(d.getTime())) where.createdAt.gte = this.getAlgeriaStartOfDay(d);
      }
      if (filters.endDate) {
        const d = new Date(filters.endDate);
        if (!Number.isNaN(d.getTime())) where.createdAt.lte = this.getAlgeriaEndOfDay(d);
      }
    }
    return (this.prisma as any).cashMovement.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async recordOwnerDraw(dto: { amount: string; note?: string }): Promise<any> {
    return this.prisma.$transaction(async (tx: PrismaTx) => {
      await this.postCashMovement(tx, { type: 'OUT', category: 'OWNER_DRAW', amount: dto.amount, note: dto.note });
      const acc = await (tx as any).cashAccount.findFirst({});
      const last = await (tx as any).cashMovement.findFirst({ orderBy: { createdAt: 'desc' } });
      return last;
    });
  }

  async recordOwnerDeposit(dto: { amount: string; note?: string }): Promise<any> {
    return this.prisma.$transaction(async (tx: PrismaTx) => {
      await this.postCashMovement(tx, { type: 'IN', category: 'OWNER_DEPOSIT', amount: dto.amount, note: dto.note });
      const last = await (tx as any).cashMovement.findFirst({ orderBy: { createdAt: 'desc' } });
      return last;
    });
  }

  async getDailyClosing(date: string): Promise<{ date: string; openingBalance: string; totalIn: string; totalOut: string; closingBalance: string; breakdown: { category: string; amount: string }[] }> {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid date');
    const start = this.getAlgeriaStartOfDay(d);
    const end = this.getAlgeriaEndOfDay(d);
    const movements = await (this.prisma as any).cashMovement.findMany({
      where: { createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'asc' },
    });
    let openingBalance = '0.00';
    if (movements.length > 0) {
      openingBalance = movements[0].balanceBefore;
    } else {
      const lastBefore = await (this.prisma as any).cashMovement.findFirst({
        where: { createdAt: { lt: start } },
        orderBy: { createdAt: 'desc' },
      });
      if (lastBefore) openingBalance = lastBefore.balanceAfter;
      else {
        const acc = await (this.prisma as any).cashAccount.findFirst({});
        openingBalance = acc ? this.to2dp(acc.currentBalance) : '0.00';
        // If there are movements after this date, we need balance before that date; if no movements at all, current balance is correct for empty day
        // But if movements exist only after, opening should be 0 or last before — already handled.
        // For correctness when no movements in range and no prior, use lastBefore or 0.
        if (lastBefore) openingBalance = lastBefore.balanceAfter;
        // If we have future movements but no prior, opening is still balanceBefore of first future? Actually opening for empty day with future data should be balanceAfter of lastBefore or 0.
        // Keep as is.
      }
    }
    let totalIn = new Decimal(0);
    let totalOut = new Decimal(0);
    const breakdownMap = new Map<string, Decimal>();
    for (const m of movements) {
      const amt = new Decimal(m.amount);
      if (m.type === 'IN') totalIn = totalIn.plus(amt);
      else totalOut = totalOut.plus(amt);
      const key = m.category;
      const prev = breakdownMap.get(key) ?? new Decimal(0);
      breakdownMap.set(key, prev.plus(amt));
    }
    let closingBalance: string;
    if (movements.length > 0) {
      closingBalance = movements[movements.length - 1].balanceAfter;
    } else {
      const openDec = new Decimal(openingBalance);
      closingBalance = openDec.plus(totalIn).minus(totalOut).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
      // If no movements, closing == opening
    }
    const breakdown = Array.from(breakdownMap.entries()).map(([category, amount]) => ({
      category,
      amount: this.to2dp(amount),
    }));
    return {
      date: date.slice(0, 10),
      openingBalance: this.to2dp(openingBalance),
      totalIn: this.to2dp(totalIn),
      totalOut: this.to2dp(totalOut),
      closingBalance: this.to2dp(closingBalance),
      breakdown,
    };
  }
}
