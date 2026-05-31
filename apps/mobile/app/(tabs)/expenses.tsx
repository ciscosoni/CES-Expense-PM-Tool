import * as React from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api, ApiError } from '@/lib/api';
import { enqueue, flush, pendingCount } from '@/lib/queue';
import { useAsync } from '@/lib/use-async';
import { Button, Card, CardLabel, Empty, Loading, Pill, Screen } from '@/components/ui';
import { formatMoney, formatDate } from '@/lib/format';
import { radius, space, theme } from '@/lib/theme';
import type { ExpenseRow, ProjectRow, ReceiptAnalysis } from '@/lib/types';

const CATEGORIES = ['TRAVEL', 'LODGING', 'MEALS', 'LOCAL_CONVEYANCE', 'COMMUNICATION', 'MATERIALS', 'OTHER'];
const STATUS_TONE: Record<string, 'neutral' | 'warning' | 'info' | 'success' | 'danger'> = {
  DRAFT: 'neutral',
  SUBMITTED: 'warning',
  OWNER_APPROVED: 'info',
  APPROVED: 'info',
  REIMBURSED: 'success',
  REJECTED: 'danger',
};

interface Draft {
  fileName: string;
  contentType: string;
  fileBase64: string;
  projectId: string;
  category: string;
  amount: string;
  currency: string;
  incurredOn: string;
  notes: string;
  ocrSource?: string | undefined;
}

export default function ExpensesScreen() {
  const expenses = useAsync(() => api.get<ExpenseRow[]>('/expenses/mine'), []);
  const projects = useAsync(() => api.get<ProjectRow[]>('/projects'), []);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pending, setPending] = React.useState(0);

  const refreshPending = React.useCallback(() => {
    pendingCount().then(setPending);
  }, []);
  React.useEffect(() => {
    refreshPending();
    void flush().then((r) => {
      if (r.synced > 0) expenses.reload();
      refreshPending();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function capture(from: 'camera' | 'library') {
    const perm =
      from === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow access to capture a receipt.');
      return;
    }
    const res =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5, exif: true })
        : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.5, exif: true });
    if (res.canceled || !res.assets[0]?.base64) return;
    const a = res.assets[0];
    const fileBase64 = a.base64!;
    const contentType = a.mimeType ?? 'image/jpeg';
    const fileName = a.fileName ?? 'receipt.jpg';

    setBusy(true);
    try {
      const analysis = await api
        .post<ReceiptAnalysis>('/receipts/analyze', { fileName, contentType, fileBase64 })
        .catch(() => null); // offline ⇒ analyze unavailable; still let them fill manually
      const s = analysis?.suggestion;
      setDraft({
        fileName,
        contentType,
        fileBase64,
        projectId: s?.projectId ?? projects.data?.[0]?.id ?? '',
        category: s?.category ?? 'MEALS',
        amount: s?.amount ?? '',
        currency: s?.currency ?? 'INR',
        incurredOn: s?.incurredOn ?? new Date().toISOString().slice(0, 10),
        notes: s?.notes ?? '',
        ocrSource: analysis?.ocr?.source,
      });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft) return;
    if (!draft.projectId) {
      Alert.alert('Pick a project', 'Choose which project this expense belongs to.');
      return;
    }
    setBusy(true);
    const expense = {
      projectId: draft.projectId,
      category: draft.category,
      amount: draft.amount || '0',
      currency: draft.currency,
      incurredOn: draft.incurredOn,
      notes: draft.notes || undefined,
    };
    const receipt = { fileName: draft.fileName, contentType: draft.contentType, fileBase64: draft.fileBase64 };
    try {
      const created = await api.post<{ id: string }>('/expenses', expense);
      await api.post('/receipts', { expenseId: created.id, ...receipt }).catch(() => undefined);
      setDraft(null);
      expenses.reload();
      Alert.alert('Saved', 'Expense created with its receipt attached.');
    } catch (e) {
      if (e instanceof ApiError) {
        Alert.alert('Rejected', e.message);
      } else {
        // Network failure → queue for later.
        await enqueue({ expense, receipt });
        setDraft(null);
        refreshPending();
        Alert.alert('Saved offline', 'No connection — this will sync automatically when you’re back online.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    const r = await flush();
    refreshPending();
    if (r.synced > 0) expenses.reload();
    setBusy(false);
    Alert.alert('Sync', `${r.synced} synced, ${r.remaining} still pending.`);
  }

  return (
    <Screen
      title="Expenses"
      subtitle="Snap a receipt — it fills itself in"
      refreshing={expenses.loading}
      onRefresh={() => {
        expenses.reload();
        refreshPending();
      }}
    >
      {pending > 0 && (
        <Pressable onPress={syncNow}>
          <Card style={{ borderColor: theme.warning }}>
            <Text style={{ color: theme.warning, fontWeight: '600', fontSize: 13 }}>
              {pending} receipt{pending > 1 ? 's' : ''} waiting to sync — tap to retry
            </Text>
          </Card>
        </Pressable>
      )}

      <View style={st.captureRow}>
        <View style={{ flex: 1 }}>
          <Button label="Snap receipt" onPress={() => capture('camera')} loading={busy && !draft} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="From library" variant="outline" onPress={() => capture('library')} />
        </View>
      </View>

      {expenses.loading ? (
        <Loading />
      ) : (expenses.data?.length ?? 0) === 0 ? (
        <Empty text="No expenses yet. Snap a receipt to add one." />
      ) : (
        expenses.data!.map((e) => (
          <Card key={e.id}>
            <View style={st.between}>
              <Text style={st.amount}>{formatMoney(e.amount, e.currency)}</Text>
              <Pill label={e.status.replace('_', ' ')} tone={STATUS_TONE[e.status] ?? 'neutral'} />
            </View>
            <Text style={st.meta}>
              {e.category.replace('_', ' ')} · {formatDate(e.incurredOn)}
              {e.notes ? ` · ${e.notes}` : ''}
            </Text>
          </Card>
        ))
      )}

      <DraftModal
        draft={draft}
        projects={projects.data ?? []}
        busy={busy}
        onChange={setDraft}
        onCancel={() => setDraft(null)}
        onSave={save}
      />
    </Screen>
  );
}

function DraftModal({
  draft,
  projects,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Draft | null;
  projects: ProjectRow[];
  busy: boolean;
  onChange: (d: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={!!draft} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={st.modalBackdrop}>
        <View style={st.sheet}>
          <ScrollView contentContainerStyle={{ padding: space(5) }}>
            <Text style={st.sheetTitle}>Review expense</Text>
            {draft?.ocrSource ? (
              <Text style={st.ocrNote}>
                Prefilled from receipt{draft.ocrSource === 'mock' ? ' (simulated OCR — real in cloud)' : ''}.
              </Text>
            ) : (
              <Text style={st.ocrNote}>Couldn’t read the receipt offline — enter the details.</Text>
            )}

            {draft && (
              <>
                <CardLabel>Project</CardLabel>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: space(2) }}>
                  {projects.map((p) => (
                    <Chip
                      key={p.id}
                      label={p.code}
                      active={draft.projectId === p.id}
                      onPress={() => onChange({ ...draft, projectId: p.id })}
                    />
                  ))}
                </ScrollView>

                <CardLabel>Category</CardLabel>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: space(2) }}>
                  {CATEGORIES.map((c) => (
                    <Chip
                      key={c}
                      label={c.replace('_', ' ')}
                      active={draft.category === c}
                      onPress={() => onChange({ ...draft, category: c })}
                    />
                  ))}
                </ScrollView>

                <View style={st.fieldRow}>
                  <View style={{ flex: 1 }}>
                    <CardLabel>Amount</CardLabel>
                    <TextInput
                      value={draft.amount}
                      onChangeText={(amount) => onChange({ ...draft, amount })}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={theme.textFaint}
                      style={st.input}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <CardLabel>Date</CardLabel>
                    <TextInput
                      value={draft.incurredOn}
                      onChangeText={(incurredOn) => onChange({ ...draft, incurredOn })}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={theme.textFaint}
                      style={st.input}
                    />
                  </View>
                </View>

                <CardLabel>Notes</CardLabel>
                <TextInput
                  value={draft.notes}
                  onChangeText={(notes) => onChange({ ...draft, notes })}
                  placeholder="Vendor / what was this for?"
                  placeholderTextColor={theme.textFaint}
                  style={st.input}
                />

                <View style={{ height: space(4) }} />
                <Button label="Save expense" onPress={onSave} loading={busy} />
                <View style={{ height: space(2) }} />
                <Button label="Cancel" variant="ghost" onPress={onCancel} />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[st.chip, active && st.chipActive]}>
      <Text style={[st.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  captureRow: { flexDirection: 'row', gap: space(2), marginBottom: space(4) },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { color: theme.text, fontWeight: '700', fontSize: 16 },
  meta: { color: theme.textMuted, fontSize: 12, marginTop: space(1) },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.bgElevated,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '88%',
  },
  sheetTitle: { color: theme.text, fontSize: 18, fontWeight: '700' },
  ocrNote: { color: theme.textMuted, fontSize: 12, marginTop: space(1), marginBottom: space(3) },
  fieldRow: { flexDirection: 'row', gap: space(3) },
  input: {
    backgroundColor: theme.card,
    borderColor: theme.cardBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    color: theme.text,
    paddingHorizontal: space(3),
    paddingVertical: space(2.5),
    marginTop: space(1.5),
    marginBottom: space(2),
    fontSize: 15,
  },
  chip: {
    backgroundColor: theme.card,
    borderColor: theme.cardBorder,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space(3.5),
    paddingVertical: space(2),
    marginRight: space(2),
  },
  chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  chipText: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
});
