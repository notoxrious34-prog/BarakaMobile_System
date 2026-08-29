import { Controller, Get, Param } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('capital')
  getCapital() {
    return this.reportsService.getCapital();
  }

  @Get('profit')
  getProfit() {
    return this.reportsService.getNetProfit();
  }

  @Get('debt-summary')
  getDebtSummary() {
    return this.reportsService.getDebtSummary();
  }

  @Get('contacts/:contactId/position')
  getContactPosition(@Param('contactId') contactId: string) {
    return this.reportsService.getContactPosition(contactId);
  }

  @Get('accounts/:accountId/ledger')
  getLedger(@Param('accountId') accountId: string) {
    return this.reportsService.getLedger(accountId);
  }
}
