import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, BackHandler, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { ArrowLeft, ChevronLeft, ChevronRight, Search, Tags, Trash2, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import TransactionItem from '../components/TransactionItem';
import CategoryManagerModal from '../components/CategoryManagerModal';
import { deleteTransaction, getCategories, getTransactionsForMonth } from '../services/financeService';
import { formatCurrency, getMonthlySummary, toPeriod } from '../utils/finance';
import { card, colors } from '../theme';

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'income', label: 'Income' },
  { key: 'expense', label: 'Expense' },
];

function shiftPeriod(period, delta) {
  const [y, m] = period.split('-').map(Number);
  return toPeriod(new Date(y, m - 1 + delta, 1));
}

function monthLabel(period) {
  return new Date(`${period}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function dayLabel(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Groups a newest-first list into [{ date, items, net }], one entry per day. */
function groupByDay(list) {
  const groups = [];
  for (const t of list) {
    let g = groups[groups.length - 1];
    if (!g || g.date !== t.date) {
      g = { date: t.date, items: [], net: 0 };
      groups.push(g);
    }
    g.items.push(t);
    g.net += t.type === 'income' ? t.amount : -t.amount;
  }
  return groups;
}

export default function TransactionHistoryScreen({ userId, onBack, onDataChanged }) {
  const insets = useSafeAreaInsets();
  const currentPeriod = toPeriod();

  const [period, setPeriod] = useState(currentPeriod);
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryId, setCategoryId] = useState(null); // null = all, 'none' = uncategorized
  const [query, setQuery] = useState('');

  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [showCategories, setShowCategories] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [txs, cats] = await Promise.all([getTransactionsForMonth(period), getCategories()]);
      setTransactions(txs);
      setCategories(cats);
    } catch (e) {
      setError(e.message || 'Could not load transactions.');
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Android hardware back button returns to the dashboard instead of closing the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack?.();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  async function onPullRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // Changing the type clears a category of the other type.
  function changeType(next) {
    setTypeFilter(next);
    if (next !== 'all' && categoryId && categoryId !== 'none') {
      const cat = categories.find((c) => c.id === categoryId);
      if (cat && cat.type !== next) setCategoryId(null);
    }
  }

  const categoryOptions = useMemo(
    () => (typeFilter === 'all' ? categories : categories.filter((c) => c.type === typeFilter)),
    [categories, typeFilter],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (categoryId === 'none' && t.category_id) return false;
      if (categoryId && categoryId !== 'none' && t.category_id !== categoryId) return false;
      if (q && !(t.description || '').toLowerCase().includes(q) && !(t.category || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [transactions, typeFilter, categoryId, query]);

  const summary = useMemo(() => getMonthlySummary(filtered, period), [filtered, period]);
  const groups = useMemo(() => groupByDay(filtered), [filtered]);
  const hasFilters = typeFilter !== 'all' || categoryId !== null || query.trim() !== '';

  function confirmDelete(tx) {
    Alert.alert(
      'Delete transaction?',
      `${tx.description || tx.category} · ${tx.type === 'income' ? '+' : '-'}${formatCurrency(tx.amount)}\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(tx.id);
            try {
              await deleteTransaction(tx.id);
              // Remove locally right away, then sync with the server and tell the Dashboard.
              setTransactions((list) => list.filter((t) => t.id !== tx.id));
              await Promise.all([load(), onDataChanged?.()]);
            } catch (e) {
              Alert.alert('Could not delete', e.message || 'Please try again.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  }

  async function onCategoriesChanged() {
    await Promise.all([load(), onDataChanged?.()]);
  }

  // If the selected category was deleted, fall back to "all".
  useEffect(() => {
    if (categoryId && categoryId !== 'none' && !categories.some((c) => c.id === categoryId)) setCategoryId(null);
  }, [categories, categoryId]);

  const isCurrentMonth = period >= currentPeriod;

  const header = (
    <View>
      {/* Month switcher */}
      <View style={styles.monthRow}>
        <Pressable onPress={() => setPeriod((p) => shiftPeriod(p, -1))} hitSlop={10} style={styles.monthBtn} accessibilityLabel="Previous month">
          <ChevronLeft size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.monthText}>{monthLabel(period)}</Text>
        <Pressable
          onPress={() => setPeriod((p) => shiftPeriod(p, 1))}
          disabled={isCurrentMonth}
          hitSlop={10}
          style={[styles.monthBtn, isCurrentMonth && { opacity: 0.3 }]}
          accessibilityLabel="Next month"
        >
          <ChevronRight size={20} color={colors.text} />
        </Pressable>
      </View>

      {/* Totals for what is currently shown */}
      <View style={styles.totalsRow}>
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Income</Text>
          <Text style={[styles.totalValue, { color: colors.income }]} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(summary.income)}</Text>
        </View>
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Expenses</Text>
          <Text style={[styles.totalValue, { color: colors.expense }]} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(summary.expenses)}</Text>
        </View>
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Net</Text>
          <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(summary.net)}</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Search size={18} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search description or category"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCorrect={false}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
            <X size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {/* Type filter */}
      <View style={styles.segment}>
        {TYPE_FILTERS.map((f) => {
          const isActive = typeFilter === f.key;
          const tint = f.key === 'income' ? colors.income : f.key === 'expense' ? colors.expense : colors.primary;
          return (
            <Pressable key={f.key} onPress={() => changeType(f.key)} style={[styles.segBtn, isActive && { backgroundColor: tint }]}>
              <Text style={[styles.segText, isActive && styles.segTextActive]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Pressable onPress={() => setCategoryId(null)} style={[styles.chip, categoryId === null && styles.chipActive]}>
          <Text style={[styles.chipText, categoryId === null && styles.chipTextActive]}>All categories</Text>
        </Pressable>
        {categoryOptions.map((c) => {
          const isActive = categoryId === c.id;
          return (
            <Pressable key={c.id} onPress={() => setCategoryId(isActive ? null : c.id)} style={[styles.chip, isActive && styles.chipActive]}>
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{c.name}</Text>
            </Pressable>
          );
        })}
        <Pressable onPress={() => setCategoryId(categoryId === 'none' ? null : 'none')} style={[styles.chip, categoryId === 'none' && styles.chipActive]}>
          <Text style={[styles.chipText, categoryId === 'none' && styles.chipTextActive]}>Uncategorized</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.resultRow}>
        <Text style={styles.resultText}>
          {filtered.length} transaction{filtered.length === 1 ? '' : 's'}
        </Text>
        {hasFilters ? (
          <Pressable onPress={() => { setTypeFilter('all'); setCategoryId(null); setQuery(''); }} hitSlop={8}>
            <Text style={styles.clearText}>Clear filters</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.topBtn} accessibilityLabel="Back">
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>Transactions</Text>
        <Pressable onPress={() => setShowCategories(true)} hitSlop={10} style={styles.topBtn} accessibilityLabel="Manage categories">
          <Tags size={19} color={colors.text} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.date}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} />}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {hasFilters ? 'No transactions match these filters.' : `No transactions in ${monthLabel(period)}.`}
            </Text>
          }
          renderItem={({ item: group }) => (
            <View style={styles.groupCard}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupDate}>{dayLabel(group.date)}</Text>
                <Text style={styles.groupNet}>
                  {group.net >= 0 ? '+' : '-'}{formatCurrency(Math.abs(group.net))}
                </Text>
              </View>
              {group.items.map((t, i) => (
                <View key={t.id} style={[styles.txRow, i > 0 && styles.divider]}>
                  <View style={{ flex: 1 }}>
                    <TransactionItem item={t} />
                  </View>
                  {deletingId === t.id ? (
                    <ActivityIndicator color={colors.muted} style={styles.deleteBtn} />
                  ) : (
                    <Pressable
                      onPress={() => confirmDelete(t)}
                      hitSlop={8}
                      style={styles.deleteBtn}
                      accessibilityLabel={`Delete ${t.description || t.category}`}
                    >
                      <Trash2 size={17} color={colors.muted} />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
        />
      )}

      <CategoryManagerModal
        visible={showCategories}
        userId={userId}
        categories={categories}
        onClose={() => setShowCategories(false)}
        onChanged={onCategoriesChanged}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10, backgroundColor: colors.bg,
  },
  topBtn: { backgroundColor: colors.card, padding: 10, borderRadius: 12 },
  topTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 12 },
  monthBtn: { backgroundColor: colors.card, padding: 8, borderRadius: 10 },
  monthText: { fontSize: 16, fontWeight: '700', color: colors.text },
  totalsRow: { ...card, flexDirection: 'row', paddingVertical: 12, marginBottom: 12 },
  totalBox: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  totalLabel: { fontSize: 12, color: colors.muted },
  totalValue: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 2 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, marginBottom: 10,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, color: colors.text },
  segment: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12, padding: 4, marginBottom: 10 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  segText: { fontWeight: '600', color: colors.muted },
  segTextActive: { color: '#fff' },
  chips: { gap: 8, paddingBottom: 4 },
  chip: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 8 },
  resultText: { fontSize: 13, color: colors.muted },
  clearText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  error: { color: colors.expense, marginBottom: 8 },
  empty: { color: colors.muted, textAlign: 'center', paddingVertical: 32 },
  groupCard: { ...card, paddingVertical: 8, marginBottom: 12 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, paddingBottom: 2 },
  groupDate: { fontSize: 13, fontWeight: '700', color: colors.muted },
  groupNet: { fontSize: 13, fontWeight: '600', color: colors.muted },
  txRow: { flexDirection: 'row', alignItems: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  deleteBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
});
