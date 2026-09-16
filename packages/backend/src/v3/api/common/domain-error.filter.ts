import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../core/result';

/**
 * DIRECTIVE-018 Stage 9.1 — v3 domain error → HTTP mapping.
 *
 * Every v3 controller response uses the standard envelope:
 *   success: { success: true, data: T }
 *   failure: { success: false, error: { code, message, details? } }
 *
 * Status matrix (deterministic, by machine code):
 *   400 — VALIDATION_ERROR and INVALID_* (bad shape, bad pricing, bad leg)
 *         (except INVALID_REPAIR_TRANSITION, which is a state conflict → 409)
 *   404 — NOT_FOUND and *_NOT_FOUND (documents, orders, wallets, serials)
 *   409 — CONFLICT, CONCURRENCY_CONFLICT (incl. idempotent concurrent
 *           replay), *_CLOSED (terminal orders), INACTIVE_*, FISCAL_PERIOD_CLOSED
 *   422 — INSUFFICIENT_* (stock, wallet float) and credit-limit rejections
 *           (raised as VALIDATION_ERROR with 'Credit limit exceeded')
 *   500 — LEDGER_IMBALANCE, IMBALANCED_STATEMENTS, unknown domain codes
 * Nest HttpExceptions (e.g. ValidationPipe 400s, guard 401/403s) are
 * re-enveloped with their original status.
 */

function statusFor(code: string, message: string): number {
  if (code === 'NOT_FOUND' || code.endsWith('_NOT_FOUND')) return HttpStatus.NOT_FOUND;
  if (
    code === 'CONFLICT' ||
    code === 'CONCURRENCY_CONFLICT' ||
    code === 'FISCAL_PERIOD_CLOSED' ||
    code === 'INVALID_REPAIR_TRANSITION' ||
    code.endsWith('_CLOSED') ||
    code.startsWith('INACTIVE_')
  ) {
    return HttpStatus.CONFLICT;
  }
  if (code.includes('INSUFFICIENT') || /credit limit/i.test(message)) return HttpStatus.UNPROCESSABLE_ENTITY;
  if (code === 'LEDGER_IMBALANCE' || code === 'IMBALANCED_STATEMENTS') {
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
  if (code === 'VALIDATION_ERROR' || code.startsWith('INVALID_')) return HttpStatus.BAD_REQUEST;
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

function codeForHttpStatus(status: number): string {
  if (status === HttpStatus.BAD_REQUEST) return 'VALIDATION_ERROR';
  if (status === HttpStatus.UNAUTHORIZED) return 'UNAUTHORIZED';
  if (status === HttpStatus.FORBIDDEN) return 'FORBIDDEN';
  if (status === HttpStatus.NOT_FOUND) return 'NOT_FOUND';
  if (status === HttpStatus.CONFLICT) return 'CONFLICT';
  return `HTTP_${status}`;
}

@Catch()
export class DomainErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse();
    if (exception instanceof DomainError) {
      const status = statusFor(exception.code, exception.message);
      res.status(status).json({
        success: false,
        error: { code: exception.code, message: exception.message, ...(exception.details !== undefined ? { details: exception.details } : {}) },
      });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message = typeof body === 'string' ? body : ((body as { message?: unknown }).message ?? exception.message);
      res.status(status).json({
        success: false,
        error: { code: codeForHttpStatus(status), message: Array.isArray(message) ? message.join('; ') : String(message) },
      });
      return;
    }
    const message = exception instanceof Error ? exception.message : 'Unexpected internal error.';
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
}
