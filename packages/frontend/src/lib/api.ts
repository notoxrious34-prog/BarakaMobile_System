export const API_BASE_URL = 'http://localhost:3001/api';

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = Omit<RequestInit, 'method' | 'body'> & {
  body?: unknown;
};

async function request<T>(path: string, method: string, opts: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = opts;

  const url = `${API_BASE_URL}${path}`;

  // Offline-first operator session: attach opaque token when present.
  let sessionToken: string | null = null;
  try {
    sessionToken = window.localStorage.getItem('bm_session_token');
  } catch {
    sessionToken = null;
  }

  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
      ...(headers ?? {}),
    },
    ...rest,
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  } else if (method === 'POST' || method === 'PATCH') {
    // Avoid sending undefined body for empty POST/PATCH if caller didn't provide one;
    // keep Content-Type consistent.
  }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    // Network/offline errors
    throw new ApiError(err instanceof Error ? err.message : 'خطأ في الاتصال بالخادم', 0, null);
  }

  const contentType = res.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');

  let data: unknown = null;
  if (res.status !== 204) {
    if (isJson) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    } else {
      try {
        data = await res.text();
      } catch {
        data = null;
      }
    }
  }

  if (!res.ok) {
    const message =
      (data as { message?: string } | null)?.message ??
      (typeof data === 'string' && data.length > 0 ? data : `HTTP ${res.status}`);
    throw new ApiError(message, res.status, data);
  }

  return data as T;
}

export const api = {
  get<T>(path: string, opts?: RequestOptions): Promise<T> {
    return request<T>(path, 'GET', opts);
  },
  post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return request<T>(path, 'POST', { ...opts, body });
  },
  patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return request<T>(path, 'PATCH', { ...opts, body });
  },
  delete<T>(path: string, opts?: RequestOptions): Promise<T> {
    return request<T>(path, 'DELETE', opts);
  },
};
