import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>CES Tech</Text>
        <Text style={styles.title}>Internal Operations</Text>
        <Text style={styles.body}>
          Tasks, attendance, travel, expenses, and DA — for field engineers and approving managers.
        </Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Phase 0 — Foundations</Text>
          <Text style={styles.cardBody}>
            Scaffold ready. Next: Microsoft sign-in (MSAL), geofenced attendance check-in, and
            offline-tolerant receipt capture.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  eyebrow: { fontSize: 12, letterSpacing: 1.5, color: '#71717A', textTransform: 'uppercase' },
  title: { fontSize: 32, fontWeight: '600', marginTop: 4, color: '#0F172A' },
  body: { fontSize: 14, color: '#52525B', marginTop: 12, lineHeight: 20 },
  card: {
    marginTop: 24,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  cardBody: { fontSize: 13, color: '#52525B', marginTop: 4, lineHeight: 18 },
});
