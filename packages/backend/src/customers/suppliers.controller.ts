import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { SupplierDebtService } from './supplier-debt.service';
import { DebtSettlementDto } from './dto/debt-settlement.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { OpeningBalanceDto } from './dto/opening-balance.dto';
import { SettlementPaymentDto } from './dto/settlement-payment.dto';

/** AD-76 supplier counterparty endpoints (TB-141). Colocated with the
 * customer ledger domain per the established TB-114 layout. */
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly supplierDebtService: SupplierDebtService) {}

  @Post()
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.supplierDebtService.createSupplier(dto);
  }

  @Post(':id/opening-balance')
  setOpeningBalance(@Param('id') id: string, @Body() dto: OpeningBalanceDto) {
    return this.supplierDebtService.recordOpeningBalance(id, dto);
  }

  @Post(':id/payments')
  paySupplier(@Param('id') id: string, @Body() dto: SettlementPaymentDto) {
    return this.supplierDebtService.settleWithVoucher(id, dto);
  }

  @Get(':id/payable')
  getPayable(@Param('id') id: string) {
    return this.supplierDebtService.getPayable(id);
  }

  @Get(':id/supplier-ledger')
  getLedger(@Param('id') id: string, @Query('take') take?: string) {
    const n = take ? Number.parseInt(take, 10) : 50;
    return this.supplierDebtService.getLedger(id, Number.isNaN(n) ? 50 : n);
  }

  @Post(':id/supplier-settlement')
  settle(@Param('id') id: string, @Body() dto: DebtSettlementDto) {
    return this.supplierDebtService.settleDebt(id, dto);
  }

  @Post(':id/supplier-adjustment')
  adjust(
    @Param('id') id: string,
    @Body() body: { amount: string; direction: 'ADD' | 'SUB'; notes?: string; createdById?: string },
  ) {
    return this.supplierDebtService.adjustDebt(id, body);
  }
}
