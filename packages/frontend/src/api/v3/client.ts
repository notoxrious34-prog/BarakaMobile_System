/**
 * DIRECTIVE-020 Stage 10.1 — v3 HTTP transport (frontend SDK core).
 *
 * Single choke point for every v3 gateway call. Reuses the app's proven
 * conventions from `lib/api.ts` (same base URL, same `x-session-token`
 * header — NOT Bearer, by architectural harmony): the only additions are
 * the `{ success, data | error }` envelope contract, automatic
 * `x-idempotency-key` injection on POST/PATCH, and typed `V3ApiError`.
 *
 * Transport is injectable (`fetchFn`, `getSessionToken`,
 * `generateIdempotencyKey`) so unit tests run on plain Node with zero
 * framework. The default client reads the browser session lazily.
 */
import { API_BASE_URL } from '@/lib/api';
import type { ApiResponse } from './types';

export class V3ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'V3ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    Object.setPrototypeOf(this, V3ApiError.prototype);
  }
}

export function isV3ApiError(error: unknown): error is V3ApiError {
  return error instanceof V3ApiError;
}

export interface V3ClientOptions {
  baseUrl?: string;
  getSessionToken?: () => string | null | undefined;
  fetchFn?: typeof fetch;
  generateIdempotencyKey?: () => string;
}

export interface MutatingRequestOptions {
  /** Explicit key (retries, double-submit guards). Auto-generated when omitted. */
  idempotencyKey?: string;
  headers?: Record<string, string>;
}

export interface V3Client {
  get<T>(path: string, query?: Record<string, string | undefined>, headers?: Record<string, string>): Promise<T>;
  post<T>(path: string, body?: unknown, opts?: MutatingRequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, opts?: MutatingRequestOptions): Promise<T>;
}

const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set(['POST', 'PATCH']);

function defaultIdempotencyKey(): string {
  const cryptoRef: unknown =
    typeof globalThis !== 'undefined' ? (globalThis as Record<string, unknown>).crypto : undefined;
  if (cryptoRef && typeof (cryptoRef as { randomUUID?: unknown }).randomUUID === 'function') {
    return (cryptoRef as { randomUUID: () => string }).randomUUID();
  }
  return `v3-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

function defaultSessionToken(): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('bm_session_token');
    }
  } catch {
    return null;
  }
  return null;
}

function toQueryString(query?: Record<string, string | undefined>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function extractFailureMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (record.error && typeof record.error === 'object') {
      const message = (record.error as Record<string, unknown>).message;
      if (typeof message === 'string' && message.length > 0) return message;
    }
    if (typeof record.message === 'string' && record.message.length > 0) return record.message;
  }
  if (typeof body === 'string' && body.length > 0) return body;
  return fallback;
}

export function createV3Client(options: V3ClientOptions = {}): V3Client {
  const baseUrl = options.baseUrl ?? API_BASE_URL;
  const getToken = options.getSessionToken ?? defaultSessionToken;
  const fetchFn = options.fetchFn ?? fetch;
  const newKey = options.generateIdempotencyKey ?? defaultIdempotencyKey;

  async function request<T>(method: string, path: string, body?: unknown, opts: MutatingRequestOptions = {}): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { 'x-session-token': token } : {}),
      ...(IDEMPOTENT_METHODS.has(method) ? { 'x-idempotency-key': opts.idempotencyKey ?? newKey() } : {}),
      ...(opts.headers ?? {}),
    };
    let res: Response;
    try {
      res = await fetchFn(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new V3ApiError('NETWORK_ERROR', error instanceof Error ? error.message : 'Network request failed.', 0);
    }

    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      const envelope = parsed as Partial<ApiResponse<never>> | null;
      const failure = envelope && typeof envelope === 'object' && 'error' in envelope ? envelope.error : undefined;
      throw new V3ApiError(
        failure?.code ?? `HTTP_${res.status}`,
        failure?.message ?? extractFailureMessage(parsed, `HTTP ${res.status}`),
        res.status,
        failure?.details,
      );
    }

    const envelope = parsed as ApiResponse<T>;
    if (envelope && typeof envelope === 'object' && envelope.success === false) {
      throw new V3ApiError(envelope.error.code, envelope.error.message, res.status, envelope.error.details);
    }
    if (envelope && typeof envelope === 'object' && envelope.success === true) {
      return envelope.data;
    }
    return parsed as T;
  }

  return {
    get<T>(path: string, query?: Record<string, string | undefined>): Promise<T> {
      return request<T>('GET', `${path}${toQueryString(query)}`);
    },
    post<T>(path: string, body?: unknown, opts?: MutatingRequestOptions): Promise<T> {
      return request<T>('POST', path, body, opts);
    },
    patch<T>(path: string, body?: unknown, opts?: MutatingRequestOptions): Promise<T> {
      return request<T>('PATCH', path, body, opts);
    },
  };
}

/** Shared browser client (base URL + session from localStorage). */
export const v3Api: V3Client = createV3Client();
