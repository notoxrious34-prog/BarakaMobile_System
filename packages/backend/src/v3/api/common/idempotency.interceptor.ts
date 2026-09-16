import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, catchError, mergeMap, of } from 'rxjs';
import { IdempotencyEngine } from '../../../core/idempotency';

/**
 * DIRECTIVE-018 Stage 9.1 — HTTP idempotency via `x-idempotency-key`.
 *
 * Executes the request through the shared `IdempotencyEngine`: first
 * delivery runs the handler and caches the (unenveloped) result, replays
 * with the same key are served from cache without re-executing domain
 * work. Registered INSIDE the envelope interceptor so replays are
 * re-enveloped on the way out. Concurrent duplicate delivery answers
 * 409 via the engine's exclusive lock (mapped by DomainErrorFilter).
 * Requests without the header pass straight through.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotency: IdempotencyEngine) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest() as {
      headers?: Record<string, string | string[] | undefined>;
      method?: string;
      route?: { path?: string };
      url?: string;
    };
    const raw = req.headers?.['x-idempotency-key'];
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (!key || key.trim().length === 0) return next.handle();

    const operation = `v3:${req.method ?? 'POST'}:${req.route?.path ?? req.url ?? 'unknown'}`;
    const attempt = await this.idempotency.begin(key.trim(), operation);
    if (attempt.isReplay) {
      const cached = attempt.response as { body?: unknown } | undefined;
      return of(cached && typeof cached === 'object' && 'body' in cached ? cached.body : attempt.response);
    }
    return next.handle().pipe(
      mergeMap(async (data) => {
        await this.idempotency.commit(key.trim(), data);
        return data;
      }),
      catchError(async (error: unknown) => {
        await this.idempotency.rollback(key.trim());
        throw error;
      }),
    );
  }
}
