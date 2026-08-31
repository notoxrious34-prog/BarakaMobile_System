import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { CashModule } from '../cash/cash.module';
import { ExpensesModule } from '../expenses/expenses.module';

@Module({
  imports: [CashModule, ExpensesModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
