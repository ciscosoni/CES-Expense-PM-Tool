import 'server-only';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'ces-dev-user-email';
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
