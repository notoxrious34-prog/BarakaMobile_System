import { Body, Controller, Get, Post, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { FlexyOrchestratorService } from '../../modules/wallets/flexy-orchestrator.service';
import { ServerRbacGuard } from '../../core/guards/server-rbac.guard';
import { CurrentUser } from '../../core/guards/auth.decorator';
import type { SanitizedUser } from '../../auth/auth.service';
import { DomainErrorFilter } from './common/domain-error.filter';
import { ResponseEnvelopeInterceptor } from './common/envelope.interceptor';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { FlexyTopUpDto, FloatTransferDto } from './dto/v3-treasury-accounting.dto';

/**
 * DIRECTIVE-019 Stage 9.2 — v3 Flexy gateway (`/api/v3/flexy`).
 *
 * Thin HTTP translation over `FlexyOrchestratorService`: margin-bearing
 * top-ups (cash or on-account with subledger leg), inter-account float
 * transfers, and the wallet directory. Idempotency, RBAC, envelope and
 * error mapping follow the sales gateway conventions.
 */
@Controller('v3/flexy')
@UseGuards(ServerRbacGuard)
@UseFilters(DomainErrorFilter)
@UseInterceptors(ResponseEnvelopeInterceptor, IdempotencyInterceptor)
export class FlexyV3Controller {
  constructor(private readonly flexy: FlexyOrchestratorService) {}

  @Post('topup')
  topup(@Body() dto: FlexyTopUpDto, @CurrentUser() user?: SanitizedUser) {
    return this.flexy.processTopUp({
      walletId: dto.walletId,
      targetPhoneNumber: dto.targetPhoneNumber,
      faceAmount: dto.faceAmount,
      costAmount: dto.costAmount,
      feeAmount: dto.feeAmount,
      paymentMethod: dto.paymentMethod,
      partyId: dto.partyId,
      actorUserId: user?.id ?? '',
    });
  }

  @Post('float-transfer')
  transferFloat(@Body() dto: FloatTransferDto, @CurrentUser() user?: SanitizedUser) {
    return this.flexy.transferFloat({
      sourceAccountType: dto.sourceAccountType,
      sourceWalletId: dto.sourceWalletId,
      targetAccountType: dto.targetAccountType,
      targetWalletId: dto.targetWalletId,
      amount: dto.amount,
      reason: dto.reason,
      actorUserId: user?.id ?? '',
    });
  }

  @Get('wallets')
  wallets() {
    return this.flexy.listWallets();
  }
}
