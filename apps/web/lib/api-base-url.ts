/** Resolves the NestJS API base URL from env. Validated at startup, not on every call. */
export const API_BASE_URL = (() => {
  const url = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
  return url.replace(/\/+$/, '');
})();
