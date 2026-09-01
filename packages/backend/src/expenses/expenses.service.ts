import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { CashService } from '../cash/cash.service';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService, private readonly cashService: CashService) {}

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

  async createExpense(dto: { categoryId: string; amount: string; description?: string; expenseDate?: string }): Promise<any> {
    const normalizedAmount = this.normalizeAmount(dto.amount);
    if (new Decimal(normalizedAmount).lte(0)) {
      throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر');
    }
    return this.prisma.$transaction(async (tx: PrismaTx) => {
      const category = await tx.expenseCategory.findFirst({
        where: { id: dto.categoryId, isActive: true },
      });
      if (!category) {
        throw new NotFoundException('فئة المصاريف غير موجودة أو غير نشطة');
      }
      let expenseDate: Date | undefined;
      if (dto.expenseDate) {
        const d = new Date(dto.expenseDate);
        if (!Number.isNaN(d.getTime())) expenseDate = d;
      }
      const expense = await tx.expense.create({
        data: {
          categoryId: dto.categoryId,
          amount: normalizedAmount,
          description: dto.description,
          ...(expenseDate ? { expenseDate } : {}),
        },
      });
      await this.cashService.postCashMovement(tx, {
        type: 'OUT',
        category: 'EXPENSE',
        amount: normalizedAmount,
        note: dto.description,
        relatedExpenseId: expense.id,
      });
      return expense;
    });
  }

  async findAllExpenses(filters?: { startDate?: string; endDate?: string; categoryId?: string }): Promise<any[]> {
    const where: any = {};
    if (filters?.categoryId) where.categoryId = filters.categoryId;
    if (filters?.startDate || filters?.endDate) {
      where.expenseDate = {};
      if (filters.startDate) {
        const d = new Date(filters.startDate);
        if (!Number.isNaN(d.getTime())) where.expenseDate.gte = this.getAlgeriaStartOfDay(d);
      }
      if (filters.endDate) {
        const d = new Date(filters.endDate);
        if (!Number.isNaN(d.getTime())) where.expenseDate.lte = this.getAlgeriaEndOfDay(d);
      }
    }
    return this.prisma.expense.findMany({ where, include: { category: true }, orderBy: { expenseDate: 'desc' } });
  }

  async getExpenseBreakdown(startDate?: string, endDate?: string): Promise<{ categoryId: string; categoryName: string; totalAmount: string; percentage: string }[]> {
    const expenses = await this.findAllExpenses({ startDate, endDate });
    let grandTotal = new Decimal(0);
    const perCat = new Map<string, { name: string; total: Decimal }>();
    for (const e of expenses) {
      const amt = new Decimal(e.amount);
      grandTotal = grandTotal.plus(amt);
      const key = e.categoryId;
      const prev = perCat.get(key);
      if (prev) prev.total = prev.total.plus(amt);
      else perCat.set(key, { name: e.category?.name ?? '—', total: amt });
    }
    const result: { categoryId: string; categoryName: string; totalAmount: string; percentage: string }[] = [];
    for (const [categoryId, v] of perCat.entries()) {
      const pct = grandTotal.eq(0) ? '0.00' : v.total.div(grandTotal).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
      result.push({ categoryId, categoryName: v.name, totalAmount: this.to2dp(v.total), percentage: pct });
    }
    result.sort((a, b) => new Decimal(b.totalAmount).comparedTo(new Decimal(a.totalAmount)));
    return result;
  }

  async createCategory(dto: { name: string }): Promise<any> {
    const trimmed = dto.name.trim();
    if (trimmed.length < 2) throw new BadRequestException('الاسم قصير جداً');
    const existing = await this.prisma.expenseCategory.findFirst({ where: { name: trimmed } });
    if (existing) {
      if (!existing.isActive) {
        return this.prisma.expenseCategory.update({ where: { id: existing.id }, data: { isActive: true } });
      }
      throw new BadRequestException('فئة بهذا الاسم موجودة مسبقاً');
    }
    return this.prisma.expenseCategory.create({ data: { name: trimmed } });
  }

  async findAllCategories(): Promise<any[]> {
    return this.prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  async deactivateCategory(id: string): Promise<any> {
    const cat = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('الفئة غير موجودة');
    if (!cat.isActive) return cat;
    return this.prisma.expenseCategory.update({ where: { id }, data: { isActive: false } });
  }
}
