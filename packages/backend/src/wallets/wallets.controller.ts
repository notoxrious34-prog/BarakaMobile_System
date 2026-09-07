import { Controller, Get, Post, Put, Patch, Body, Param, Query, HttpCode } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { CreateWalletDto, UpdateWalletDto, CreateWalletServiceDto, UpdateWalletServiceDto, AdjustLedgerDto, TopupWalletDto, SellFlexyDto, UpdateWalletServicePatchDto, AdjustWalletBalanceDto } from './dto/wallet.dto';

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

  @Get('stats/summary')
  getWalletStats(@Query('date') date?: string) {
    return this.walletsService.getWalletStats(date);
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
    @Query('serviceId') serviceId?: string,
    @Query('search') search?: string,
    @Query('skip') skip?: string,
  ) {
    return this.walletsService.getLedger(id, {
      entryType,
      startDate,
      endDate,
      page: page !== undefined ? Number(page) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
      serviceId,
      search,
      skip: skip !== undefined ? Number(skip) : undefined,
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

  @Patch(':id')
  patchWallet(@Param('id') id: string, @Body() dto: UpdateWalletDto) {
    return this.walletsService.updateWallet(id, dto);
  }

  @Patch(':id/services/:serviceId')
  patchService(
    @Param('id') id: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: UpdateWalletServicePatchDto,
  ) {
    return this.walletsService.patchService(id, serviceId, dto);
  }

  @Post(':id/adjustment')
  @HttpCode(201)
  adjustBalance(@Param('id') id: string, @Body() dto: AdjustWalletBalanceDto) {
    return this.walletsService.adjustBalance(id, dto);
  }
}
