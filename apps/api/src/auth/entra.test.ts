import { describe, expect, it } from 'vitest';
import { SignJWT, generateKeyPair } from 'jose';
import {
  createEntraVerifier,
  isPlaceholderTenant,
  mapTokenClaims,
  resolveAuthMode,
} from './entra.js';

const TENANT = '11111111-2222-3333-4444-555555555555';
const AUDIENCE = 'api://ces-internal';
const ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`;

describe('isPlaceholderTenant', () => {
  it('treats empty / all-zero GUIDs as placeholders', () => {
    expect(isPlaceholderTenant(undefined)).toBe(true);
    expect(isPlaceholderTenant('')).toBe(true);
    expect(isPlaceholderTenant('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(isPlaceholderTenant(TENANT)).toBe(false);
  });
});

describe('resolveAuthMode', () => {
  it('defaults to dev locally', () => {
    expect(resolveAuthMode({ NODE_ENV: 'development', AZURE_TENANT_ID: TENANT })).toBe('dev');
  });
  it('uses entra in production with a real tenant', () => {
    expect(resolveAuthMode({ NODE_ENV: 'production', AZURE_TENANT_ID: TENANT })).toBe('entra');
  });
  it('stays dev in production when the tenant is a placeholder', () => {
    expect(
      resolveAuthMode({ NODE_ENV: 'production', AZURE_TENANT_ID: '00000000-0000-0000-0000-000000000000' }),
    ).toBe('dev');
  });
  it('honors an explicit AUTH_MODE override', () => {
    expect(resolveAuthMode({ AUTH_MODE: 'entra', NODE_ENV: 'development', AZURE_TENANT_ID: '' })).toBe(
      'entra',
    );
    expect(resolveAuthMode({ AUTH_MODE: 'dev', NODE_ENV: 'production', AZURE_TENANT_ID: TENANT })).toBe(
      'dev',
    );
  });
});

describe('mapTokenClaims', () => {
  it('extracts oid/email/name/roles and lowercases email', () => {
    const claims = mapTokenClaims({
      oid: 'abc',
      preferred_username: 'Rohit@CesTech.in',
      name: 'Eng Rohit',
      roles: ['ENGINEER'],
    });
    expect(claims).toEqual({ oid: 'abc', email: 'rohit@cestech.in', name: 'Eng Rohit', roles: ['ENGINEER'] });
  });
  it('falls back to sub and email/upn, defaults roles to []', () => {
    const claims = mapTokenClaims({ sub: 'sub-1', email: 'x@y.com' });
    expect(claims.oid).toBe('sub-1');
    expect(claims.roles).toEqual([]);
  });
  it('throws without an oid/sub', () => {
    expect(() => mapTokenClaims({ email: 'x@y.com' })).toThrow();
  });
});

describe('createEntraVerifier', () => {
  it('verifies a correctly-signed token and rejects a wrong audience', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const verifier = createEntraVerifier({
      tenantId: TENANT,
      audience: AUDIENCE,
      keyResolver: () => publicKey,
    });

    const good = await new SignJWT({ oid: 'oid-1', preferred_username: 'a@cestech.in', name: 'A' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(privateKey);
    await expect(verifier.verify(good)).resolves.toMatchObject({ oid: 'oid-1', email: 'a@cestech.in' });

    const wrongAud = await new SignJWT({ oid: 'oid-1' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setAudience('api://someone-else')
      .setExpirationTime('5m')
      .sign(privateKey);
    await expect(verifier.verify(wrongAud)).rejects.toThrow();
  });
});
