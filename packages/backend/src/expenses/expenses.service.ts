import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, ExpensePaymentSource } from '@prisma/client';
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

  async createExpense(dto: {
    categoryId: string;
    amount: string;
    description?: string;
    expenseDate?: string;
    paymentSource?: ExpensePaymentSource;
    recipientName?: string;
    invoiceReference?: string;
  }, operatorId?: string): Promise<any> {
    const normalizedAmount = this.normalizeAmount(dto.amount);
    if (new Decimal(normalizedAmount).lte(0)) {
      throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر');
    }
    const source: ExpensePaymentSource = dto.paymentSource ?? ExpensePaymentSource.REGISTER_CASH;
    if (!Object.values(ExpensePaymentSource).includes(source)) {
      throw new BadRequestException('مصدر الدفع غير صالح');
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
      const expenseNumber = await this.nextExpenseNumber(tx, expenseDate ?? new Date());
      const recipient = dto.recipientName?.trim() || undefined;
      const invoiceRef = dto.invoiceReference?.trim() || undefined;
      const expense = await tx.expense.create({
        data: {
          expenseNumber,
          categoryId: dto.categoryId,
          amount: normalizedAmount,
          paymentSource: source,
          recipientName: recipient,
          invoiceReference: invoiceRef,
          operatorId: operatorId ?? null,
          description: dto.description,
          ...(expenseDate ? { expenseDate } : {}),
        },
      });
      if (source === ExpensePaymentSource.REGISTER_CASH) {
        // Pre-check drawer with the exact Arabic message before posting.
        const cashAccount = await tx.cashAccount.findFirst({});
        const available = new Decimal(cashAccount?.currentBalance ?? '0.00');
        if (available.lt(new Decimal(normalizedAmount))) {
          throw new BadRequestException('رصيد الصندوق الحالي غير كافٍ لتسجيل هذا المصروف');
        }
        const movement = await this.cashService.postCashMovement(tx, {
          type: 'OUT',
          category: 'EXPENSE',
          amount: normalizedAmount,
          note: `مصروف نثريات: ${category.name} - ${dto.description ?? ''}`.trim(),
          relatedExpenseId: expense.id,
          operatorId: operatorId ?? undefined,
        });
        await tx.expense.update({
          where: { id: expense.id },
          data: { cashMovementId: movement.id },
        });
        return tx.expense.findUnique({ where: { id: expense.id }, include: { category: true } });
      }
      return tx.expense.findUnique({ where: { id: expense.id }, include: { category: true } });
    });
  }

  private async nextExpenseNumber(tx: PrismaTx, ref: Date): Promise<string> {
    const year = ref.getFullYear();
    for (let attempt = 0; attempt < 10; attempt++) {
      const count = await tx.expense.count({
        where: { expenseDate: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } },
      });
      const candidate = `EXP-${year}-${String(count + 1 + attempt).padStart(5, '0')}`;
      const existing = await tx.expense.findUnique({ where: { expenseNumber: candidate } });
      if (!existing) return candidate;
    }
    throw new BadRequestException('تعذر توليد رقم سند فريد');
  }

  async findAllExpenses(filters?: {
    startDate?: string;
    endDate?: string;
    categoryId?: string;
    paymentSource?: ExpensePaymentSource;
    search?: string;
  }): Promise<any[]> {
    const where: any = {};
    if (filters?.categoryId) where.categoryId = filters.categoryId;
    if (filters?.paymentSource) where.paymentSource = filters.paymentSource;
    if (filters?.search?.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { expenseNumber: { contains: q } },
        { recipientName: { contains: q } },
        { description: { contains: q } },
        { invoiceReference: { contains: q } },
      ];
    }
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

  async getExpenseById(id: string): Promise<any> {
    const expense = await this.prisma.expense.findUnique({ where: { id }, include: { category: true } });
    if (!expense) throw new NotFoundException('سند المصروف غير موجود');
    return expense;
  }

  async getExpenseMetrics(): Promise<{ today: string; month: string; topCategory: { id: string; name: string; total: string } | null }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sum = (rows: { amount: string }[]): Decimal => {
      let acc = new Decimal(0);
      for (const r of rows) acc = acc.plus(new Decimal(r.amount));
      return acc;
    };
    const todayRows = await this.prisma.expense.findMany({
      where: { expenseDate: { gte: this.getAlgeriaStartOfDay(now), lte: this.getAlgeriaEndOfDay(now) } },
      select: { amount: true },
    });
    const monthRows = await this.prisma.expense.findMany({
      where: { expenseDate: { gte: startOfMonth } },
      select: { amount: true, categoryId: true, category: { select: { name: true } } },
    });
    const perCat = new Map<string, { name: string; total: Decimal }>();
    for (const r of monthRows as { amount: string; categoryId: string; category: { name: string } | null }[]) {
      const prev = perCat.get(r.categoryId);
      if (prev) prev.total = prev.total.plus(new Decimal(r.amount));
      else perCat.set(r.categoryId, { name: r.category?.name ?? '—', total: new Decimal(r.amount) });
    }
    let top: { id: string; name: string; total: string } | null = null;
    for (const [id, v] of perCat.entries()) {
      if (!top || v.total.gt(new Decimal(top.total))) top = { id, name: v.name, total: this.to2dp(v.total) };
    }
    return { today: this.to2dp(sum(todayRows)), month: this.to2dp(sum(monthRows)), topCategory: top };
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

  async updateCategory(id: string, dto: { name?: string; description?: string; isActive?: boolean }): Promise<any> {
    const cat = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('الفئة غير موجودة');
    const data: any = {};
    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      if (trimmed.length < 2) throw new BadRequestException('الاسم قصير جداً');
      const clash = await this.prisma.expenseCategory.findFirst({ where: { name: trimmed, id: { not: id } } });
      if (clash) throw new ConflictException('فئة بهذا الاسم موجودة مسبقاً');
      data.name = trimmed;
    }
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.expenseCategory.update({ where: { id }, data });
  }

  async deleteCategory(id: string): Promise<void> {
    const cat = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('الفئة غير موجودة');
    if (cat.isSystem) throw new BadRequestException('فئات النظام محمية ولا يمكن حذفها');
    const linked = await this.prisma.expense.count({ where: { categoryId: id } });
    if (linked > 0) throw new ConflictException('لا يمكن حذف فئة مرتبطة بسندات مصروفات');
    await this.prisma.expenseCategory.delete({ where: { id } });
  }
}
