import * as React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, space, theme } from '@/lib/theme';

export function Screen({
  title,
  subtitle,
  children,
  scroll = true,
  refreshing,
  onRefresh,
}: {
  title?: string | undefined;
  subtitle?: string | undefined;
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean | undefined;
  onRefresh?: (() => void) | undefined;
}) {
  const header = title ? (
    <View style={{ marginBottom: space(4) }}>
      <Text style={s.h1}>{title}</Text>
      {subtitle ? <Text style={s.sub}>{subtitle}</Text> : null}
    </View>
  ) : null;
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={
            onRefresh ? (
              <RefreshSpinner refreshing={!!refreshing} onRefresh={onRefresh} />
            ) : undefined
          }
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={s.content}>
          {header}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

// RefreshControl wrapper kept separate so Screen stays simple.
import { RefreshControl } from 'react-native';
function RefreshSpinner({ refreshing, onRefresh }: { refreshing: boolean; onRefresh: () => void }) {
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textMuted} />;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function CardLabel({ children }: { children: React.ReactNode }) {
  return <Text style={s.cardLabel}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
}) {
  const bg = variant === 'primary' ? theme.primary : 'transparent';
  const border = variant === 'outline' ? theme.cardBorder : 'transparent';
  const color = variant === 'primary' ? '#fff' : theme.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[s.btnText, { color }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Pill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const map = {
    neutral: { bg: theme.bgElevated, fg: theme.textMuted },
    success: { bg: theme.successDim, fg: theme.success },
    warning: { bg: theme.warningDim, fg: theme.warning },
    danger: { bg: theme.dangerDim, fg: theme.danger },
    info: { bg: theme.primaryDim, fg: theme.primary },
  }[tone];
  return (
    <View style={[s.pill, { backgroundColor: map.bg }]}>
      <Text style={[s.pillText, { color: map.fg }]}>{label}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ paddingVertical: space(10), alignItems: 'center' }}>
      <ActivityIndicator color={theme.primary} />
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return <Text style={s.empty}>{text}</Text>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  content: { padding: space(5), paddingBottom: space(16) },
  h1: { fontSize: 26, fontWeight: '700', color: theme.text, letterSpacing: -0.5 },
  sub: { fontSize: 13, color: theme.textMuted, marginTop: space(1) },
  card: {
    backgroundColor: theme.card,
    borderColor: theme.cardBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space(4),
    marginBottom: space(3),
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: theme.textMuted,
  },
  btn: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(5),
  },
  btnText: { fontSize: 15, fontWeight: '600' },
  pill: { paddingHorizontal: space(2.5), paddingVertical: space(1), borderRadius: radius.pill, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '600' },
  empty: { color: theme.textFaint, fontSize: 14, textAlign: 'center', paddingVertical: space(8) },
});
