import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { User, UserSession } from '@prisma/client';
import { AuthService, SanitizedUser, capabilitiesFor } from '../../auth/auth.service';
import { sessionTokenOf } from '../../auth/session-header';
import { SessionService } from '../session.service';
import { V3_CAPABILITIES_KEY, V3_PUBLIC_KEY, V3_ROLES_KEY } from './auth.decorator';

/**
 * TASK BRIEF-008 Stage 1.2 — server-enforced RBAC guard (v3.0 foundation).
 *
 * Pipeline per request (unless `@Public()`):
 *  1. Extract token from `x-session-token` or `Authorization: Bearer <token>`.
 *  2. Validate against DB-backed `SessionService`.
 *     Fallback: legacy in-memory `AuthService.userForToken` — keeps every
 *     unmigrated v2.9.2 endpoint working with zero regression.
 *  3. Enforce `@RequireRole(...)` then `@RequireCapability(...)`
 *     (role defaults + per-user JSON overrides via `capabilitiesFor`).
 *  4. Attach `{ user, session }` to the request (`session` is null on the
 *     legacy path).
 */
export interface RequestAuth {
  user: SanitizedUser;
  session: (UserSession & { user: User }) | null;
}

/** Mirrors `AuthService`'s private sanitize() for DB-loaded user rows. */
function sanitizeDbUser(user: User): SanitizedUser {
  let permissions: Record<string, boolean> = {};
  try {
    if (user.permissions) {
      const parsed: unknown = JSON.parse(user.permissions);
      if (parsed && typeof parsed === 'object') permissions = parsed as Record<string, boolean>;
    }
  } catch {
    permissions = {};
  }
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    permissions,
    isActive: user.isActive,
    avatarColor: user.avatarColor,
    lastLoginAt: user.lastLoginAt,
  };
}

function extractToken(req: {
  headers?: Record<string, string | string[] | undefined>;
}): string | undefined {
  const headers = req.headers ?? {};
  const fromHeader = sessionTokenOf(headers);
  if (fromHeader && fromHeader.trim().length > 0) return fromHeader.trim();
  const raw = headers['authorization'] ?? headers['Authorization'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === 'string') {
    const match = value.match(/^Bearer\s+(.+)$/i);
    if (match && match[1].trim().length > 0) return match[1].trim();
  }
  return undefined;
}

@Injectable()
export class ServerRbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly legacyAuth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const klass = context.getClass();

    if (this.reflector.getAllAndOverride<boolean>(V3_PUBLIC_KEY, [handler, klass])) {
      return true;
    }

    const req = context.switchToHttp().getRequest() as {
      headers?: Record<string, string | string[] | undefined>;
      auth?: RequestAuth;
    };
    const token = extractToken(req);
    if (!token) {
      throw new UnauthorizedException('Missing session token — sign in first.');
    }

    let user: SanitizedUser | null = null;
    let session: (UserSession & { user: User }) | null = null;
    try {
      const persisted = await this.sessions.validateSession(token);
      if (persisted) {
        user = sanitizeDbUser(persisted.user);
        session = persisted;
      }
    } catch {
      user = null;
    }
    if (!user) {
      try {
        user = await this.legacyAuth.userForToken(token);
      } catch {
        user = null;
      }
    }
    if (!user) {
      throw new UnauthorizedException('Invalid or expired session — sign in again.');
    }

    const roles = this.reflector.getAllAndOverride<string[]>(V3_ROLES_KEY, [handler, klass]) ?? [];
    if (roles.length > 0 && !roles.includes(user.role)) {
      throw new ForbiddenException('This operation requires a different role.');
    }

    const required =
      this.reflector.getAllAndOverride<string[]>(V3_CAPABILITIES_KEY, [handler, klass]) ?? [];
    if (required.length > 0) {
      const held = capabilitiesFor(user);
      const missing = required.filter((capability) => !held[capability]);
      if (missing.length > 0) {
        throw new ForbiddenException(`Missing required capabilities: ${missing.join(', ')}.`);
      }
    }

    req.auth = { user, session };
    return true;
  }
}
