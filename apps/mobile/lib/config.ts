/**
 * API base URL. On a physical device `localhost` points at the phone, so set
 * EXPO_PUBLIC_API_BASE_URL to your machine's LAN IP (e.g. http://192.168.1.5:4000)
 * when testing on a real device. Simulators can use localhost.
 */
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'
).replace(/\/+$/, '');

/** Real Microsoft sign-in is wired when a non-placeholder tenant + client id are present. */
export function isEntraConfigured(): boolean {
  const t = process.env.EXPO_PUBLIC_AZURE_TENANT_ID;
  const c = process.env.EXPO_PUBLIC_AZURE_MOBILE_CLIENT_ID;
  const placeholder = /^0{8}-0{4}-0{4}-0{4}-0{12}$/;
  return !!t && !placeholder.test(t) && !!c && !placeholder.test(c);
}
