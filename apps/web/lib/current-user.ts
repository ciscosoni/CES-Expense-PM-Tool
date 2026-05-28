import 'server-only';
import { redirect } from 'next/navigation';
import type { AuthedUser } from './types';
import { serverFetch } from './server-api';
import { getDevUserEmail } from './auth-cookie';

/**
 * Resolves the current user for server components. Redirects to /login if
 * the dev cookie is missing or the upstream API rejects auth.
 */
export async function requireUser(): Promise<AuthedUser> {
  const email = await getDevUserEmail();
  if (!email) redirect('/login');
  try {
    return await serverFetch<AuthedUser>('/users/me');
  } catch {
    redirect('/login');
  }
}
