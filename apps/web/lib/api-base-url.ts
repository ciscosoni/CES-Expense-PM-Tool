/**
 * Resolves the NestJS API base URL. Server-only — the browser talks to the
 * same-origin `/api/*` proxy, never this directly.
 *
 * Prefer the RUNTIME `API_BASE_URL` env var so the deployed target isn't frozen
 * into the bundle: Next inlines `NEXT_PUBLIC_*` at build time (even in server
 * code), so a build-time value can't be overridden by container env. The
 * runtime var is read fresh in the standalone server, so ops can repoint the
 * API (e.g. to a custom domain) by updating the Container App env — no rebuild.
 */
export const API_BASE_URL = (() => {
  const url =
    process.env.API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    'http://localhost:4000';
  return url.replace(/\/+$/, '');
})();
