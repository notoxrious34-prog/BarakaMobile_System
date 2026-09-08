import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { CashModule } from '../cash/cash.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [CashModule, CustomersModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
