import { Body, Controller, Get, Param, Post, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { CashShiftOrchestratorService } from '../../modules/shifts/cash-shift-orchestrator.service';
import { ServerRbacGuard } from '../../core/guards/server-rbac.guard';
import { CurrentUser } from '../../core/guards/auth.decorator';
import type { SanitizedUser } from '../../auth/auth.service';
import { DomainErrorFilter } from './common/domain-error.filter';
import { ResponseEnvelopeInterceptor } from './common/envelope.interceptor';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { CloseShiftDto, OpenShiftDto, ShiftCashMovementDto } from './dto/v3-treasury-accounting.dto';

/**
 * DIRECTIVE-019 Stage 9.2 — v3 POS shifts gateway (`/api/v3/shifts`).
 *
 * Thin HTTP translation over `CashShiftOrchestratorService`: open with
 * starting float, drawer in/out movements, close with physical-count
 * reconciliation (overage → 40400, shortage → 50300), plus active-shift
 * and shift-detail reads. Cashier identity comes from the session.
 */
@Controller('v3/shifts')
@UseGuards(ServerRbacGuard)
@UseFilters(DomainErrorFilter)
@UseInterceptors(ResponseEnvelopeInterceptor, IdempotencyInterceptor)
export class ShiftsV3Controller {
  constructor(private readonly shifts: CashShiftOrchestratorService) {}

  @Post('open')
  open(@Body() dto: OpenShiftDto, @CurrentUser() user?: SanitizedUser) {
    return this.shifts.openShift({
      registerId: dto.registerId,
      cashierUserId: user?.id ?? '',
      openingCash: dto.openingCash,
      notes: dto.notes,
    });
  }

  @Post(':id/close')
  close(@Param('id') id: string, @Body() dto: CloseShiftDto, @CurrentUser() user?: SanitizedUser) {
    return this.shifts.closeShift({
      shiftId: id,
      actualCash: dto.actualCash,
      notes: dto.notes,
      actorUserId: user?.id ?? '',
    });
  }

  @Post(':id/cash-in')
  cashIn(@Param('id') id: string, @Body() dto: ShiftCashMovementDto, @CurrentUser() user?: SanitizedUser) {
    return this.shifts.recordMovement({
      shiftId: id,
      movementType: 'DRAWER_IN',
      amount: dto.amount,
      reason: dto.reason,
      actorUserId: user?.id ?? '',
    });
  }

  @Post(':id/cash-out')
  cashOut(@Param('id') id: string, @Body() dto: ShiftCashMovementDto, @CurrentUser() user?: SanitizedUser) {
    return this.shifts.recordMovement({
      shiftId: id,
      movementType: 'DRAWER_OUT',
      amount: dto.amount,
      reason: dto.reason,
      actorUserId: user?.id ?? '',
    });
  }

  @Get('active/:registerId')
  active(@Param('registerId') registerId: string) {
    return this.shifts.getActiveShift(registerId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.shifts.getShiftDetails(id);
  }
}
