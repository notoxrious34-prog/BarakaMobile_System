import { Global, Module } from '@nestjs/common';
import { IdempotencyEngine } from './idempotency';
import { TransactionOrchestrator } from './transaction-orchestrator';
import { SessionService } from './session.service';
import { DocumentNumberService } from './document-number.service';
import { AuditService } from './audit.service';
import { ServerRbacGuard } from './guards/server-rbac.guard';
import { AuthModule } from '../auth/auth.module';

/**
 * TASK BRIEF-007 Stage 1.1 — v3.0 core primitives module.
 * TASK BRIEF-008 Stage 1.2 — adds identity (SessionService), sequences
 * (DocumentNumberService), audit (AuditService) and server RBAC
 * (ServerRbacGuard). AuthModule is imported so the guard's legacy
 * AuthService fallback resolves — AuthModule itself never imports core,
 * so no cycle is possible.
 *
 * @Global so the orchestrator / idempotency engine are injectable in every
 * domain module without import churn. `PrismaService` resolves via the
 * already-@Global() PrismaModule. Adds nothing to existing v2.9.2 routes.
 */
@Global()
@Module({
  imports: [AuthModule],
  providers: [TransactionOrchestrator, IdempotencyEngine, SessionService, DocumentNumberService, AuditService, ServerRbacGuard],
  exports: [TransactionOrchestrator, IdempotencyEngine, SessionService, DocumentNumberService, AuditService, ServerRbacGuard],
})
export class CoreModule {}
