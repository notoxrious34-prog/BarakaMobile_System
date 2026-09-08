import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ExpensePaymentSource } from '@prisma/client';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

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
  create(@Body() dto: CreateExpenseDto) {
    return this.expensesService.createExpense(dto);
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
  removeCat(@Param('id') id: string) {
    return this.expensesService.deleteCategory(id);
  }

  // NOTE: ':id' stays last — otherwise it swallows /categories, /metrics, /breakdown.
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.expensesService.getExpenseById(id);
  }
}
