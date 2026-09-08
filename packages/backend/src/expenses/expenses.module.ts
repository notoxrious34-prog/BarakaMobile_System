import { Module } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { CashModule } from '../cash/cash.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [CashModule, AuthModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
