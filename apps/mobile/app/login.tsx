import * as React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { setAccessToken, setDevEmail } from '@/lib/session';
import { signInWithEntra } from '@/lib/auth-entra';
import { isEntraConfigured } from '@/lib/config';
import { useSession } from '@/components/session';
import { Button, Card, Loading, Screen } from '@/components/ui';
import { initials } from '@/lib/format';
import { radius, space, theme } from '@/lib/theme';
import type { AuthedUser } from '@/lib/types';

export default function LoginScreen() {
  const router = useRouter();
  const { refresh } = useSession();
  const [users, setUsers] = React.useState<AuthedUser[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const entra = isEntraConfigured();

  React.useEffect(() => {
    if (entra) return;
    api
      .get<AuthedUser[]>('/users/dev-options')
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [entra]);

  async function pick(email: string) {
    setBusy(email);
    try {
      await setDevEmail(email);
      await refresh();
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  async function signInEntra() {
    setBusy('entra');
    setError(null);
    try {
      const token = await signInWithEntra();
      await setAccessToken(token);
      await refresh();
      router.replace('/(tabs)');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      Alert.alert('Microsoft sign-in', msg);
      setBusy(null);
    }
  }

  return (
    <Screen title="CES Tech" subtitle="Internal Operations">
      <View style={{ marginVertical: space(4) }}>
        <Text style={st.h2}>{entra ? 'Sign in' : 'Welcome back'}</Text>
        <Text style={st.p}>
          {entra
            ? 'Sign in with your CES Tech Microsoft account.'
            : 'Choose a seeded user to explore from that role.'}
        </Text>
      </View>

      {entra ? (
        <Button
          label="Continue with Microsoft"
          loading={busy === 'entra'}
          onPress={signInEntra}
        />
      ) : error ? (
        <Card>
          <Text style={{ color: theme.danger, fontSize: 13 }}>Couldn&apos;t reach the API.</Text>
          <Text style={st.p}>{error}</Text>
        </Card>
      ) : !users ? (
        <Loading />
      ) : (
        users.map((u) => (
          <Pressable key={u.id} onPress={() => pick(u.email)} disabled={!!busy}>
            <Card style={{ opacity: busy && busy !== u.email ? 0.5 : 1 }}>
              <View style={st.row}>
                <View style={st.avatar}>
                  <Text style={st.avatarText}>{initials(u.displayName)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.name}>{u.displayName}</Text>
                  <Text style={st.email}>{u.email}</Text>
                </View>
                <Text style={st.role}>{u.roles[0]?.replace('_', ' ')}</Text>
              </View>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  h2: { fontSize: 18, fontWeight: '700', color: theme.text },
  p: { fontSize: 13, color: theme.textMuted, marginTop: space(1), lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  name: { color: theme.text, fontWeight: '600', fontSize: 15 },
  email: { color: theme.textMuted, fontSize: 12 },
  role: { color: theme.primary, fontSize: 11, fontWeight: '600' },
});
