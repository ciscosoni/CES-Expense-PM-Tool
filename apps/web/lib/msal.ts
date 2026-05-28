import type { Configuration } from '@azure/msal-browser';

/**
 * MSAL config for the Next.js web app. The actual MsalProvider is wired in a future commit
 * once we add a login flow. Keeping this here so env wiring is explicit from day 1.
 */
export function getMsalConfig(): Configuration {
  const tenantId = process.env.NEXT_PUBLIC_AZURE_TENANT_ID;
  const clientId = process.env.NEXT_PUBLIC_AZURE_WEB_CLIENT_ID;

  if (!tenantId || !clientId) {
    throw new Error(
      'MSAL: NEXT_PUBLIC_AZURE_TENANT_ID and NEXT_PUBLIC_AZURE_WEB_CLIENT_ID must be set',
    );
  }

  return {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri: typeof window === 'undefined' ? '/' : `${window.location.origin}/auth/callback`,
    },
    cache: {
      cacheLocation: 'sessionStorage',
      storeAuthStateInCookie: false,
    },
  };
}
