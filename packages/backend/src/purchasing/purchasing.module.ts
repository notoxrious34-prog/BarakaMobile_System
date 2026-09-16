import { Module } from '@nestjs/common';
import { PartiesModule } from '../parties/parties.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchasesOrchestratorService } from './purchases-orchestrator.service';

/**
 * TASK BRIEF-015 Stage 5.2 — v3.0 purchasing module.
 *
 * Plain (non-global) module: imports PartiesModule (supplier validation,
 * subledger) and InventoryModule (receipts, serial registration) —
 * neither imports purchasing, so no cycle. Remaining dependencies
 * resolve via the @Global() Prisma / Core / Accounting modules.
 */
@Module({
  imports: [PartiesModule, InventoryModule],
  providers: [PurchasesOrchestratorService],
  exports: [PurchasesOrchestratorService],
})
export class PurchasingModule {}
