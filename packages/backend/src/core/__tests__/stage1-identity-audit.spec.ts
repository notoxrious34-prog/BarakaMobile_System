import { createHash } from 'node:crypto';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { SessionService, hashSessionToken } from '../session.service';
import { DocumentNumberService } from '../document-number.service';
import { AuditService } from '../audit.service';
import {
  CurrentUser,
  Public,
  RequireCapability,
  RequireRole,
} from '../guards/auth.decorator';
import { ServerRbacGuard } from '../guards/server-rbac.guard';
import type { AuthService } from '../../auth/auth.service';
import type { PrismaService } from '../../prisma/prisma.service';

const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

/* ------------------------------------------------------------------ */
/* In-memory Prisma fakes — the suite never touches a real database.   */
/* ------------------------------------------------------------------ */

interface SessionRow {
  id: string;
  userId: string;
  tokenHash: string;
  deviceId: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

function makeSessionPrisma(users: Map<string, any>) {
  const sessions = new Map<string, SessionRow>();
  let seq = 0;
  const userSession = {
    sessions,
    create: jest.fn(async ({ data }: any): Promise<SessionRow> => {
      seq += 1;
      const now = new Date();
      const row: SessionRow = {
        id: `sess-${seq}`,
        userId: data.userId,
        tokenHash: data.tokenHash,
        deviceId: data.deviceId ?? null,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: data.expiresAt,
        revokedAt: null,
      };
      sessions.set(row.tokenHash, row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }: any) => {
      const row = sessions.get(where.tokenHash) ?? null;
      if (!row) return null;
      return { ...row, user: users.get(row.userId) ?? null };
    }),
    update: jest.fn(async ({ where, data }: any): Promise<SessionRow> => {
      const row = [...sessions.values()].find((s) => s.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: any): Promise<{ count: number }> => {
      let count = 0;
      for (const row of sessions.values()) {
        if (where.tokenHash !== undefined && row.tokenHash !== where.tokenHash) continue;
        if (where.userId !== undefined && row.userId !== where.userId) continue;
        if (where.revokedAt !== undefined && where.revokedAt === null && row.revokedAt !== null) continue;
        Object.assign(row, data);
        count += 1;
      }
      return { count };
    }),
  };
  return { userSession } as unknown as PrismaService;
}

/** Emulates the single-statement upsert increment (atomic in SQLite SERIALIZABLE tx). */
function makeSequencePrisma() {
  const last = new Map<string, number>();
  const documentSequence = {
    upsert: jest.fn(async ({ where, update, create }: any) => {
      const current = last.get(where.prefix);
      if (current === undefined) {
        last.set(create.prefix, create.lastNumber);
        return { prefix: create.prefix, lastNumber: create.lastNumber, updatedAt: new Date() };
      }
      const next = current + (update.lastNumber?.increment ?? 1);
      last.set(where.prefix, next);
      return { prefix: where.prefix, lastNumber: next, updatedAt: new Date() };
    }),
  };
  const prisma: any = { documentSequence };
  // Emulates PrismaClient.$transaction: runs the body against this client.
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  return prisma as unknown as PrismaService;
}

function makeAuditPrisma(captured: any[]) {
  const auditLog = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `audit-${captured.length + 1}`, createdAt: new Date(), ...data };
      captured.push(row);
      return row;
    }),
  };
  return { auditLog } as unknown as PrismaService;
}

/* ------------------------------------------------------------------ */
/* Guard harness                                                       */
/* ------------------------------------------------------------------ */

const adminDbUser = {
  id: 'u-admin',
  username: 'admin',
  displayName: 'Admin',
  role: 'ADMIN',
  permissions: null,
  isActive: true,
  avatarColor: null,
  lastLoginAt: null,
};

const cashierDbUser = {
  id: 'u-cashier',
  username: 'cashier',
  displayName: 'Cashier',
  role: 'CASHIER',
  permissions: JSON.stringify({ canViewProfits: true }),
  isActive: true,
  avatarColor: null,
  lastLoginAt: null,
};

class SampleRoutes {
  @Public()
  open(): string {
    return 'open';
  }

  @RequireRole('ADMIN')
  adminOnly(): string {
    return 'admin';
  }

  @RequireCapability('canViewProfits')
  profits(): string {
    return 'profits';
  }

  plain(): string {
    return 'plain';
  }

  // Prove the parameter decorator resolves the guard-attached user.
  whoAmI(@CurrentUser() _user: unknown): string {
    return 'me';
  }
}

function ctxFor(
  handler: (...args: any[]) => unknown,
  headers: Record<string, string> = {},
): { ctx: ExecutionContext; req: any } {
  const req: any = { headers };
  const ctx = {
    getHandler: () => handler,
    getClass: () => SampleRoutes,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

function makeGuard(sessionRows: Map<string, any>, legacyUser: any) {
  const sessions = {
    validateSession: jest.fn(async (token: string) => {
      const row = [...sessionRows.values()].find((s: any) => s.tokenHash === sha256(token)) ?? null;
      if (!row) return null;
      if (row.revokedAt !== null) return null;
      if (row.expiresAt.getTime() <= Date.now()) return null;
      return row;
    }),
  } as unknown as SessionService;
  const legacyAuth = { userForToken: jest.fn(async () => legacyUser) } as unknown as AuthService;
  return new ServerRbacGuard(new Reflector(), sessions, legacyAuth);
}

describe('stage 1.2 identity / audit / sequences (TASK BRIEF-008)', () => {
  describe('SessionService', () => {
    it('creates 64-hex tokens and stores only the SHA-256 hash', async () => {
      const users = new Map([[adminDbUser.id, adminDbUser]]);
      const svc = new SessionService(makeSessionPrisma(users));
      const { rawToken, session } = await svc.createSession('u-admin', 'pos-1');
      expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
      expect(session.tokenHash).toBe(sha256(rawToken));
      expect(session.tokenHash).toBe(hashSessionToken(rawToken));
      expect(session.deviceId).toBe('pos-1');
      const skew = Math.abs(session.expiresAt.getTime() - (Date.now() + 30 * 86400000));
      expect(skew).toBeLessThan(5000);
    });

    it('validates live sessions with user included, rejects expired/revoked/unknown', async () => {
      const users = new Map([[adminDbUser.id, adminDbUser]]);
      const prisma = makeSessionPrisma(users);
      const svc = new SessionService(prisma);
      const { rawToken } = await svc.createSession('u-admin');
      const valid = await svc.validateSession(rawToken);
      expect(valid).not.toBeNull();
      expect(valid?.user.id).toBe('u-admin');
      expect(prisma.userSession.update).toHaveBeenCalled(); // lastSeenAt touch

      await expect(svc.validateSession('deadbeef')).resolves.toBeNull();

      // Expired
      const expired = await svc.createSession('u-admin', undefined, 30);
      const stored = (prisma.userSession as any).sessions.get(sha256(expired.rawToken));
      stored.expiresAt = new Date(Date.now() - 1000);
      await expect(svc.validateSession(expired.rawToken)).resolves.toBeNull();

      // Revoked
      const doomed = await svc.createSession('u-admin');
      await svc.revokeSession(doomed.rawToken);
      await expect(svc.validateSession(doomed.rawToken)).resolves.toBeNull();
    });

    it('revokeAllUserSessions revokes only active sessions and returns the count', async () => {
      const users = new Map([[adminDbUser.id, adminDbUser]]);
      const svc = new SessionService(makeSessionPrisma(users));
      const a = await svc.createSession('u-admin');
      const b = await svc.createSession('u-admin');
      await svc.revokeSession(a.rawToken); // one already revoked
      expect(await svc.revokeAllUserSessions('u-admin')).toBe(1);
      await expect(svc.validateSession(a.rawToken)).resolves.toBeNull();
      await expect(svc.validateSession(b.rawToken)).resolves.toBeNull();
    });
  });

  describe('DocumentNumberService', () => {
    it('starts at 1, zero-pads, and increments gaplessly', async () => {
      const svc = new DocumentNumberService(makeSequencePrisma());
      expect(await svc.nextNumber('INV-')).toBe('INV-000001');
      expect(await svc.nextNumber('INV-')).toBe('INV-000002');
      expect(await svc.nextNumber('RET-', undefined, 4)).toBe('RET-0001');
      // Prefixes are independent.
      expect(await svc.nextNumber('INV-')).toBe('INV-000003');
    });

    it('runs inside the caller transaction when one is provided', async () => {
      const root = makeSequencePrisma();
      const svc = new DocumentNumberService(root);
      const txUpsert = jest.fn(async ({ create }: any) => ({
        prefix: create.prefix,
        lastNumber: create.lastNumber,
        updatedAt: new Date(),
      }));
      const tx = { documentSequence: { upsert: txUpsert } } as any;
      expect(await svc.nextNumber('PAY-', tx)).toBe('PAY-000001');
      expect(txUpsert).toHaveBeenCalledTimes(1);
      expect((root.documentSequence as any).upsert).not.toHaveBeenCalled();
    });

    it('issues unique sequential numbers under concurrent calls', async () => {
      const svc = new DocumentNumberService(makeSequencePrisma());
      const results = await Promise.all(Array.from({ length: 10 }, () => svc.nextNumber('JRN-')));
      expect(new Set(results).size).toBe(10);
      expect([...results].sort()).toEqual(
        Array.from({ length: 10 }, (_, i) => `JRN-${String(i + 1).padStart(6, '0')}`),
      );
    });
  });

  describe('AuditService', () => {
    it('records JSON snapshots and nulls absent optionals', async () => {
      const captured: any[] = [];
      const svc = new AuditService(makeAuditPrisma(captured));
      const row = await svc.record({
        actorUserId: 'u-admin',
        action: 'SALE.CREATE',
        entityType: 'Transaction',
        entityId: 'tx-1',
        before: { amount: '0.00' },
        after: { amount: '150.00' },
        reason: 'counter sale',
      });
      expect(row.action).toBe('SALE.CREATE');
      expect(JSON.parse(row.beforeJson as string)).toEqual({ amount: '0.00' });
      expect(JSON.parse(row.afterJson as string)).toEqual({ amount: '150.00' });
      expect(row.correlationId).toBeNull();
      expect(row.ipAddress).toBeNull();
    });

    it('survives circular snapshots without throwing', async () => {
      const captured: any[] = [];
      const svc = new AuditService(makeAuditPrisma(captured));
      const circular: any = { name: 'loop' };
      circular.self = circular;
      await expect(
        svc.record({ action: 'X', entityType: 'E', entityId: '1', after: circular }),
      ).resolves.toBeDefined();
      expect(typeof captured[0].afterJson).toBe('string');
    });

    it('writes through the caller transaction when provided', async () => {
      const root: any[] = [];
      const svc = new AuditService(makeAuditPrisma(root));
      const txRows: any[] = [];
      const tx = { auditLog: { create: jest.fn(async ({ data }: any) => ({ id: 'tx-row', ...data })) } } as any;
      await svc.record({ action: 'X', entityType: 'E', entityId: '1' }, tx);
      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      expect(root).toHaveLength(0);
      expect(txRows).toHaveLength(0);
    });
  });

  describe('ServerRbacGuard', () => {
    it('lets @Public() routes through with no token', async () => {
      const guard = makeGuard(new Map(), null);
      const { ctx } = ctxFor(SampleRoutes.prototype.open);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('rejects token-less requests on guarded routes', async () => {
      const guard = makeGuard(new Map(), null);
      const { ctx } = ctxFor(SampleRoutes.prototype.plain, {});
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('accepts Bearer tokens and attaches { user, session }', async () => {
      const token = 'bearer-token-1';
      const sessionRows = new Map([
        [sha256(token), { tokenHash: sha256(token), revokedAt: null, expiresAt: new Date(Date.now() + 60000), user: adminDbUser }],
      ]);
      const guard = makeGuard(sessionRows, null);
      const { ctx, req } = ctxFor(SampleRoutes.prototype.plain, { authorization: `Bearer ${token}` });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(req.auth.user.username).toBe('admin');
      expect(req.auth.session).not.toBeNull();
    });

    it('enforces roles: ADMIN passes, CASHIER is forbidden', async () => {
      const good = new Map([
        ['t1', { tokenHash: sha256('t1'), revokedAt: null, expiresAt: new Date(Date.now() + 60000), user: adminDbUser }],
      ]);
      await expect(
        makeGuard(good, null).canActivate(ctxFor(SampleRoutes.prototype.adminOnly, { 'x-session-token': 't1' }).ctx),
      ).resolves.toBe(true);

      const bad = new Map([
        ['t2', { tokenHash: sha256('t2'), revokedAt: null, expiresAt: new Date(Date.now() + 60000), user: cashierDbUser }],
      ]);
      await expect(
        makeGuard(bad, null).canActivate(ctxFor(SampleRoutes.prototype.adminOnly, { 'x-session-token': 't2' }).ctx),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('honours per-user JSON capability overrides', async () => {
      // cashierDbUser.permissions = { canViewProfits: true }
      const rows = new Map([
        ['t3', { tokenHash: sha256('t3'), revokedAt: null, expiresAt: new Date(Date.now() + 60000), user: cashierDbUser }],
      ]);
      await expect(
        makeGuard(rows, null).canActivate(ctxFor(SampleRoutes.prototype.profits, { 'x-session-token': 't3' }).ctx),
      ).resolves.toBe(true);

      const plainCashier = { ...cashierDbUser, permissions: null }; // role default: no canViewProfits
      const rows2 = new Map([
        ['t4', { tokenHash: sha256('t4'), revokedAt: null, expiresAt: new Date(Date.now() + 60000), user: plainCashier }],
      ]);
      await expect(
        makeGuard(rows2, null).canActivate(ctxFor(SampleRoutes.prototype.profits, { 'x-session-token': 't4' }).ctx),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('falls back to legacy in-memory auth with null session (zero regression)', async () => {
      const legacyUser = {
        id: 'u-legacy',
        username: 'legacy',
        displayName: 'Legacy',
        role: 'ADMIN',
        permissions: {},
        isActive: true,
        avatarColor: null,
        lastLoginAt: null,
      };
      const guard = makeGuard(new Map(), legacyUser);
      const { ctx, req } = ctxFor(SampleRoutes.prototype.plain, { 'x-session-token': 'legacy-token' });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(req.auth.user.username).toBe('legacy');
      expect(req.auth.session).toBeNull();
    });

    it('rejects when neither DB nor legacy auth knows the token', async () => {
      const guard = makeGuard(new Map(), null);
      const { ctx } = ctxFor(SampleRoutes.prototype.plain, { 'x-session-token': 'ghost' });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
