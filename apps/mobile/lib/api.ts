import { API_BASE_URL } from './config';
import { getAccessToken, getDevEmail } from './session';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (token) return { authorization: `Bearer ${token}` };
  const email = await getDevEmail();
  return email ? { 'x-dev-user-email': email } : {};
}

async function handle<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : '') || `HTTP ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return body as T;
}

function safeJson(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

export const api = {
  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE_URL}/api${norm(path)}`, {
      headers: { accept: 'application/json', ...(await authHeaders()) },
    });
    return handle<T>(res);
  },
  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API_BASE_URL}/api${norm(path)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...(await authHeaders()) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return handle<T>(res);
  },
  async patch<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API_BASE_URL}/api${norm(path)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...(await authHeaders()) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return handle<T>(res);
  },
};

function norm(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}
