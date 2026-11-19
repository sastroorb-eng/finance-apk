import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Rect } from 'react-native-svg';
import { chartOther, chartPalette, card, colors } from '../theme';
import { formatCurrency, toPeriod } from '../utils/finance';

const BAR_HEIGHT = 14;
const GAP = 2; // white gap between segments so neighbours stay distinct

/**
 * Groups one month's expenses by category, largest first. Categories past the palette size
 * fold into a single "Other" slice so no colour is ever reused or generated.
 */
export function buildCategoryBreakdown(transactions, period = toPeriod()) {
  const totals = new Map();
  for (const t of transactions) {
    if (t.type !== 'expense' || !String(t.date).startsWith(period)) continue;
    const name = t.category || 'Uncategorized';
    totals.set(name, (totals.get(name) || 0) + Number(t.amount || 0));
  }
  const sorted = [...totals.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  const total = sorted.reduce((s, c) => s + c.amount, 0);

  let slices = sorted;
  if (sorted.length > chartPalette.length) {
    const keep = sorted.slice(0, chartPalette.length - 1);
    const rest = sorted.slice(chartPalette.length - 1);
    slices = [...keep, { name: `Other (${rest.length})`, amount: rest.reduce((s, c) => s + c.amount, 0), isOther: true }];
  }

  return {
    total,
    slices: slices.map((s, i) => ({
      ...s,
      color: s.isOther ? chartOther : chartPalette[i],
      share: total > 0 ? s.amount / total : 0,
    })),
  };
}

function formatShare(share) {
  const pct = share * 100;
  if (pct > 0 && pct < 1) return '<1%';
  return `${Math.round(pct)}%`;
}

export default function SpendingChart({ transactions = [], period = toPeriod(), title = 'Spending by Category' }) {
  const { total, slices } = useMemo(() => buildCategoryBreakdown(transactions, period), [transactions, period]);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState(null);

  const active = slices.find((s) => s.name === selected) || null;
  const monthLabel = new Date(`${period}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Segment geometry: widths proportional to amount, with GAP px removed between neighbours.
  const segments = [];
  if (width > 0 && total > 0) {
    const usable = width - GAP * (slices.length - 1);
    let x = 0;
    for (const s of slices) {
      const w = Math.max(1, s.share * usable);
      segments.push({ ...s, x, w });
      x += w + GAP;
    }
  }

  const a11ySummary = slices.map((s) => `${s.name} ${formatShare(s.share)}`).join(', ');

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.month}>{monthLabel}</Text>
      </View>

      {total === 0 ? (
        <Text style={styles.empty}>No expenses recorded for this month yet.</Text>
      ) : (
        <>
          <Text style={styles.totalLabel}>{active ? active.name : 'Total spent'}</Text>
          <Text style={styles.total}>
            {formatCurrency(active ? active.amount : total)}
            {active ? <Text style={styles.totalShare}>  ·  {formatShare(active.share)}</Text> : null}
          </Text>

          {/* Segmented bar */}
          <View
            style={styles.barWrap}
            onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Spending split: ${a11ySummary}`}
          >
            {width > 0 && (
              <Svg width={width} height={BAR_HEIGHT}>
                <Defs>
                  <ClipPath id="bar-clip">
                    <Rect x={0} y={0} width={width} height={BAR_HEIGHT} rx={BAR_HEIGHT / 2} />
                  </ClipPath>
                </Defs>
                <G clipPath="url(#bar-clip)">
                  {segments.map((s) => (
                    <Rect
                      key={s.name}
                      x={s.x}
                      y={0}
                      width={s.w}
                      height={BAR_HEIGHT}
                      fill={s.color}
                      opacity={active && active.name !== s.name ? 0.3 : 1}
                      onPress={() => setSelected((cur) => (cur === s.name ? null : s.name))}
                    />
                  ))}
                </G>
              </Svg>
            )}
          </View>

          {/* Legend: name, amount, share */}
          <View style={styles.legend}>
            {slices.map((s) => {
              const isActive = active?.name === s.name;
              const dimmed = active && !isActive;
              return (
                <Pressable
                  key={s.name}
                  onPress={() => setSelected((cur) => (cur === s.name ? null : s.name))}
                  style={[styles.row, isActive && styles.rowActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${s.name}, ${formatCurrency(s.amount)}, ${formatShare(s.share)} of spending`}
                >
                  <View style={[styles.swatch, { backgroundColor: s.color }, dimmed && styles.dim]} />
                  <Text style={[styles.name, dimmed && styles.dim]} numberOfLines={1}>{s.name}</Text>
                  <Text style={[styles.amount, dimmed && styles.dim]}>{formatCurrency(s.amount)}</Text>
                  <Text style={[styles.share, dimmed && styles.dim]}>{formatShare(s.share)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>Tap a category to highlight it.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...card, marginTop: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  month: { fontSize: 12, color: colors.muted },
  empty: { color: colors.muted, paddingVertical: 8 },
  totalLabel: { fontSize: 12, color: colors.muted },
  total: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 2 },
  totalShare: { fontSize: 15, fontWeight: '600', color: colors.muted },
  barWrap: { height: BAR_HEIGHT, marginTop: 12, marginBottom: 8 },
  legend: { marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 6, borderRadius: 10 },
  rowActive: { backgroundColor: colors.bg },
  swatch: { width: 12, height: 12, borderRadius: 3, marginRight: 10 },
  name: { flex: 1, fontSize: 14, color: colors.text },
  amount: { fontSize: 14, fontWeight: '600', color: colors.text, marginLeft: 8 },
  share: { width: 44, textAlign: 'right', fontSize: 13, color: colors.muted },
  dim: { opacity: 0.4 },
  hint: { fontSize: 11, color: colors.muted, marginTop: 6, textAlign: 'center' },
});
