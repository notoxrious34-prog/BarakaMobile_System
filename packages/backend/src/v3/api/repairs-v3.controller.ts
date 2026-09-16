import { Body, Controller, Get, Param, Patch, Post, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { RepairDomainService } from '../../modules/repairs/repair-domain.service';
import { RepairOrchestratorService } from '../../modules/repairs/repair-orchestrator.service';
import { ServerRbacGuard } from '../../core/guards/server-rbac.guard';
import { CurrentUser } from '../../core/guards/auth.decorator';
import type { SanitizedUser } from '../../auth/auth.service';
import { ValidationError } from '../../core/result';
import { DomainErrorFilter } from './common/domain-error.filter';
import { ResponseEnvelopeInterceptor } from './common/envelope.interceptor';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { AddRepairPartDto, CreateRepairDto, DeliverRepairDto, UpdateRepairStatusDto } from './dto/v3.dto';

/**
 * DIRECTIVE-018 Stage 9.1 — v3 repairs gateway (`/api/v3/repairs`).
 *
 * Thin HTTP translation over `RepairDomainService` (intake + FSM
 * advances) and `RepairOrchestratorService` (parts WIP, delivery,
 * cancellation). The PATCH status endpoint dispatches one FSM edge per
 * call — multi-step advances walk the chain with successive calls.
 * `IN_PROGRESS` is accepted as an alias of the FSM's `IN_REPAIR`.
 */
@Controller('v3/repairs')
@UseGuards(ServerRbacGuard)
@UseFilters(DomainErrorFilter)
@UseInterceptors(ResponseEnvelopeInterceptor, IdempotencyInterceptor)
export class RepairsV3Controller {
  constructor(
    private readonly domain: RepairDomainService,
    private readonly workshop: RepairOrchestratorService,
  ) {}

  @Post()
  create(@Body() dto: CreateRepairDto, @CurrentUser() user?: SanitizedUser) {
    return this.domain.createRepairOrder({
      partyId: dto.partyId,
      deviceType: dto.deviceType,
      brand: dto.brand,
      model: dto.model,
      serialOrImei: dto.serialOrImei,
      reportedIssue: dto.reportedIssue,
      actorUserId: user?.id,
    });
  }

  @Patch(':id/status')
  advanceStatus(@Param('id') id: string, @Body() dto: UpdateRepairStatusDto, @CurrentUser() user?: SanitizedUser) {
    const target = dto.status === 'IN_PROGRESS' ? 'IN_REPAIR' : dto.status;
    switch (target) {
      case 'DIAGNOSING': {
        const notes = dto.diagnosisNotes ?? dto.notes;
        if (!notes || notes.trim().length === 0) {
          throw new ValidationError('RepairsV3Controller: diagnosisNotes (or notes) is required to move to DIAGNOSING.');
        }
        return this.domain.diagnoseOrder(id, notes, dto.technicianId);
      }
      case 'QUOTED': {
        if (!dto.laborPrice || !dto.estimatedCost) {
          throw new ValidationError('RepairsV3Controller: laborPrice and estimatedCost are required to move to QUOTED.');
        }
        return this.domain.quoteOrder(id, dto.laborPrice, dto.estimatedCost);
      }
      case 'APPROVED':
        return this.domain.approveOrder(id);
      case 'IN_REPAIR':
        return this.domain.startRepair(id, dto.technicianId);
      case 'READY':
        return this.domain.markReady(id);
      case 'DELIVERED':
        return this.workshop.deliverRepairOrder({ repairOrderId: id, payments: [], actorUserId: user?.id });
      case 'CANCELLED':
        return this.workshop.cancelRepairOrder(id, dto.notes, user?.id);
      default:
        throw new ValidationError(`RepairsV3Controller: unsupported target status "${dto.status}".`);
    }
  }

  @Post(':id/parts')
  addPart(@Param('id') id: string, @Body() dto: AddRepairPartDto, @CurrentUser() user?: SanitizedUser) {
    return this.workshop.consumePart(id, dto.itemId, dto.quantity, dto.unitPrice, user?.id);
  }

  @Post(':id/deliver')
  deliver(@Param('id') id: string, @Body() dto: DeliverRepairDto, @CurrentUser() user?: SanitizedUser) {
    return this.workshop.deliverRepairOrder({
      repairOrderId: id,
      payments: dto.payments.map((payment) => ({ paymentMethod: payment.paymentMethod, amount: payment.amount })),
      discountAmount: dto.discountAmount,
      actorUserId: user?.id,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.domain.getRepairOrder(id);
  }
}
