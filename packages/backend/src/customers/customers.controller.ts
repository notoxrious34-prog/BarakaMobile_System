import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { DebtLedgerService } from './debt-ledger.service';
import { SupplierDebtService } from './supplier-debt.service';
import { DebtSettlementDto } from './dto/debt-settlement.dto';

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly debtService: DebtLedgerService,
    private readonly supplierDebtService: SupplierDebtService,
  ) {}

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

  @Get(':id/payable')
  getPayable(@Param('id') id: string) {
    return this.supplierDebtService.getPayable(id);
  }

  @Get(':id/supplier-ledger')
  getSupplierLedger(@Param('id') id: string, @Query('take') take?: string) {
    const n = take ? Number.parseInt(take, 10) : 50;
    return this.supplierDebtService.getLedger(id, Number.isNaN(n) ? 50 : n);
  }

  @Post(':id/supplier-settlement')
  settleSupplier(@Param('id') id: string, @Body() dto: DebtSettlementDto) {
    return this.supplierDebtService.settleDebt(id, dto);
  }

  @Post(':id/supplier-adjustment')
  adjustSupplier(
    @Param('id') id: string,
    @Body() body: { amount: string; direction: 'ADD' | 'SUB'; notes?: string; createdById?: string },
  ) {
    return this.supplierDebtService.adjustDebt(id, body);
  }
}
