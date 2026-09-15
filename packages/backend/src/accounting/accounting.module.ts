import { Global, Module, OnModuleInit } from '@nestjs/common';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { FiscalPeriodService } from './fiscal-period.service';
import { PostingService } from './posting.service';
import { ReversalService } from './reversal.service';
import { ReconciliationService } from './reconciliation.service';

/**
 * TASK BRIEF-009 Stage 2.1 — v3.0 accounting module.
 * TASK BRIEF-010 Stage 2.2 — adds the operational ledger: PostingService,
 * ReversalService, ReconciliationService.
 *
 * @Global so COA / fiscal services are injectable in every domain module.
 * `PrismaService` resolves via the already-@Global() PrismaModule.
 * On boot, the standard 25-account COA is ensured (idempotent upsert) —
 * a fresh database is ledger-ready with zero operator action. Seed failure
 * is logged, never fatal: a missing COA must not brick the terminal.
 */
@Global()
@Module({
  providers: [ChartOfAccountsService, FiscalPeriodService, PostingService, ReversalService, ReconciliationService],
  exports: [ChartOfAccountsService, FiscalPeriodService, PostingService, ReversalService, ReconciliationService],
})
export class AccountingModule implements OnModuleInit {
  constructor(private readonly chartOfAccounts: ChartOfAccountsService) {}

  async onModuleInit(): Promise<void> {
    try {
      const count = await this.chartOfAccounts.seedStandardAccounts();
      console.log(`[Accounting] COA ready: ${count} standard accounts ensured.`);
    } catch (error) {
      console.error('[Accounting] COA auto-seed failed:', error instanceof Error ? error.message : error);
    }
  }
}
