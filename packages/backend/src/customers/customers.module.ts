import { Module } from '@nestjs/common';
import { DebtLedgerService } from './debt-ledger.service';
import { CustomersController } from './customers.controller';
import { CashModule } from '../cash/cash.module';

@Module({
  imports: [CashModule],
  controllers: [CustomersController],
  providers: [DebtLedgerService],
  exports: [DebtLedgerService],
})
export class CustomersModule {}
