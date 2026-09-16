import { Module } from '@nestjs/common';
import { PartiesModule } from '../parties/parties.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SalesOrchestratorService } from './sales-orchestrator.service';

/**
 * TASK BRIEF-014 Stage 5.1 — v3.0 sales module.
 * DIRECTIVE-018 Stage 9.1 — imports PartiesModule (customer validation,
 * subledger) and InventoryModule (stock/serial moves): neither imports
 * sales, so no cycle. (Plain modules cannot see sibling providers
 * without explicit imports — the v3 gateway boot proved it.)
 */
@Module({
  imports: [PartiesModule, InventoryModule],
  providers: [SalesOrchestratorService],
  exports: [SalesOrchestratorService],
})
export class SalesModule {}
