import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SalesModule } from '../sales/sales.module';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { ReturnsModule } from '../returns/returns.module';
import { RepairsModule } from '../modules/repairs/repairs.module';
import { SalesV3Controller } from './api/sales-v3.controller';
import { PurchasesV3Controller } from './api/purchases-v3.controller';
import { ReturnsV3Controller } from './api/returns-v3.controller';
import { RepairsV3Controller } from './api/repairs-v3.controller';

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
  imports: [AuthModule, SalesModule, PurchasingModule, ReturnsModule, RepairsModule],
  controllers: [SalesV3Controller, PurchasesV3Controller, ReturnsV3Controller, RepairsV3Controller],
})
export class V3Module {}
