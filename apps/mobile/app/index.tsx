import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useSession } from '@/components/session';
import { Loading } from '@/components/ui';
import { theme } from '@/lib/theme';

/** Auth gate: wait for the session, then route to the app or login. */
export default function Index() {
  const { user, ready } = useSession();
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center' }}>
        <Loading />
      </View>
    );
  }
  return <Redirect href={user ? '/(tabs)' : '/login'} />;
}
