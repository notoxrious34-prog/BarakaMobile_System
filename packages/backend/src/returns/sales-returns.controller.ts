import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { SalesReturnsService } from './sales-returns.service';
import { CreateSalesReturnDto } from './dto/create-sales-return.dto';

@Controller('sales/returns')
export class SalesReturnsController {
  constructor(private readonly service: SalesReturnsService) {}

  @Post()
  create(@Body() dto: CreateSalesReturnDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(
    @Query('originalTransactionId') originalTransactionId?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.service.findAll({ originalTransactionId, customerId });
  }

  @Get('by-number/:returnNumber')
  findByReturnNumber(@Param('returnNumber') returnNumber: string) {
    return this.service.findByReturnNumber(returnNumber);
  }

  @Get('by-invoice/:invoiceNumber')
  findByInvoice(@Param('invoiceNumber') invoiceNumber: string) {
    return this.service.findByInvoice(invoiceNumber);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
