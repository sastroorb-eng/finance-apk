import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, LogOut, Plus, Tags } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SummaryCard from '../components/SummaryCard';
import TransactionItem from '../components/TransactionItem';
import AIReviewCard from '../components/AIReviewCard';
import AddTransactionModal from '../components/AddTransactionModal';
import CategoryManagerModal from '../components/CategoryManagerModal';
import SpendingChart from '../components/SpendingChart';
import TransactionHistoryScreen from './TransactionHistoryScreen';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  getCategories, getLatestInsight, getProfile, getTransactions, getTransactionsForMonth, refreshInsight,
} from '../services/financeService';
import { formatCurrency, getMonthlySummary, toPeriod } from '../utils/finance';
import { card, colors } from '../theme';

export default function DashboardScreen({ session }) {
  const insets = useSafeAreaInsets();
  const userId = session?.user?.id;
  const period = toPeriod();

  const [profile, setProfile] = useState(null);
  const [transactions, setTransactions] = useState([]); // recent, any month
  const [monthTransactions, setMonthTransactions] = useState([]); // all of the current month
  const [categories, setCategories] = useState([]);
  const [insight, setInsight] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [cooldown, setCooldown] = useState(0); // seconds until "Refresh Analysis" is allowed again

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const loadAll = useCallback(async () => {
    setLoadError('');
    try {
      const [p, recent, month, cats, ins] = await Promise.all([
        getProfile(userId), getTransactions({ limit: 10 }), getTransactionsForMonth(period), getCategories(), getLatestInsight(period),
      ]);
      setProfile(p); setTransactions(recent); setMonthTransactions(month); setCategories(cats); setInsight(ins);
    } catch (e) {
      setLoadError(e.message);
    }
  }, [userId, period]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Totals use the full month, not just the recent list.
  const summary = useMemo(() => getMonthlySummary(monthTransactions, period), [monthTransactions, period]);

  async function onPullRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  async function onRefreshAI() {
    setAiLoading(true);
    setAiError('');
    try {
      setInsight(await refreshInsight(period));
      if (isSupabaseConfigured) setCooldown(60);
    } catch (e) {
      // The function sends the last saved insight with its errors, so keep showing it.
      if (e.insight) setInsight(e.insight);
      if (e.retryAfter && ['COOLDOWN', 'DAILY_LIMIT', 'AI_QUOTA'].includes(e.code)) {
        setCooldown(Math.min(e.retryAfter, 3600));
      }
      setAiError(e.message || 'Analysis failed');
    } finally {
      setAiLoading(false);
    }
  }

  const firstName = (profile?.name || 'there').split(' ')[0];
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // History replaces the dashboard view. DashboardScreen itself stays mounted,
  // so its state (including the AI cooldown timer) survives the round trip.
  if (showHistory) {
    return <TransactionHistoryScreen userId={userId} onBack={() => setShowHistory(false)} onDataChanged={loadAll} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 96, paddingHorizontal: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} />}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Hello, {firstName} 👋</Text>
            <Text style={styles.month}>{monthLabel}{!isSupabaseConfigured ? ' · Demo Mode' : ''}</Text>
          </View>
          <Pressable onPress={() => setShowCategories(true)} hitSlop={10} style={styles.iconBtn} accessibilityLabel="Manage categories">
            <Tags size={18} color={colors.muted} />
          </Pressable>
          {isSupabaseConfigured && (
            <Pressable onPress={() => supabase.auth.signOut()} hitSlop={10} style={[styles.iconBtn, { marginLeft: 8 }]} accessibilityLabel="Sign out">
              <LogOut size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {/* Balance */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Net Balance this month</Text>
          <Text style={styles.balance} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(summary.net)}</Text>
          <View style={styles.savingsPill}>
            <Text style={styles.savingsText}>Savings rate: {summary.savingsRate}%</Text>
          </View>
        </View>

        {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <SummaryCard type="income" amount={summary.income} />
          <SummaryCard type="expense" amount={summary.expenses} />
        </View>

        {/* AI review */}
        <AIReviewCard insight={insight} loading={aiLoading} error={aiError} cooldown={cooldown} onRefresh={onRefreshAI} />

        {/* Category breakdown */}
        <SpendingChart transactions={monthTransactions} period={period} />

        {/* Recent transactions */}
        <View style={[styles.listCard]}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            <Pressable onPress={() => setShowHistory(true)} hitSlop={10} style={styles.seeAll} accessibilityLabel="See all transactions">
              <Text style={styles.seeAllText}>See all</Text>
              <ChevronRight size={16} color={colors.primary} />
            </Pressable>
          </View>
          {transactions.length === 0 ? (
            <Text style={styles.empty}>No transactions yet. Tap + to add one.</Text>
          ) : (
            transactions.map((t, i) => (
              <View key={t.id} style={i > 0 && styles.divider}>
                <TransactionItem item={t} />
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => setShowAdd(true)}
        accessibilityLabel="Add transaction"
      >
        <Plus size={26} color="#fff" />
      </Pressable>

      <AddTransactionModal
        visible={showAdd}
        userId={userId}
        categories={categories}
        onClose={() => setShowAdd(false)}
        onSaved={loadAll}
      />

      <CategoryManagerModal
        visible={showCategories}
        userId={userId}
        categories={categories}
        onClose={() => setShowCategories(false)}
        onChanged={loadAll}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  greeting: { fontSize: 22, fontWeight: '800', color: colors.text },
  month: { color: colors.muted, marginTop: 2 },
  iconBtn: { backgroundColor: colors.card, padding: 10, borderRadius: 12 },
  balanceCard: { backgroundColor: colors.primary, borderRadius: 20, padding: 20, marginBottom: 16 },
  balanceLabel: { color: '#C7D2FE', fontSize: 13 },
  balance: { color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 6 },
  savingsPill: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, marginTop: 12 },
  savingsText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  listCard: { ...card, marginTop: 16, paddingVertical: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  empty: { color: colors.muted, paddingVertical: 16 },
  error: { color: colors.expense, marginBottom: 12 },
  fab: {
    position: 'absolute', right: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', elevation: 6,
    shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 6 },
  },
});
