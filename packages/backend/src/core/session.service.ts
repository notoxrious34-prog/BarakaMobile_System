import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { User, UserSession } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationError } from './result';

/**
 * TASK BRIEF-008 Stage 1.2 — database-persisted operator sessions (v3.0 foundation).
 *
 * Replaces the v2.x in-memory session Map with `UserSession` rows:
 *  - `createSession` mints a cryptographically secure 64-hex token
 *    (`crypto.randomBytes(32)`) and stores ONLY its SHA-256 hash —
 *    a database leak never yields usable tokens.
 *  - `validateSession` enforces expiry + revocation and touches
 *    `lastSeenAt` fire-and-forget (login latency never waits on it).
 *  - Revocation is a timestamp (`revokedAt`), never a delete — the trail survives.
 */

export type ValidatedSession = UserSession & { user: User };

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_TTL_DAYS = 30;

/** SHA-256 hex of a raw token. Exported so tests/ops can recompute it. */
export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(
    userId: string,
    deviceId?: string,
    ttlDays = DEFAULT_TTL_DAYS,
  ): Promise<{ rawToken: string; session: UserSession }> {
    if (!userId || userId.trim().length === 0) {
      throw new ValidationError('SessionService.createSession: userId must be a non-empty string.');
    }
    if (!Number.isFinite(ttlDays) || ttlDays <= 0) {
      throw new ValidationError('SessionService.createSession: ttlDays must be a positive finite number.');
    }
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashSessionToken(rawToken);
    const now = new Date();
    const session = await this.prisma.userSession.create({
      data: {
        userId,
        tokenHash,
        deviceId: deviceId ?? null,
        expiresAt: new Date(now.getTime() + ttlDays * MS_PER_DAY),
      },
    });
    return { rawToken, session };
  }

  async validateSession(rawToken: string): Promise<ValidatedSession | null> {
    if (!rawToken || rawToken.trim().length === 0) return null;
    const session = await this.prisma.userSession.findUnique({
      where: { tokenHash: hashSessionToken(rawToken) },
      include: { user: true },
    });
    if (!session) return null;
    if (session.revokedAt !== null) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;
    // Activity touch is best-effort and never blocks validation.
    void this.prisma.userSession
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
    return session;
  }

  async revokeSession(rawToken: string): Promise<void> {
    if (!rawToken || rawToken.trim().length === 0) return;
    await this.prisma.userSession.updateMany({
      where: { tokenHash: hashSessionToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes every active session of a user (password/PIN reset, off-boarding). Returns revoked count. */
  async revokeAllUserSessions(userId: string): Promise<number> {
    if (!userId || userId.trim().length === 0) {
      throw new ValidationError('SessionService.revokeAllUserSessions: userId must be a non-empty string.');
    }
    const result = await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }
}
