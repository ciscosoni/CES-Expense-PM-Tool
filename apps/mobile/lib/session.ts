import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local auth state. Dev builds store the chosen user email (mirrors the web
 * dev picker); production stores the MSAL access token. The API client sends
 * whichever is present.
 */
const EMAIL_KEY = 'ces.devEmail';
const TOKEN_KEY = 'ces.accessToken';

export async function getDevEmail(): Promise<string | null> {
  return AsyncStorage.getItem(EMAIL_KEY);
}
export async function setDevEmail(email: string): Promise<void> {
  await AsyncStorage.setItem(EMAIL_KEY, email.toLowerCase());
}
export async function getAccessToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}
export async function setAccessToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}
export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([EMAIL_KEY, TOKEN_KEY]);
}
