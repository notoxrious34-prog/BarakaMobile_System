import { Module } from '@nestjs/common';
import { DebtLedgerService } from './debt-ledger.service';
import { SupplierDebtService } from './supplier-debt.service';
import { CustomersController } from './customers.controller';
import { SuppliersController } from './suppliers.controller';
import { CashModule } from '../cash/cash.module';

@Module({
  imports: [CashModule],
  controllers: [CustomersController, SuppliersController],
  providers: [DebtLedgerService, SupplierDebtService],
  exports: [DebtLedgerService, SupplierDebtService],
})
export class CustomersModule {}
