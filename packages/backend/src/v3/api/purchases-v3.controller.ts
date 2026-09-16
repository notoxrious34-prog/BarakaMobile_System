import { Body, Controller, Get, Param, Post, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { PurchasesOrchestratorService } from '../../purchasing/purchases-orchestrator.service';
import { ServerRbacGuard } from '../../core/guards/server-rbac.guard';
import { CurrentUser } from '../../core/guards/auth.decorator';
import type { SanitizedUser } from '../../auth/auth.service';
import { DomainErrorFilter } from './common/domain-error.filter';
import { ResponseEnvelopeInterceptor } from './common/envelope.interceptor';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { CreatePurchaseDto } from './dto/v3.dto';

/**
 * DIRECTIVE-018 Stage 9.1 — v3 purchasing gateway (`/api/v3/purchases`).
 *
 * Thin HTTP translation over `PurchasesOrchestratorService` (atomic
 * purchase with serial registration, moving-average cost, AP leg).
 * Idempotency, RBAC, envelope and error mapping follow the sales
 * gateway conventions.
 */
@Controller('v3/purchases')
@UseGuards(ServerRbacGuard)
@UseFilters(DomainErrorFilter)
@UseInterceptors(ResponseEnvelopeInterceptor, IdempotencyInterceptor)
export class PurchasesV3Controller {
  constructor(private readonly purchases: PurchasesOrchestratorService) {}

  @Post()
  create(@Body() dto: CreatePurchaseDto, @CurrentUser() user?: SanitizedUser) {
    // NOTE: idempotency lives in IdempotencyInterceptor (see sales gateway) —
    // the header is not forwarded into the domain command (no double begin).
    return this.purchases.executePurchase({
      partyId: dto.partyId,
      lines: dto.lines.map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
        unitCost: line.unitCost,
        serials: line.serials?.map((serial) => ({
          imei1: serial.imei1,
          imei2: serial.imei2,
          warrantyMonths: serial.warrantyMonths,
        })),
      })),
      discountAmount: dto.discountAmount,
      payments: dto.payments.map((payment) => ({
        paymentMethod: payment.paymentMethod,
        amount: payment.amount,
      })),
      actorUserId: user?.id,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.purchases.getPurchaseDetails(id);
  }
}
