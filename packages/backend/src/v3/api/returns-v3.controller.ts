import { Body, Controller, Get, Param, Post, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { ReturnsOrchestratorService } from '../../returns/returns-orchestrator.service';
import { ServerRbacGuard } from '../../core/guards/server-rbac.guard';
import { CurrentUser } from '../../core/guards/auth.decorator';
import type { SanitizedUser } from '../../auth/auth.service';
import { DomainErrorFilter } from './common/domain-error.filter';
import { ResponseEnvelopeInterceptor } from './common/envelope.interceptor';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { CreateSalesReturnDto } from './dto/v3.dto';

/**
 * DIRECTIVE-018 Stage 9.1 — v3 returns gateway (`/api/v3/returns`).
 *
 * Thin HTTP translation over `ReturnsOrchestratorService` (item/serial
 * returns with COGS reversal and subledger reconciliation). Idempotency,
 * RBAC, envelope and error mapping follow the sales gateway conventions.
 */
@Controller('v3/returns')
@UseGuards(ServerRbacGuard)
@UseFilters(DomainErrorFilter)
@UseInterceptors(ResponseEnvelopeInterceptor, IdempotencyInterceptor)
export class ReturnsV3Controller {
  constructor(private readonly returns: ReturnsOrchestratorService) {}

  @Post('sales')
  createSalesReturn(
    @Body() dto: CreateSalesReturnDto,
    @CurrentUser() user?: SanitizedUser,
  ) {
    // NOTE: idempotency lives in IdempotencyInterceptor (see sales gateway) —
    // the header is not forwarded into the domain command (no double begin).
    return this.returns.executeSalesReturn({
      originalDocumentId: dto.originalDocumentId,
      lines: dto.lines.map((line) => ({
        documentLineId: line.documentLineId,
        quantity: line.quantity,
        condition: line.condition,
      })),
      refundMethod: dto.refundMethod,
      reason: dto.reason,
      actorUserId: user?.id,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.returns.getReturnDetails(id);
  }
}
