import { Module } from '@nestjs/common';
import { PartiesService } from './parties.service';
import { PartySubledgerService } from './party-subledger.service';
import { SubledgerReconciliationService } from './subledger-reconciliation.service';

/**
 * TASK BRIEF-013 Stage 4 — v3.0 parties module.
 *
 * Plain (non-global) module: all dependencies (`PrismaService`,
 * `AuditService`, `TransactionOrchestrator`, `ReconciliationService`)
 * resolve via the @Global() Prisma/Core/Accounting modules.
 */
@Module({
  providers: [PartiesService, PartySubledgerService, SubledgerReconciliationService],
  exports: [PartiesService, PartySubledgerService, SubledgerReconciliationService],
})
export class PartiesModule {}
