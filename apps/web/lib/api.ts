'use client';

/**
 * Tiny typed fetch wrapper used by client components + TanStack Query.
 *
 * Hits the same-origin proxy at /api/* (see app/api/[...path]/route.ts) so the
 * browser never talks to the NestJS API directly, and the dev-user cookie gets
 * forwarded server-side.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  /** Query string values; nullish entries are skipped. */
  query?: Record<string, string | number | boolean | null | undefined>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (!query) return `/api${cleanPath}`;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === null || v === undefined || v === '') continue;
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `/api${cleanPath}?${qs}` : `/api${cleanPath}`;
}

async function handle<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    const message =
      (typeof body === 'object' &&
        body &&
        'message' in body &&
        String((body as { message: unknown }).message)) ||
      `HTTP ${res.status}`;
    throw new ApiError(res.status, body, message);
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  get<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return fetch(buildUrl(path, opts.query)).then((r) => handle<T>(r));
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return fetch(buildUrl(path), bodyInit('POST', body)).then((r) => handle<T>(r));
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return fetch(buildUrl(path), bodyInit('PATCH', body)).then((r) => handle<T>(r));
  },
  delete<T = void>(path: string): Promise<T> {
    return fetch(buildUrl(path), { method: 'DELETE' }).then((r) => handle<T>(r));
  },
};

function bodyInit(method: string, body: unknown): RequestInit {
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json' },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return init;
}
