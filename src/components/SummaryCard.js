import { StyleSheet, Text, View } from 'react-native';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { card, colors } from '../theme';
import { formatCurrency } from '../utils/finance';

export default function SummaryCard({ type, amount }) {
  const isIncome = type === 'income';
  const Icon = isIncome ? ArrowDownLeft : ArrowUpRight;
  const tint = isIncome ? colors.income : colors.expense;
  const soft = isIncome ? colors.incomeSoft : colors.expenseSoft;

  return (
    <View style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: soft }]}>
        <Icon size={18} color={tint} />
      </View>
      <Text style={styles.label}>{isIncome ? 'Total Income' : 'Total Expenses'}</Text>
      <Text style={[styles.amount, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit>
        {formatCurrency(amount)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...card, flex: 1 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  label: { color: colors.muted, fontSize: 13 },
  amount: { fontSize: 18, fontWeight: '700', marginTop: 4 },
});
