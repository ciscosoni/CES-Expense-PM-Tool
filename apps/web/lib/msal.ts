import type { Configuration } from '@azure/msal-browser';

/**
 * MSAL config for the Next.js web app (PKCE). Entra is only "configured" when a
 * real tenant + web client id are present; locally these are placeholders, so
 * the app keeps the dev-user picker and never initializes MSAL.
 */

const TENANT = process.env.NEXT_PUBLIC_AZURE_TENANT_ID;
const CLIENT_ID = process.env.NEXT_PUBLIC_AZURE_WEB_CLIENT_ID;
/** Delegated scope for the API (e.g. `api://ces-internal/access_as_user`). */
const API_SCOPE = process.env.NEXT_PUBLIC_AZURE_API_SCOPE;

function isPlaceholder(v: string | undefined): boolean {
  return !v || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(v);
}

/** True when real Entra credentials are wired (Azure), false locally. */
export function isEntraConfigured(): boolean {
  return !isPlaceholder(TENANT) && !!CLIENT_ID && !isPlaceholder(CLIENT_ID);
}

/** Scopes requested at login — the API access scope, falling back to OIDC basics. */
export const loginScopes: string[] = API_SCOPE ? [API_SCOPE] : ['openid', 'profile', 'email'];

/** Returns the MSAL config, or null when Entra is not configured. */
export function getMsalConfig(): Configuration | null {
  if (!isEntraConfigured()) return null;
  return {
    auth: {
      clientId: CLIENT_ID!,
      authority: `https://login.microsoftonline.com/${TENANT}`,
      redirectUri: typeof window === 'undefined' ? '/' : `${window.location.origin}/login`,
    },
    cache: {
      cacheLocation: 'sessionStorage',
      storeAuthStateInCookie: false,
    },
  };
}
