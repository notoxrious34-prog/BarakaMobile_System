import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SalesModule } from '../sales/sales.module';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { ReturnsModule } from '../returns/returns.module';
import { RepairsModule } from '../modules/repairs/repairs.module';
import { ShiftsModule } from '../modules/shifts/shifts.module';
import { FlexyWalletsModule } from '../modules/wallets/wallets.module';
import { SalesV3Controller } from './api/sales-v3.controller';
import { PurchasesV3Controller } from './api/purchases-v3.controller';
import { ReturnsV3Controller } from './api/returns-v3.controller';
import { RepairsV3Controller } from './api/repairs-v3.controller';
import { ShiftsV3Controller } from './api/shifts-v3.controller';
import { FlexyV3Controller } from './api/flexy-v3.controller';
import { AccountingV3Controller } from './api/accounting-v3.controller';

/**
 * DIRECTIVE-018 Stage 9.1 — v3 commercial gateway module.
 *
 * Mounts the sales / purchases / returns / repairs REST controllers.
 * All cross-cutting providers (`PrismaService`, orchestrators, guard,
 * idempotency engine) resolve via the @Global() Prisma / Core /
 * Accounting / Parties / Inventory modules — this module only wires
 * the commercial domains it fronts. No route prefix here: each
 * controller declares its own `v3/*` path under the app's `api` prefix.
 */
@Module({
  imports: [AuthModule, SalesModule, PurchasingModule, ReturnsModule, RepairsModule, ShiftsModule, FlexyWalletsModule],
  controllers: [
    SalesV3Controller,
    PurchasesV3Controller,
    ReturnsV3Controller,
    RepairsV3Controller,
    ShiftsV3Controller,
    FlexyV3Controller,
    AccountingV3Controller,
  ],
})
export class V3Module {}
