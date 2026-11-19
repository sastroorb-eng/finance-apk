export const colors = {
  bg: '#F4F6FA',
  card: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  primary: '#4F46E5',
  primarySoft: '#EEF2FF',
  income: '#16A34A',
  incomeSoft: '#DCFCE7',
  expense: '#DC2626',
  expenseSoft: '#FEE2E2',
  warning: '#D97706',
};

// Categorical chart palette: a fixed order, checked for color-blind separation on a white surface.
// Assign by a category's spending rank in the chart; anything past slot 7 folds into "Other" (gray).
export const chartPalette = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6'];
export const chartOther = '#94A3B8';

export const card = {
  backgroundColor: colors.card,
  borderRadius: 16,
  padding: 16,
  shadowColor: '#0F172A',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};
