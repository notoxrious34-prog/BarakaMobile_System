import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { CashModule } from '../cash/cash.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { RepairModule } from '../repair/repair.module';

@Module({
  imports: [CashModule, ExpensesModule, RepairModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
