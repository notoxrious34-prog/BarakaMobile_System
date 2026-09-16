import { Module } from '@nestjs/common';
import { PartiesModule } from '../../parties/parties.module';
import { FlexyOrchestratorService } from './flexy-orchestrator.service';

/**
 * DIRECTIVE-016 Stage 7.2 — v3.0 Flexy wallets module.
 *
 * The class is `FlexyWalletsModule` (NOT `WalletsModule`): the v2
 * treasury world already owns that class name at
 * `src/wallets/wallets.module.ts`. Imports PartiesModule for ON_ACCOUNT
 * customer validation (no cycle: PartiesModule never imports wallets);
 * `PrismaService`, `TransactionOrchestrator`, `DocumentNumberService`,
 * `AuditService` and `PostingService` resolve via the @Global()
 * Prisma / Core / Accounting modules.
 */
@Module({
  imports: [PartiesModule],
  providers: [FlexyOrchestratorService],
  exports: [FlexyOrchestratorService],
})
export class FlexyWalletsModule {}
