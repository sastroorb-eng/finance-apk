import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { RefreshCw, Sparkles } from 'lucide-react-native';
import { card, colors } from '../theme';

function scoreColor(score) {
  if (score >= 80) return colors.income;
  if (score >= 60) return colors.primary;
  if (score >= 40) return colors.warning;
  return colors.expense;
}

function formatWait(s) {
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  return m < 60 ? `${m}m` : `${Math.ceil(m / 60)}h`;
}

export default function AIReviewCard({ insight, loading, error, cooldown = 0, onRefresh }) {
  const tint = insight ? scoreColor(insight.spending_score) : colors.muted;
  const disabled = loading || cooldown > 0;
  const label = loading ? 'Analyzing…' : cooldown > 0 ? `Refresh in ${formatWait(cooldown)}` : 'Refresh Analysis';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Sparkles size={18} color={colors.primary} />
          <Text style={styles.title}>AI Financial Review</Text>
        </View>
        {insight && (
          <View style={[styles.badge, { borderColor: tint }]}>
            <Text style={[styles.score, { color: tint }]}>{insight.spending_score}</Text>
            <Text style={styles.outOf}>/100</Text>
          </View>
        )}
      </View>

      {insight ? (
        <>
          <Text style={styles.analysis}>{insight.analysis}</Text>
          {insight.tips?.map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <Text style={styles.tipNum}>{i + 1}</Text>
              <Text style={styles.tip}>{tip}</Text>
            </View>
          ))}
        </>
      ) : (
        <Text style={styles.analysis}>No analysis yet for this month. Tap below to generate one.</Text>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        onPress={onRefresh}
        disabled={disabled}
        style={({ pressed }) => [styles.button, (pressed || disabled) && { opacity: 0.6 }]}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <RefreshCw size={16} color="#fff" />}
        <Text style={styles.buttonText}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...card },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  badge: { flexDirection: 'row', alignItems: 'baseline', borderWidth: 2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  score: { fontSize: 18, fontWeight: '800' },
  outOf: { fontSize: 11, color: colors.muted, marginLeft: 1 },
  analysis: { color: colors.text, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  tipRow: { flexDirection: 'row', marginBottom: 8 },
  tipNum: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primarySoft, color: colors.primary,
    textAlign: 'center', lineHeight: 22, fontSize: 12, fontWeight: '700', marginRight: 10, overflow: 'hidden',
  },
  tip: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  error: { color: colors.expense, fontSize: 12, marginBottom: 8 },
  button: {
    marginTop: 6, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
