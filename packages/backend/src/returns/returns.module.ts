import { Module } from '@nestjs/common';
import { PartiesModule } from '../parties/parties.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ReturnsOrchestratorService } from './returns-orchestrator.service';

/**
 * TASK BRIEF-015 Stage 5.2 — v3.0 returns module.
 *
 * Plain (non-global) module: imports PartiesModule (subledger) and
 * InventoryModule (restock, serial handling) — neither imports returns,
 * so no cycle. Remaining dependencies resolve via the @Global()
 * Prisma / Core / Accounting modules.
 */
@Module({
  imports: [PartiesModule, InventoryModule],
  providers: [ReturnsOrchestratorService],
  exports: [ReturnsOrchestratorService],
})
export class ReturnsModule {}
