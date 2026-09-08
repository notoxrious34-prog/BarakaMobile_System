import { Module } from '@nestjs/common';
import { RepairService } from './repair.service';
import { RepairController } from './repair.controller';
import { CashModule } from '../cash/cash.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [CashModule, AuthModule],
  controllers: [RepairController],
  providers: [RepairService],
  exports: [RepairService],
})
export class RepairModule {}
