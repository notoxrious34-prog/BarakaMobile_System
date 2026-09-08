import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { StockCountService } from './stock-count.service';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import { ScanStockCountDto } from './dto/scan-stock-count.dto';

@Controller('inventory/stock-counts')
export class StockCountController {
  constructor(private readonly stockCountService: StockCountService) {}

  @Post()
  create(@Body() dto: CreateStockCountDto) {
    return this.stockCountService.createSession(dto);
  }

  @Get()
  list() {
    return this.stockCountService.listSessions();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.stockCountService.getSession(id);
  }

  @Post(':id/scan')
  scan(@Param('id') id: string, @Body() dto: ScanStockCountDto) {
    return this.stockCountService.scan(id, dto);
  }

  @Post(':id/reconcile')
  reconcile(@Param('id') id: string) {
    return this.stockCountService.reconcile(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.stockCountService.cancel(id);
  }
}
