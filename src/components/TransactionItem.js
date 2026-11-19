import { StyleSheet, Text, View } from 'react-native';
import { TrendingDown, TrendingUp } from 'lucide-react-native';
import { colors } from '../theme';
import { formatCurrency } from '../utils/finance';

export default function TransactionItem({ item }) {
  const isIncome = item.type === 'income';
  const tint = isIncome ? colors.income : colors.expense;
  const Icon = isIncome ? TrendingUp : TrendingDown;

  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: isIncome ? colors.incomeSoft : colors.expenseSoft }]}>
        <Icon size={18} color={tint} />
      </View>
      <View style={styles.middle}>
        <Text style={styles.title} numberOfLines={1}>{item.description || item.category}</Text>
        <Text style={styles.sub}>{item.category} · {item.date}</Text>
      </View>
      <Text style={[styles.amount, { color: tint }]}>
        {isIncome ? '+' : '-'}{formatCurrency(item.amount)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  middle: { flex: 1, marginHorizontal: 12 },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '700' },
});
