import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSession } from '@/components/session';
import { Button, Card, CardLabel, Pill, Screen } from '@/components/ui';
import { initials } from '@/lib/format';
import { radius, space, theme } from '@/lib/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useSession();

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  if (!user) return <Screen title="Profile">{null}</Screen>;

  return (
    <Screen title="Profile">
      <Card>
        <View style={st.row}>
          <View style={st.avatar}>
            <Text style={st.avatarText}>{initials(user.displayName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.name}>{user.displayName}</Text>
            <Text style={st.email}>{user.email}</Text>
          </View>
        </View>
        <View style={st.roles}>
          {user.roles.map((r) => (
            <Pill key={r} label={r.replace('_', ' ')} tone="info" />
          ))}
        </View>
      </Card>

      <Card>
        <CardLabel>Payslip &amp; entitlements</CardLabel>
        <Text style={st.p}>Line-by-line payslip and your travel/DA entitlements — coming next.</Text>
      </Card>

      <Button label="Sign out" variant="outline" onPress={handleSignOut} />
    </Screen>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  name: { color: theme.text, fontWeight: '700', fontSize: 17 },
  email: { color: theme.textMuted, fontSize: 13 },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(3) },
  p: { color: theme.textMuted, fontSize: 13, marginTop: space(1.5), lineHeight: 19 },
});
