// Sample data used in Demo Mode (no Supabase configured). Covers the current and previous month.
import { toISODate, toPeriod } from '../utils/finance';

const now = new Date();
const p = toPeriod(now);
const prev = toPeriod(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const today = now.getDate();
// Clamp to today so no sample transaction lands in the future.
const d = (day) => `${p}-${String(Math.min(day, today)).padStart(2, '0')}`;
const pd = (day) => `${prev}-${String(day).padStart(2, '0')}`;

export const demoUser = { name: 'Demo User', email: 'demo@example.com' };

export const demoCategories = [
  { id: 'c-salary', name: 'Salary', type: 'income' },
  { id: 'c-freelance', name: 'Freelance', type: 'income' },
  { id: 'c-bonus', name: 'Bonus', type: 'income' },
  { id: 'c-other-in', name: 'Other Income', type: 'income' },
  { id: 'c-food', name: 'Food & Drinks', type: 'expense' },
  { id: 'c-transport', name: 'Transport', type: 'expense' },
  { id: 'c-bills', name: 'Bills', type: 'expense' },
  { id: 'c-shopping', name: 'Shopping', type: 'expense' },
  { id: 'c-fun', name: 'Entertainment', type: 'expense' },
  { id: 'c-health', name: 'Health', type: 'expense' },
  { id: 'c-edu', name: 'Education', type: 'expense' },
  { id: 'c-other-ex', name: 'Other Expense', type: 'expense' },
];

const catName = Object.fromEntries(demoCategories.map((c) => [c.id, c.name]));
const tx = (id, type, amount, date, description, category_id) => ({
  id, type, amount, date, description, category_id, category: catName[category_id],
});

export const demoTransactions = [
  // current month
  tx('1', 'income', 8500000, d(1), 'Monthly salary', 'c-salary'),
  tx('2', 'expense', 1500000, d(2), 'Rent & electricity', 'c-bills'),
  tx('3', 'expense', 85000, d(3), 'Coffee & breakfast', 'c-food'),
  tx('4', 'income', 1200000, d(5), 'Logo design project', 'c-freelance'),
  tx('5', 'expense', 350000, d(6), 'Fuel & parking', 'c-transport'),
  tx('6', 'expense', 620000, d(8), 'New sneakers', 'c-shopping'),
  tx('7', 'expense', 150000, d(9), 'Streaming subscriptions', 'c-fun'),
  tx('8', 'expense', 240000, d(10), 'Groceries', 'c-food'),
  tx('9', 'expense', 175000, d(12), 'Pharmacy', 'c-health'),
  tx('10', 'expense', 60000, d(13), 'Online ride', 'c-transport'),
  // previous month
  tx('11', 'income', 8500000, pd(1), 'Monthly salary', 'c-salary'),
  tx('12', 'expense', 1500000, pd(2), 'Rent & electricity', 'c-bills'),
  tx('13', 'expense', 450000, pd(7), 'Online course', 'c-edu'),
  tx('14', 'expense', 320000, pd(11), 'Groceries', 'c-food'),
  tx('15', 'expense', 900000, pd(18), 'Concert tickets', 'c-fun'),
  tx('16', 'expense', 280000, pd(24), 'Fuel & parking', 'c-transport'),
].sort((a, b) => b.date.localeCompare(a.date));

export const demoInsight = {
  spending_score: 78,
  analysis:
    'You saved about 65% of your income this month, which is excellent. Most spending went to Bills, followed by Shopping and Food & Drinks.',
  tips: [
    'Move a fixed 20% of salary to savings on payday, before spending.',
    'Cap Shopping at Rp400.000 next month — the sneakers pushed it over.',
    'Review streaming subscriptions and cancel one you rarely use.',
  ],
};

export const demoGeneratedAt = toISODate(now);
