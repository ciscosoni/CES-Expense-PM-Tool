import * as React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { api } from '@/lib/api';
import { useSession } from '@/components/session';
import { useAsync } from '@/lib/use-async';
import { Button, Card, CardLabel, Loading, Pill, Screen } from '@/components/ui';
import { isManager, type ExpenseRow, type TaskRow } from '@/lib/types';
import { space, theme } from '@/lib/theme';

interface AttendanceDay {
  date: string;
  status: string;
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  ON_SITE: 'success',
  REMOTE: 'info',
  REGULARIZED: 'info',
  PARTIAL: 'warning',
  ABSENT: 'danger',
};

export default function TodayScreen() {
  const { user } = useSession();
  const manager = user ? isManager(user.roles) : false;
  const [checking, setChecking] = React.useState(false);

  const days = useAsync(() => api.get<AttendanceDay[]>('/attendance/mine'), []);
  const tasks = useAsync(() => api.get<TaskRow[]>('/tasks/mine'), []);
  const expenses = useAsync(() => api.get<ExpenseRow[]>('/expenses/mine'), []);
  const inbox = useAsync(
    () =>
      manager
        ? Promise.all([
            api.get<unknown[]>('/travel-requests/inbox').catch(() => []),
            api.get<unknown[]>('/expenses/inbox').catch(() => []),
          ]).then(([t, e]) => t.length + e.length)
        : Promise.resolve(0),
    [manager],
  );

  const today = new Date().toISOString().slice(0, 10);
  const todayStatus = days.data?.find((d) => d.date.slice(0, 10) === today)?.status ?? null;
  const activeTasks = tasks.data?.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED') ?? [];
  const pendingExpenses = expenses.data?.filter((e) => e.status === 'DRAFT' || e.status === 'SUBMITTED') ?? [];

  async function check(kind: 'CHECK_IN' | 'CHECK_OUT') {
    setChecking(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location needed', 'Enable location to record a geofenced check-in.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await api.post('/attendance/events', {
        kind,
        occurredAt: new Date().toISOString(),
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyMeters: Math.round(pos.coords.accuracy ?? 0),
        source: 'MOBILE',
      });
      Alert.alert('Recorded', `${kind === 'CHECK_IN' ? 'Checked in' : 'Checked out'} with GPS evidence.`);
      days.reload();
    } catch (e) {
      Alert.alert('Could not record', e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  }

  return (
    <Screen
      title={greeting(user?.displayName)}
      subtitle={new Date().toDateString()}
      refreshing={days.loading || tasks.loading}
      onRefresh={() => {
        days.reload();
        tasks.reload();
        expenses.reload();
        inbox.reload();
      }}
    >
      <Card>
        <View style={st.between}>
          <CardLabel>Attendance · today</CardLabel>
          {todayStatus ? (
            <Pill label={todayStatus.replace('_', ' ')} tone={STATUS_TONE[todayStatus] ?? 'neutral'} />
          ) : (
            <Pill label="Not checked in" tone="neutral" />
          )}
        </View>
        <View style={st.btnRow}>
          <View style={{ flex: 1 }}>
            <Button label="Check in" onPress={() => check('CHECK_IN')} loading={checking} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Check out" variant="outline" onPress={() => check('CHECK_OUT')} loading={checking} />
          </View>
        </View>
        <Text style={st.hint}>Records your GPS so on-site time is objective, not disputed.</Text>
      </Card>

      <View style={st.grid}>
        <Stat label="Active tasks" value={activeTasks.length} />
        <Stat label="Pending expenses" value={pendingExpenses.length} />
        {manager && <Stat label="To approve" value={inbox.data ?? 0} tone="warning" />}
      </View>

      <Card>
        <CardLabel>Today&apos;s tasks</CardLabel>
        {tasks.loading ? (
          <Loading />
        ) : activeTasks.length === 0 ? (
          <Text style={st.hint}>Nothing assigned right now.</Text>
        ) : (
          activeTasks.slice(0, 5).map((t) => (
            <View key={t.id} style={st.taskRow}>
              <Text style={st.taskTitle} numberOfLines={1}>
                {t.title}
              </Text>
              <Text style={st.taskPct}>{t.percentComplete}%</Text>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

function Stat({ label, value, tone = 'info' }: { label: string; value: number; tone?: 'info' | 'warning' }) {
  return (
    <Card style={{ flex: 1, marginBottom: 0 }}>
      <Text style={[st.statValue, { color: tone === 'warning' ? theme.warning : theme.text }]}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </Card>
  );
}

function greeting(name?: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name.split(' ')[0]}` : part;
}

const st = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  btnRow: { flexDirection: 'row', gap: space(2), marginTop: space(3) },
  hint: { color: theme.textFaint, fontSize: 12, marginTop: space(2), lineHeight: 17 },
  grid: { flexDirection: 'row', gap: space(3), marginBottom: space(3) },
  statValue: { fontSize: 26, fontWeight: '700' },
  statLabel: { fontSize: 11, color: theme.textMuted, marginTop: space(1) },
  taskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space(2),
    borderTopWidth: 1,
    borderTopColor: theme.cardBorder,
    marginTop: space(2),
  },
  taskTitle: { color: theme.text, fontSize: 14, flex: 1, marginRight: space(3) },
  taskPct: { color: theme.primary, fontSize: 13, fontWeight: '600' },
});
