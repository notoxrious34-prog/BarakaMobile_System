import { Module } from '@nestjs/common';
import { PurchasesOrchestratorService } from './purchases-orchestrator.service';

/**
 * TASK BRIEF-015 Stage 5.2 — v3.0 purchasing module.
 *
 * Plain (non-global) module: every dependency (`PrismaService` plus the
 * @Global() Core / Accounting / Inventory / Parties providers) resolves
 * without imports.
 */
@Module({
  providers: [PurchasesOrchestratorService],
  exports: [PurchasesOrchestratorService],
})
export class PurchasingModule {}
