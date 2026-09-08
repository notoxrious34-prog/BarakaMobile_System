import { Module } from '@nestjs/common';
import { DebtLedgerService } from './debt-ledger.service';
import { SupplierDebtService } from './supplier-debt.service';
import { CustomersController } from './customers.controller';
import { CashModule } from '../cash/cash.module';

@Module({
  imports: [CashModule],
  controllers: [CustomersController],
  providers: [DebtLedgerService, SupplierDebtService],
  exports: [DebtLedgerService, SupplierDebtService],
})
export class CustomersModule {}
