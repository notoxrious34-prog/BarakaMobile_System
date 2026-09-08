import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Headers } from '@nestjs/common';
import { ExpensePaymentSource } from '@prisma/client';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { AuthService } from '../auth/auth.service';
import { sessionTokenOf } from '../auth/session-header';

@Controller('expenses')
export class ExpensesController {
  constructor(
    private readonly expensesService: ExpensesService,
    private readonly authService: AuthService,
  ) {}

  private operatorId(headers: Record<string, string | string[] | undefined>) {
    return this.authService.userForToken(sessionTokenOf(headers)).then((u) => u?.id);
  }

  @Get()
  findAll(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('categoryId') categoryId?: string,
    @Query('paymentSource') paymentSource?: string,
    @Query('search') search?: string,
  ) {
    return this.expensesService.findAllExpenses({
      startDate,
      endDate,
      categoryId,
      paymentSource: (paymentSource as ExpensePaymentSource | undefined) ?? undefined,
      search,
    });
  }

  @Post()
  async create(
    @Body() dto: CreateExpenseDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.expensesService.createExpense(dto, await this.operatorId(headers));
  }

  @Get('metrics')
  metrics() {
    return this.expensesService.getExpenseMetrics();
  }

  @Get('breakdown')
  breakdown(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.expensesService.getExpenseBreakdown(startDate, endDate);
  }

  @Get('categories')
  categories() {
    return this.expensesService.findAllCategories();
  }

  @Post('categories')
  createCat(@Body() dto: CreateExpenseCategoryDto) {
    return this.expensesService.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCat(@Param('id') id: string, @Body() dto: { name?: string; description?: string; isActive?: boolean }) {
    return this.expensesService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  async removeCat(@Headers() headers: Record<string, string | string[] | undefined>, @Param('id') id: string) {
    await this.authService.requireAdmin(sessionTokenOf(headers));
    return this.expensesService.deleteCategory(id);
  }

  // NOTE: ':id' stays last — otherwise it swallows /categories, /metrics, /breakdown.
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.expensesService.getExpenseById(id);
  }
}
