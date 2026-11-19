// Pure calculation helpers — no React / Supabase dependencies, easy to unit test.
// A transaction looks like: { amount: number, type: 'income' | 'expense', date: 'YYYY-MM-DD', ... }

/** 'YYYY-MM' for a Date (local time). */
export function toPeriod(date = new Date()) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${m}`;
}

/** 'YYYY-MM-DD' for a Date in local time (toISOString() would shift to UTC and can change the day). */
export function toISODate(date = new Date()) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Keep only transactions whose date falls in the given 'YYYY-MM' period. */
export function filterByMonth(transactions, period = toPeriod()) {
  return transactions.filter((t) => String(t.date).startsWith(period));
}

function sumByType(transactions, type, period) {
  return filterByMonth(transactions, period)
    .filter((t) => t.type === type)
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
}

/** Monthly total income. */
export function getMonthlyIncome(transactions, period = toPeriod()) {
  return sumByType(transactions, 'income', period);
}

/** Monthly total expenses. */
export function getMonthlyExpenses(transactions, period = toPeriod()) {
  return sumByType(transactions, 'expense', period);
}

/** Net balance = income - expenses for the month. */
export function getNetBalance(transactions, period = toPeriod()) {
  return getMonthlyIncome(transactions, period) - getMonthlyExpenses(transactions, period);
}

/** Savings rate % = net / income * 100, rounded to 1 decimal. 0 when there is no income. */
export function getSavingsRate(transactions, period = toPeriod()) {
  const income = getMonthlyIncome(transactions, period);
  if (income <= 0) return 0;
  const rate = ((income - getMonthlyExpenses(transactions, period)) / income) * 100;
  return Math.round(rate * 10) / 10;
}

/** All four numbers at once (single pass over the month). */
export function getMonthlySummary(transactions, period = toPeriod()) {
  let income = 0;
  let expenses = 0;
  for (const t of filterByMonth(transactions, period)) {
    if (t.type === 'income') income += Number(t.amount || 0);
    else if (t.type === 'expense') expenses += Number(t.amount || 0);
  }
  const net = income - expenses;
  const savingsRate = income > 0 ? Math.round((net / income) * 1000) / 10 : 0;
  return { income, expenses, net, savingsRate };
}

/** Currency formatter. Change locale/currency to your needs (e.g. 'id-ID' / 'IDR'). */
export function formatCurrency(value, locale = 'id-ID', currency = 'IDR') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
