import * as React from 'react';
import { Alert, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { Button, Card, Empty, Loading, Pill, Screen } from '@/components/ui';
import { formatMoney, formatDate } from '@/lib/format';
import { radius, space, theme } from '@/lib/theme';

interface TravelItem {
  id: string;
  user: { displayName: string };
  fromCity: { name: string };
  toCity: { name: string };
  startDate: string;
}
interface ExpenseItem {
  id: string;
  amount: string;
  currency: string;
  category: string;
  user?: { displayName: string } | null;
}
interface Item {
  key: string;
  kind: 'travel' | 'expense';
  id: string;
  title: string;
  subtitle: string;
}

export default function ApprovalsScreen() {
  const data = useAsync(
    () =>
      Promise.all([
        api.get<TravelItem[]>('/travel-requests/inbox').catch(() => []),
        api.get<ExpenseItem[]>('/expenses/inbox').catch(() => []),
      ]),
    [],
  );
  const [busy, setBusy] = React.useState<string | null>(null);
  const [reject, setReject] = React.useState<Item | null>(null);
  const [reason, setReason] = React.useState('');

  const items: Item[] = React.useMemo(() => {
    if (!data.data) return [];
    const [travel, expenses] = data.data;
    return [
      ...travel.map((t) => ({
        key: `t-${t.id}`,
        kind: 'travel' as const,
        id: t.id,
        title: `Travel · ${t.user.displayName}`,
        subtitle: `${t.fromCity.name} → ${t.toCity.name} · ${formatDate(t.startDate)}`,
      })),
      ...expenses.map((e) => ({
        key: `e-${e.id}`,
        kind: 'expense' as const,
        id: e.id,
        title: `Expense · ${e.user?.displayName ?? ''}`.trim(),
        subtitle: `${formatMoney(e.amount, e.currency)} · ${e.category.replace('_', ' ')}`,
      })),
    ];
  }, [data.data]);

  const base = (it: Item) => (it.kind === 'travel' ? '/travel-requests' : '/expenses');

  async function approve(it: Item) {
    setBusy(it.id);
    try {
      await api.post(`${base(it)}/${it.id}/approve`);
      data.reload();
    } catch (e) {
      Alert.alert('Could not approve', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function submitReject() {
    if (!reject) return;
    if (!reason.trim()) {
      Alert.alert('Reason required', 'A rejection must include a reason.');
      return;
    }
    setBusy(reject.id);
    try {
      await api.post(`${base(reject)}/${reject.id}/reject`, { reason: reason.trim() });
      setReject(null);
      setReason('');
      data.reload();
    } catch (e) {
      Alert.alert('Could not reject', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen
      title="Approvals"
      subtitle={items.length ? `${items.length} awaiting you` : undefined}
      refreshing={data.loading}
      onRefresh={data.reload}
    >
      {data.loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty text="Inbox zero. Nothing awaiting your decision." />
      ) : (
        items.map((it) => (
          <Card key={it.key}>
            <View style={st.between}>
              <Text style={st.title}>{it.title}</Text>
              <Pill label={it.kind} tone="info" />
            </View>
            <Text style={st.sub}>{it.subtitle}</Text>
            <View style={st.actions}>
              <View style={{ flex: 1 }}>
                <Button label="Approve" loading={busy === it.id} onPress={() => approve(it)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Reject" variant="outline" onPress={() => setReject(it)} />
              </View>
            </View>
          </Card>
        ))
      )}

      <Modal visible={!!reject} transparent animationType="fade" onRequestClose={() => setReject(null)}>
        <View style={st.backdrop}>
          <View style={st.dialog}>
            <Text style={st.dialogTitle}>Reject — reason required</Text>
            <Text style={st.sub}>{reject?.subtitle}</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Why is this rejected?"
              placeholderTextColor={theme.textFaint}
              multiline
              style={st.input}
            />
            <Button label="Confirm reject" loading={busy === reject?.id} onPress={submitReject} />
            <View style={{ height: space(2) }} />
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => {
                setReject(null);
                setReason('');
              }}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const st = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: theme.text, fontSize: 15, fontWeight: '600', flex: 1 },
  sub: { color: theme.textMuted, fontSize: 13, marginTop: space(1) },
  actions: { flexDirection: 'row', gap: space(2), marginTop: space(3) },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: space(6) },
  dialog: { backgroundColor: theme.bgElevated, borderRadius: radius.lg, padding: space(5) },
  dialogTitle: { color: theme.text, fontSize: 17, fontWeight: '700' },
  input: {
    backgroundColor: theme.card,
    borderColor: theme.cardBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    color: theme.text,
    padding: space(3),
    marginVertical: space(3),
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 15,
  },
});
