import { Body, Controller, Get, Param, Post, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { SalesOrchestratorService } from '../../sales/sales-orchestrator.service';
import { ServerRbacGuard } from '../../core/guards/server-rbac.guard';
import { CurrentUser } from '../../core/guards/auth.decorator';
import type { SanitizedUser } from '../../auth/auth.service';
import { DomainErrorFilter } from './common/domain-error.filter';
import { ResponseEnvelopeInterceptor } from './common/envelope.interceptor';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { CreateSaleDto } from './dto/v3.dto';

/**
 * DIRECTIVE-018 Stage 9.1 — v3 sales gateway (`/api/v3/sales`).
 *
 * Thin HTTP translation over `SalesOrchestratorService`: validated DTOs
 * in, domain results out. `x-idempotency-key` is executed through the
 * shared `IdempotencyEngine` (replays never re-run domain work);
 * `ServerRbacGuard` attaches the caller (`CurrentUser`) whose id becomes
 * the audit `actorUserId`. Errors leave as domain errors and are mapped
 * to HTTP by `DomainErrorFilter`.
 */
@Controller('v3/sales')
@UseGuards(ServerRbacGuard)
@UseFilters(DomainErrorFilter)
@UseInterceptors(ResponseEnvelopeInterceptor, IdempotencyInterceptor)
export class SalesV3Controller {
  constructor(private readonly sales: SalesOrchestratorService) {}

  @Post()
  create(@Body() dto: CreateSaleDto, @CurrentUser() user?: SanitizedUser) {
    // NOTE: `x-idempotency-key` is executed by IdempotencyInterceptor at the
    // HTTP layer — it is deliberately NOT forwarded into the command, or the
    // engine would see a double begin (interceptor + orchestrator) and reject
    // every keyed request as concurrent. The domain key stays available for
    // non-HTTP callers.
    return this.sales.executeSale({
      partyId: dto.partyId,
      lines: dto.lines.map((line) => ({
        itemId: line.itemId,
        serialId: line.serialId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
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
    return this.sales.getSaleDetails(id);
  }
}
