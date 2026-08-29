import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateOffsetDto } from './dto/create-offset.dto';
import { TransactionType } from '@prisma/client';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('sale')
  createSale(@Body() dto: CreateTransactionDto) {
    // Force type to SALE
    dto.type = TransactionType.SALE;
    return this.transactionsService.createTransaction(dto);
  }

  @Post('purchase')
  createPurchase(@Body() dto: CreateTransactionDto) {
    dto.type = TransactionType.PURCHASE;
    return this.transactionsService.createTransaction(dto);
  }

  @Post('payment-in')
  createPaymentIn(@Body() dto: CreatePaymentDto) {
    return this.transactionsService.createPayment(dto, TransactionType.PAYMENT_IN);
  }

  @Post('payment-out')
  createPaymentOut(@Body() dto: CreatePaymentDto) {
    return this.transactionsService.createPayment(dto, TransactionType.PAYMENT_OUT);
  }

  @Post('offset')
  createOffset(@Body() dto: CreateOffsetDto) {
    return this.transactionsService.createOffset(dto);
  }

  @Get()
  findAll(@Query('accountId') accountId?: string, @Query('type') type?: TransactionType) {
    return this.transactionsService.findAll({ accountId, type });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transactionsService.findOne(id);
  }
}
