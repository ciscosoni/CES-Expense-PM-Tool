'use server';

import { redirect } from 'next/navigation';
import { clearDevUserEmail, setDevUserEmail } from '../auth-cookie';

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

export async function logout() {
  await clearDevUserEmail();
  redirect('/login');
}
