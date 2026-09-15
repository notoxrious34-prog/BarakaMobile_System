import { Module } from '@nestjs/common';
import { PartiesModule } from '../../parties/parties.module';
import { InventoryModule } from '../../inventory/inventory.module';
import { RepairDomainService } from './repair-domain.service';
import { RepairFsmService } from './repair-fsm.service';
import { RepairOrchestratorService } from './repair-orchestrator.service';

/**
 * DIRECTIVE-013 Stage 6.1 — v3.0 repairs module.
 * DIRECTIVE-014 Stage 6.2 — adds RepairOrchestratorService (parts WIP,
 * delivery, cancellation). Imports PartiesModule (intake validation) and
 * InventoryModule (WIP stock moves) — neither imports repairs, so no
 * cycle. Posting/audit/sequencing resolve via @Global() modules.
 */
@Module({
  imports: [PartiesModule, InventoryModule],
  providers: [RepairFsmService, RepairDomainService, RepairOrchestratorService],
  exports: [RepairFsmService, RepairDomainService, RepairOrchestratorService],
})
export class RepairsModule {}
