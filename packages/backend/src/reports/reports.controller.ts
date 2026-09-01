import { Controller, Get, Param, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('capital')
  getCapital() {
    return this.reportsService.getCapital();
  }

  @Get('profit')
  getProfit(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.reportsService.getNetProfit(startDate, endDate);
  }

  @Get('debt-summary')
  getDebtSummary() {
    return this.reportsService.getDebtSummary();
  }

  @Get('summary')
  getSummary(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.reportsService.getSummary(startDate, endDate);
  }

  @Get('contacts/:contactId/position')
  getContactPosition(@Param('contactId') contactId: string) {
    return this.reportsService.getContactPosition(contactId);
  }

  @Get('accounts/:accountId/ledger')
  getLedger(@Param('accountId') accountId: string) {
    return this.reportsService.getLedger(accountId);
  }

  @Get('expenses')
  getExpensesReport(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.reportsService.getExpenseReport(startDate, endDate);
  }
}
