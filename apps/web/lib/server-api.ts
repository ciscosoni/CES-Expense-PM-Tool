import 'server-only';
import { API_BASE_URL } from './api-base-url';
import { getDevUserEmail } from './auth-cookie';

/**
 * Server-side API fetch for use in Server Components and Server Actions.
 *
 * Reads the dev-user cookie directly and adds it as a header. Bypasses the
 * /api/* proxy so server components can render without an HTTP round-trip
 * through the Next layer.
 */
export async function serverFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const email = await getDevUserEmail();
  if (email) headers.set('x-dev-user-email', email);

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const res = await fetch(`${API_BASE_URL}/api${cleanPath}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`serverFetch ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}
