import { Module } from '@nestjs/common';
import { SalesOrchestratorService } from './sales-orchestrator.service';

/**
 * TASK BRIEF-014 Stage 5.1 — v3.0 sales module.
 *
 * Plain (non-global) module: every dependency (`PrismaService` plus the
 * @Global() Core / Accounting / Inventory / Parties providers) resolves
 * without imports.
 */
@Module({
  providers: [SalesOrchestratorService],
  exports: [SalesOrchestratorService],
})
export class SalesModule {}
