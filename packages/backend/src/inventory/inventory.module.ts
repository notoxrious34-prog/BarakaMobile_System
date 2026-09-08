import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { StockCountService } from './stock-count/stock-count.service';
import { StockCountController } from './stock-count/stock-count.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [InventoryController, StockCountController],
  providers: [InventoryService, StockCountService],
})
export class InventoryModule {}
