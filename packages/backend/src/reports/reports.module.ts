import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { CashModule } from '../cash/cash.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { RepairModule } from '../repair/repair.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [CashModule, ExpensesModule, RepairModule, AuthModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
