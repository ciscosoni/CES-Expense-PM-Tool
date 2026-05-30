import 'server-only';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'ces-dev-user-email';
const TOKEN_COOKIE = 'ces-access-token';
const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;

export async function getDevUserEmail(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

export async function setDevUserEmail(email: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, email, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_WEEK_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function clearDevUserEmail(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Entra access token (set after MSAL login) — bridges the SPA token to the
 * server-side proxy so the API receives a real Bearer JWT. */
export async function getAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(TOKEN_COOKIE)?.value ?? null;
}

export async function setAccessToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_WEEK_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function clearAccessToken(): Promise<void> {
  const store = await cookies();
  store.delete(TOKEN_COOKIE);
}
