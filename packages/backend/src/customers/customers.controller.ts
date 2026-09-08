import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { DebtLedgerService } from './debt-ledger.service';
import { DebtSettlementDto } from './dto/debt-settlement.dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly debtService: DebtLedgerService) {}

  @Get(':id/debt')
  getDebt(@Param('id') id: string) {
    return this.debtService.getDebt(id);
  }

  @Get(':id/debt-ledger')
  getLedger(@Param('id') id: string, @Query('take') take?: string) {
    const n = take ? Number.parseInt(take, 10) : 50;
    return this.debtService.getLedger(id, Number.isNaN(n) ? 50 : n);
  }

  @Post(':id/debt-settlement')
  settle(@Param('id') id: string, @Body() dto: DebtSettlementDto) {
    return this.debtService.settleDebt(id, dto);
  }

  @Post(':id/debt-adjustment')
  adjust(
    @Param('id') id: string,
    @Body() body: { amount: string; direction: 'ADD' | 'SUB'; notes?: string; createdById?: string },
  ) {
    return this.debtService.adjustDebt(id, body);
  }
}
