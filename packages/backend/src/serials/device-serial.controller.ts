import { Controller, Get, Post, Put, Param, Body, Query, Headers } from '@nestjs/common';
import { DeviceSerialService } from './device-serial.service';
import { DeviceStatus } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { sessionTokenOf } from '../auth/session-header';

@Controller('serials')
export class DeviceSerialController {
  constructor(
    private readonly serials: DeviceSerialService,
    private readonly authService: AuthService,
  ) {}

  private operatorId(headers: Record<string, string | string[] | undefined>) {
    return this.authService.userForToken(sessionTokenOf(headers)).then((u) => u?.id);
  }

  @Get('lookup/:imei')
  lookup(@Param('imei') imei: string) {
    return this.serials.lookup(imei);
  }

  @Get('metrics')
  metrics() {
    return this.serials.metrics();
  }

  @Get('availability')
  availability(@Query('itemIds') itemIds?: string) {
    const ids = (itemIds ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return this.serials.availability(ids);
  }

  @Get('warranty-claims')
  claims(@Query('activeOnly') activeOnly?: string) {
    return this.serials.listClaims(activeOnly === 'true' || activeOnly === '1');
  }

  @Get()
  list(
    @Query('status') status?: string,
    @Query('itemId') itemId?: string,
    @Query('search') search?: string,
  ) {
    return this.serials.listSerials({ status: status as DeviceStatus | undefined, itemId, search });
  }

  @Post()
  async register(
    @Body()
    dto: {
      imei1: string;
      imei2?: string;
      itemId: string;
      supplierContactId?: string;
      purchaseInvoiceRef?: string;
      purchaseCost?: string;
      warrantyMonths?: number;
      notes?: string;
    },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.serials.registerSerial({ ...dto, operatorId: (await this.operatorId(headers)) ?? undefined });
  }

  @Post(':id/attach-sale')
  async attachSale(
    @Param('id') id: string,
    @Body()
    dto: { saleInvoiceId: string; customerContactId?: string; customerName?: string; customerPhone?: string; warrantyMonths?: number },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.serials.attachToSaleById(id, { ...dto, operatorId: (await this.operatorId(headers)) ?? undefined });
  }

  @Put(':id/status')
  async setStatus(
    @Param('id') id: string,
    @Body() dto: { status: DeviceStatus; description?: string },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.serials.setStatus(id, dto.status, {
      description: dto.description,
      operatorId: (await this.operatorId(headers)) ?? undefined,
    });
  }

  @Post('warranty-claims')
  async createClaim(
    @Body()
    dto: { deviceSerialId?: string; imei?: string; customerName: string; customerPhone: string; reportedIssue: string },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.serials.createClaim({ ...dto, operatorId: (await this.operatorId(headers)) ?? undefined });
  }

  @Put('warranty-claims/:id/resolve')
  async resolveClaim(
    @Param('id') id: string,
    @Body() dto: { verdict: 'APPROVED_REPAIR' | 'APPROVED_REPLACEMENT' | 'REJECTED_MISUSE' | 'PENDING_INSPECTION'; actionTaken?: string },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.serials.resolveClaim(id, { ...dto, operatorId: (await this.operatorId(headers)) ?? undefined });
  }
}
