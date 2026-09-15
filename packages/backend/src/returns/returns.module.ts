import { Module } from '@nestjs/common';
import { ReturnsOrchestratorService } from './returns-orchestrator.service';

/**
 * TASK BRIEF-015 Stage 5.2 — v3.0 returns module.
 *
 * Plain (non-global) module: every dependency (`PrismaService` plus the
 * @Global() Core / Accounting / Inventory / Parties providers) resolves
 * without imports.
 */
@Module({
  providers: [ReturnsOrchestratorService],
  exports: [ReturnsOrchestratorService],
})
export class ReturnsModule {}
