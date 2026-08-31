import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  findAll(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('categoryId') categoryId?: string) {
    return this.expensesService.findAllExpenses({ startDate, endDate, categoryId });
  }

  @Post()
  create(@Body() dto: CreateExpenseDto) {
    return this.expensesService.createExpense(dto);
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

  @Delete('categories/:id')
  deactivate(@Param('id') id: string) {
    return this.expensesService.deactivateCategory(id);
  }
}
