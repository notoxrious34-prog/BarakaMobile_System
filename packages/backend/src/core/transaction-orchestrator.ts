import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConcurrencyError, DomainError } from './result';

/**
 * TASK BRIEF-007 Stage 1.1 — Transaction orchestrator (v3.0 foundation).
 *
 * Single choke point for every Prisma interactive transaction:
 *  - timeout guard (fail-fast on hanging transactions),
 *  - post-commit hook registry (domain events fire strictly AFTER the
 *    commit succeeds — never on rollback, never before durability),
 *  - rollback error normalization into `DomainError`.
 *
 * Isolation: `isolationLevel` is accepted for forward compatibility with a
 * future Postgres deployment. SQLite (current, Prisma 6) has no
 * per-transaction isolation knob, so it is recorded but NOT forwarded to
 * `$transaction` — only `maxWait`/`timeout` are passed through.
 */

export type PostCommitHandler = () => void | Promise<void>;

export interface TransactionOrchestratorOptions {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  /** Fail-fast budget for the whole transaction body. No timeout when omitted. */
  timeoutMs?: number;
  /** Max wait for a pooled connection / interactive-tx slot. */
  maxWaitMs?: number;
  operationName?: string;
  /** One-shot handlers for this run only (run after the registry, in order). */
  afterCommit?: PostCommitHandler[];
}

const PRISMA_CONCURRENCY_CODES = new Set(['P2034']);

@Injectable()
export class TransactionOrchestrator {
  private readonly postCommitRegistry = new Set<PostCommitHandler>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Global post-commit listener. Returns an unsubscribe function.
   * Runs after EVERY successful `run()` commit, before one-shot handlers.
   */
  registerPostCommit(handler: PostCommitHandler): () => void {
    this.postCommitRegistry.add(handler);
    return () => {
      this.postCommitRegistry.delete(handler);
    };
  }

  clearPostCommitRegistry(): void {
    this.postCommitRegistry.clear();
  }

  async run<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    options: TransactionOrchestratorOptions = {},
  ): Promise<T> {
    const txArgs: { maxWait?: number; timeout?: number } = {};
    if (options.maxWaitMs !== undefined) txArgs.maxWait = options.maxWaitMs;
    if (options.timeoutMs !== undefined) txArgs.timeout = options.timeoutMs;

    let result: T;
    try {
      const pending = this.prisma.$transaction(
        (tx: Prisma.TransactionClient) => work(tx),
        txArgs,
      ) as Promise<T>;
      if (options.timeoutMs !== undefined && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
        result = await this.withTimeoutGuard(pending, options.timeoutMs, options.operationName);
      } else {
        result = await pending;
      }
    } catch (error) {
      throw this.normalizeError(error, options.operationName);
    }

    // Commit succeeded — fire post-commit handlers strictly after durability.
    const handlers = [...this.postCommitRegistry, ...(options.afterCommit ?? [])];
    for (const handler of handlers) {
      await handler();
    }
    return result;
  }

  private async withTimeoutGuard<T>(pending: Promise<T>, timeoutMs: number, operationName?: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const label = operationName ? ` (${operationName})` : '';
          reject(
            new ConcurrencyError(`Transaction timed out after ${timeoutMs}ms${label}.`, {
              timeoutMs,
              operationName,
            }),
          );
        }, timeoutMs);
        const t = timer as unknown as { unref?: () => void };
        if (typeof t.unref === 'function') t.unref();
      });
      // Promise.race subscribes to `pending`, so a late rejection after the
      // timeout wins is still observed — no unhandled rejection.
      return await Promise.race([pending, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private normalizeError(error: unknown, operationName?: string): DomainError {
    if (error instanceof DomainError) return error;
    const message = error instanceof Error ? error.message : String(error);
    const label = operationName ? ` (${operationName})` : '';
    const code =
      error !== null && typeof error === 'object'
        ? (error as { code?: unknown }).code
        : undefined;
    if (typeof code === 'string' && PRISMA_CONCURRENCY_CODES.has(code)) {
      const wrapped = new ConcurrencyError(`Transaction conflict${label}: ${message}`, {
        code,
        operationName,
      });
      (wrapped as { cause?: unknown }).cause = error;
      return wrapped;
    }
    const wrapped = new DomainError(`Transaction failed${label}: ${message}`, 'TRANSACTION_FAILED', {
      operationName,
    });
    (wrapped as { cause?: unknown }).cause = error;
    return wrapped;
  }
}
