'use server';

import { redirect } from 'next/navigation';
import {
  clearAccessToken,
  clearDevUserEmail,
  setAccessToken,
  setDevUserEmail,
} from '../auth-cookie';

/**
 * Dev-mode login. Sets the email cookie; the API proxy forwards it as
 * X-Dev-User-Email so the API guard knows who you are.
 */
export async function loginAsDevUser(formData: FormData) {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  if (!email) return;
  await setDevUserEmail(email);
  redirect('/');
}

/**
 * Entra login bridge: the MSAL client acquires an access token in the browser,
 * then calls this to persist it as an httpOnly cookie. The proxy / serverFetch
 * forward it to the API as a Bearer JWT.
 */
export async function setEntraSession(token: string) {
  if (!token) return;
  await setAccessToken(token);
  redirect('/');
}

export async function logout() {
  await clearDevUserEmail();
  await clearAccessToken();
  redirect('/login');
}
