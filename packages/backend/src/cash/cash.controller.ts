import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { CashService } from './cash.service';

@Controller('cash')
export class CashController {
  constructor(private readonly cashService: CashService) {}

  @Get('balance')
  getBalance() {
    return this.cashService.getCurrentBalance();
  }

  @Get('movements')
  getMovements(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('category') category?: string) {
    return this.cashService.getMovements({ startDate, endDate, category });
  }

  @Post('owner-draw')
  ownerDraw(@Body() dto: { amount: string; note?: string }) {
    return this.cashService.recordOwnerDraw(dto);
  }

  @Post('owner-deposit')
  ownerDeposit(@Body() dto: { amount: string; note?: string }) {
    return this.cashService.recordOwnerDeposit(dto);
  }

  @Get('daily-closing')
  dailyClosing(@Query('date') date: string) {
    return this.cashService.getDailyClosing(date);
  }
}
