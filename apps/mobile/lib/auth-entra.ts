import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

/**
 * Mobile Microsoft (Entra ID) sign-in — PKCE via the system browser.
 *
 * Mirrors the web MSAL flow: the app opens the Entra authorize page, the user
 * signs in, and we exchange the returned code for an access token that the API
 * client sends as a Bearer JWT (validated by the API's Entra verifier). Stays
 * dormant locally — login.tsx only invokes it when {@link isEntraConfigured}.
 *
 * Entra app registration must list the redirect URI below under
 * "Mobile and desktop applications": `ces://auth` (the app's `scheme` is `ces`).
 */

// Finishes an auth session if the app was reopened via the redirect.
WebBrowser.maybeCompleteAuthSession();

const TENANT = process.env.EXPO_PUBLIC_AZURE_TENANT_ID;
const CLIENT_ID = process.env.EXPO_PUBLIC_AZURE_MOBILE_CLIENT_ID;
/** Delegated API scope, e.g. `api://ces-internal/access_as_user`. */
const API_SCOPE = process.env.EXPO_PUBLIC_AZURE_API_SCOPE;

function discovery(): AuthSession.DiscoveryDocument {
  return {
    authorizationEndpoint: `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`,
    tokenEndpoint: `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
  };
}

/** Scopes requested at login — the API scope plus OIDC + refresh. */
function scopes(): string[] {
  return [API_SCOPE, 'openid', 'profile', 'email', 'offline_access'].filter(
    (s): s is string => !!s,
  );
}

/**
 * Run the interactive sign-in and return an access token.
 * Throws on cancel or error (caller surfaces the message).
 */
export async function signInWithEntra(): Promise<string> {
  if (!TENANT || !CLIENT_ID) {
    throw new Error('Microsoft sign-in is not configured on this build.');
  }
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'ces', path: 'auth' });
  const disco = discovery();

  const request = new AuthSession.AuthRequest({
    clientId: CLIENT_ID,
    redirectUri,
    scopes: scopes(),
    usePKCE: true,
  });
  // Generates the PKCE verifier/challenge and the auth URL.
  await request.makeAuthUrlAsync(disco);

  const result = await request.promptAsync(disco);
  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('Sign-in cancelled.');
  }
  if (result.type !== 'success' || !result.params.code) {
    const detail = result.type === 'error' ? result.params.error_description : undefined;
    throw new Error(detail || 'Microsoft sign-in failed.');
  }

  const token = await AuthSession.exchangeCodeAsync(
    {
      clientId: CLIENT_ID,
      code: result.params.code,
      redirectUri,
      scopes: scopes(),
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    disco,
  );
  if (!token.accessToken) throw new Error('No access token returned by Microsoft.');
  return token.accessToken;
}
