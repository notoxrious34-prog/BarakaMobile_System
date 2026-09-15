import { Injectable } from '@nestjs/common';
import { ConcurrencyError, NotFoundError, ValidationError } from './result';

/**
 * TASK BRIEF-007 Stage 1.1 — Idempotency engine (v3.0 foundation).
 *
 * Guards mutating operations against double execution (retried POS submits,
 * double-tapped buttons, replayed webhooks). Lifecycle per key:
 *
 *   begin() → IN_PROGRESS (exclusive lock, stale locks stealable)
 *     → commit() → COMPLETED (response cached for `ttlMs`, replays served)
 *     → rollback() → key released (lock dropped, safe to retry)
 *
 * In-memory Map store (single-terminal desktop: one Node process, so a Map
 * is exact — no cross-process races exist). Shaped for a future SQLite/Prisma
 * backing: all access funnels through begin/commit/rollback/purgeExpired.
 */

export type IdempotencyStatus = 'IN_PROGRESS' | 'COMPLETED';

export interface IdempotencyOptions {
  /** Cached COMPLETED response lifetime. Default 24h. */
  ttlMs?: number;
  /** IN_PROGRESS exclusive-lock lifetime. Stale locks are stealable. Default 30s. */
  lockTimeoutMs?: number;
}

export interface IdempotencyAttempt {
  readonly key: string;
  readonly operationName: string;
  /** True when a COMPLETED response was already cached — serve it, skip work. */
  readonly isReplay: boolean;
  readonly response?: any;
}

interface StoredEntry {
  operationName: string;
  status: IdempotencyStatus;
  lockExpiresAt: number;
  expiresAt: number;
  response?: any;
  completedAt?: number;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOCK_TIMEOUT_MS = 30 * 1000;

@Injectable()
export class IdempotencyEngine {
  private readonly store = new Map<string, StoredEntry>();
  private ttlMs = DEFAULT_TTL_MS;
  private lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS;

  /** Test/ops tuning hook. Rejects non-positive, non-finite values. */
  configure(options: IdempotencyOptions): void {
    if (options.ttlMs !== undefined) {
      if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) {
        throw new ValidationError('IdempotencyEngine.configure: ttlMs must be a positive finite number.');
      }
      this.ttlMs = options.ttlMs;
    }
    if (options.lockTimeoutMs !== undefined) {
      if (!Number.isFinite(options.lockTimeoutMs) || options.lockTimeoutMs <= 0) {
        throw new ValidationError('IdempotencyEngine.configure: lockTimeoutMs must be a positive finite number.');
      }
      this.lockTimeoutMs = options.lockTimeoutMs;
    }
  }

  async begin(key: string, operationName: string): Promise<IdempotencyAttempt> {
    if (!key || key.trim().length === 0) {
      throw new ValidationError('IdempotencyEngine.begin: key must be a non-empty string.');
    }
    if (!operationName || operationName.trim().length === 0) {
      throw new ValidationError('IdempotencyEngine.begin: operationName must be a non-empty string.');
    }
    const now = Date.now();
    const existing = this.store.get(key);
    if (existing) {
      if (existing.status === 'COMPLETED') {
        if (now < existing.expiresAt) {
          return { key, operationName: existing.operationName, isReplay: true, response: existing.response };
        }
        this.store.delete(key);
      } else if (now < existing.lockExpiresAt) {
        throw new ConcurrencyError(
          `Concurrent execution blocked: operation "${existing.operationName}" is already IN_PROGRESS for key "${key}".`,
          { key, operationName: existing.operationName },
        );
      }
      // Stale IN_PROGRESS lock — fall through and steal it below.
    }
    this.store.set(key, {
      operationName,
      status: 'IN_PROGRESS',
      lockExpiresAt: now + this.lockTimeoutMs,
      expiresAt: now + this.ttlMs,
    });
    return { key, operationName, isReplay: false };
  }

  async commit(key: string, response: any): Promise<void> {
    const existing = this.store.get(key);
    if (!existing) {
      throw new NotFoundError(`IdempotencyEngine.commit: unknown key "${key}".`, { key });
    }
    const now = Date.now();
    let cached: any;
    if (
      response !== null &&
      typeof response === 'object' &&
      !Array.isArray(response) &&
      'body' in (response as Record<string, unknown>)
    ) {
      cached = response;
    } else {
      cached = { body: response, status: 200 };
    }
    this.store.set(key, {
      ...existing,
      status: 'COMPLETED',
      response: cached,
      completedAt: now,
      expiresAt: now + this.ttlMs,
    });
  }

  /** Releases an IN_PROGRESS lock. Silent no-op when the key is absent (safe in catch paths). */
  async rollback(key: string): Promise<void> {
    const existing = this.store.get(key);
    if (existing && existing.status === 'IN_PROGRESS') {
      this.store.delete(key);
    }
  }

  /** Evicts expired entries. Returns the evicted count. */
  purgeExpired(): number {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.store) {
      const deadline = entry.status === 'COMPLETED' ? entry.expiresAt : entry.lockExpiresAt;
      if (now >= deadline) {
        this.store.delete(key);
        evicted += 1;
      }
    }
    return evicted;
  }
}
