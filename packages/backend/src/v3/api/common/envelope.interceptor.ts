import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * DIRECTIVE-018 Stage 9.1 — success envelope `{ success: true, data }`.
 *
 * Applied outside the handler (and outside the idempotency replay path):
 * replayed idempotent responses flow back through this interceptor, so
 * replays are enveloped exactly like fresh executions. Values that are
 * already enveloped pass through untouched.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === 'object' && 'success' in (data as Record<string, unknown>)) return data;
        return { success: true, data };
      }),
    );
  }
}
