import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { SanitizedUser } from '../../auth/auth.service';

/**
 * TASK BRIEF-008 Stage 1.2 — v3.0 route decorators (server RBAC).
 *
 * Consumed by `ServerRbacGuard`. Capability strings reuse the v2.x
 * `capabilitiesFor()` key space (`canViewProfits`, `canManageUsers`,
 * `canAccessBackups`, `canViewCosts`, `canManageCatalog`, `canDeleteSales`,
 * plus per-user JSON overrides) — zero reinvention, zero drift.
 */
export const V3_ROLES_KEY = 'v3:roles';
export const V3_CAPABILITIES_KEY = 'v3:capabilities';
export const V3_PUBLIC_KEY = 'v3:isPublic';

/** Restrict a route to one of the given user roles (e.g. 'ADMIN'). */
export const RequireRole = (...roles: string[]) => SetMetadata(V3_ROLES_KEY, roles);

/** Restrict a route to callers holding ALL listed capabilities. */
export const RequireCapability = (...capabilities: string[]) => SetMetadata(V3_CAPABILITIES_KEY, capabilities);

/** Bypass `ServerRbacGuard` (health checks, login, public lookups). */
export const Public = () => SetMetadata(V3_PUBLIC_KEY, true);

export interface AuthenticatedRequest {
  auth?: { user?: SanitizedUser; session?: unknown };
  user?: SanitizedUser;
}

/** Extracts the guard-attached user (falls back to legacy `request.user`). */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest() as AuthenticatedRequest;
  return req.auth?.user ?? req.user ?? undefined;
});
