import { Module } from '@nestjs/common';
import { CashShiftOrchestratorService } from './cash-shift-orchestrator.service';

/**
 * DIRECTIVE-015 Stage 7.1 — v3.0 shifts module.
 *
 * No explicit imports: `PrismaService`, `TransactionOrchestrator`,
 * `DocumentNumberService`, `AuditService` and `PostingService` all resolve
 * via the @Global() Prisma / Core / Accounting modules (RepairsModule
 * precedent). This module never imports feature domains, so no cycle is
 * possible in either direction.
 */
@Module({
  providers: [CashShiftOrchestratorService],
  exports: [CashShiftOrchestratorService],
})
export class ShiftsModule {}
