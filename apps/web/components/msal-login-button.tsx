'use client';

import * as React from 'react';
import { useMsal } from '@azure/msal-react';
import { toast } from 'sonner';
import { loginScopes } from '@/lib/msal';
import { setEntraSession } from '@/lib/actions/auth';
import { Button } from './ui/button';

/**
 * "Continue with Microsoft" — PKCE popup login. On success it hands the access
 * token to a server action that persists it as an httpOnly cookie (bridging the
 * SPA token to the server-side API proxy). Only rendered when Entra is configured.
 */
export function MsalLoginButton() {
  const { instance } = useMsal();
  const [busy, setBusy] = React.useState(false);

  async function signIn() {
    setBusy(true);
    try {
      const result = await instance.loginPopup({ scopes: loginScopes });
      const token = result.accessToken;
      if (!token) throw new Error('No access token returned');
      // Server action sets the cookie and redirects to the app.
      await setEntraSession(token);
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : 'Microsoft sign-in failed');
    }
  }

  return (
    <Button variant="ai" size="lg" className="w-full" onClick={signIn} disabled={busy}>
      {busy ? 'Signing in…' : 'Continue with Microsoft'}
    </Button>
  );
}
