import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

/**
 * Microsoft Entra ID token validation.
 *
 * Local dev never exercises this path (AUTH_MODE resolves to 'dev'); it is the
 * production seam. The claim-mapping is a pure function so it can be unit-tested
 * against a locally-signed token without hitting Entra.
 */

export interface EntraClaims {
  /** Entra object id — stable per user per tenant. Maps to User.azureOid. */
  oid: string;
  email: string;
  name: string;
  /** App roles assigned in the Entra app registration (optional). */
  roles: string[];
}

/** A tenant id that is empty or an all-zero GUID is treated as "not configured". */
export function isPlaceholderTenant(tenantId: string | undefined | null): boolean {
  if (!tenantId) return true;
  return /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(tenantId.trim());
}

/**
 * Resolve the effective auth mode. Explicit AUTH_MODE wins; otherwise production
 * with a real tenant uses Entra, and everything else uses the dev-header path.
 */
export function resolveAuthMode(env: {
  AUTH_MODE?: 'dev' | 'entra';
  NODE_ENV?: string;
  AZURE_TENANT_ID?: string;
}): 'dev' | 'entra' {
  if (env.AUTH_MODE) return env.AUTH_MODE;
  if (env.NODE_ENV === 'production' && !isPlaceholderTenant(env.AZURE_TENANT_ID)) {
    return 'entra';
  }
  return 'dev';
}

/** Pure: extract the claims we care about from a verified JWT payload. */
export function mapTokenClaims(payload: JWTPayload): EntraClaims {
  const oid = (payload.oid as string) ?? payload.sub;
  const email =
    (payload.preferred_username as string) ??
    (payload.email as string) ??
    (payload.upn as string) ??
    '';
  const name = (payload.name as string) ?? email;
  const rolesRaw = payload.roles;
  const roles = Array.isArray(rolesRaw) ? (rolesRaw as string[]) : [];
  if (!oid) throw new Error('Token has no oid/sub claim');
  return { oid, email: email.toLowerCase(), name, roles };
}

export interface EntraVerifier {
  verify(token: string): Promise<EntraClaims>;
}

/**
 * Build a verifier bound to a tenant + audience. In tests, pass `keyResolver`
 * (a local public key or JWKS) to avoid the network round-trip.
 */
export function createEntraVerifier(opts: {
  tenantId: string;
  audience: string;
  issuer?: string;
  /** Test seam: a key-getter that avoids the network round-trip. */
  keyResolver?: JWTVerifyGetKey;
}): EntraVerifier {
  const issuer = opts.issuer ?? `https://login.microsoftonline.com/${opts.tenantId}/v2.0`;
  const getKey: JWTVerifyGetKey =
    opts.keyResolver ??
    createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${opts.tenantId}/discovery/v2.0/keys`),
    );
  return {
    async verify(token: string): Promise<EntraClaims> {
      const { payload } = await jwtVerify(token, getKey, {
        audience: opts.audience,
        issuer,
      });
      return mapTokenClaims(payload);
    },
  };
}
