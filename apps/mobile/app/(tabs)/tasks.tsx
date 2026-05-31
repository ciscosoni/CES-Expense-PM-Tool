import * as React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { Button, Card, Empty, Loading, Pill, Screen } from '@/components/ui';
import { radius, space, theme } from '@/lib/theme';
import type { TaskRow } from '@/lib/types';

const STATUS_TONE: Record<TaskRow['status'], 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  TODO: 'neutral',
  IN_PROGRESS: 'info',
  BLOCKED: 'danger',
  DONE: 'success',
  CANCELLED: 'neutral',
};

export default function TasksScreen() {
  const tasks = useAsync(() => api.get<TaskRow[]>('/tasks/mine'), []);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function update(t: TaskRow, body: Record<string, unknown>) {
    setBusy(t.id);
    try {
      await api.patch(`/tasks/${t.id}`, body);
      tasks.reload();
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const active = tasks.data?.filter((t) => t.status !== 'CANCELLED') ?? [];

  return (
    <Screen title="My tasks" refreshing={tasks.loading} onRefresh={tasks.reload}>
      {tasks.loading ? (
        <Loading />
      ) : active.length === 0 ? (
        <Empty text="No tasks assigned." />
      ) : (
        active.map((t) => (
          <Card key={t.id}>
            <View style={st.between}>
              <Text style={st.title} numberOfLines={2}>
                {t.title}
              </Text>
              <Pill label={t.status.replace('_', ' ')} tone={STATUS_TONE[t.status]} />
            </View>
            {t.project?.code ? <Text style={st.project}>{t.project.code}</Text> : null}

            <View style={st.barTrack}>
              <View style={[st.barFill, { width: `${t.percentComplete}%` }]} />
            </View>
            <Text style={st.pct}>{t.percentComplete}% complete</Text>

            {t.status !== 'DONE' && (
              <View style={st.actions}>
                <View style={{ flex: 1 }}>
                  <Button
                    label="+25%"
                    variant="outline"
                    loading={busy === t.id}
                    onPress={() =>
                      update(t, {
                        percentComplete: Math.min(100, t.percentComplete + 25),
                        status: 'IN_PROGRESS',
                      })
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Mark done"
                    loading={busy === t.id}
                    onPress={() => update(t, { percentComplete: 100, status: 'DONE' })}
                  />
                </View>
              </View>
            )}
          </Card>
        ))
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space(2) },
  title: { color: theme.text, fontSize: 15, fontWeight: '600', flex: 1 },
  project: { color: theme.textMuted, fontSize: 12, marginTop: space(1), fontFamily: 'monospace' },
  barTrack: {
    height: 6,
    backgroundColor: theme.bgElevated,
    borderRadius: radius.pill,
    marginTop: space(3),
    overflow: 'hidden',
  },
  barFill: { height: 6, backgroundColor: theme.primary, borderRadius: radius.pill },
  pct: { color: theme.textMuted, fontSize: 12, marginTop: space(1.5) },
  actions: { flexDirection: 'row', gap: space(2), marginTop: space(3) },
});
