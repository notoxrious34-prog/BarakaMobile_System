import { Controller, Get, Post, Put, Body, Param, Query, HttpCode } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { CreateWalletDto, UpdateWalletDto, CreateWalletServiceDto, UpdateWalletServiceDto, AdjustLedgerDto, TopupWalletDto, SellFlexyDto } from './dto/wallet.dto';

@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  listWallets() {
    return this.walletsService.listWallets();
  }

  @Post()
  createWallet(@Body() dto: CreateWalletDto) {
    return this.walletsService.createWallet(dto);
  }

  @Get(':id')
  getWallet(@Param('id') id: string) {
    return this.walletsService.getWallet(id);
  }

  @Put(':id')
  updateWallet(@Param('id') id: string, @Body() dto: UpdateWalletDto) {
    return this.walletsService.updateWallet(id, dto);
  }

  @Get(':id/ledger')
  getLedger(
    @Param('id') id: string,
    @Query('entryType') entryType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.walletsService.getLedger(id, {
      entryType,
      startDate,
      endDate,
      page: page !== undefined ? Number(page) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
    });
  }

  @Post(':id/ledger/adjust')
  adjustLedger(@Param('id') id: string, @Body() dto: AdjustLedgerDto) {
    return this.walletsService.adjustLedger(id, dto);
  }

  @Post(':id/topup')
  @HttpCode(201)
  topupWallet(@Param('id') id: string, @Body() dto: TopupWalletDto) {
    return this.walletsService.topupWallet(id, dto);
  }

  @Post(':id/services')
  addService(@Param('id') id: string, @Body() dto: CreateWalletServiceDto) {
    return this.walletsService.addService(id, dto);
  }

  @Post(':id/sale')
  @HttpCode(201)
  sellFlexy(@Param('id') id: string, @Body() dto: SellFlexyDto) {
    return this.walletsService.sellFlexy(id, dto);
  }

  @Put('services/:serviceId')
  updateService(@Param('serviceId') serviceId: string, @Body() dto: UpdateWalletServiceDto) {
    return this.walletsService.updateService(serviceId, dto);
  }
}
