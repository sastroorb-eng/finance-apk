import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar, X } from 'lucide-react-native';
import { isSupabaseConfigured } from '../lib/supabase';
import { createTransaction } from '../services/financeService';
import { colors } from '../theme';
import { toISODate } from '../utils/finance';

const MAX_AMOUNT = 999999999999.99; // fits numeric(14,2)

/**
 * Formats what the user types in Indonesian style: "." groups thousands, "," is the decimal mark.
 * "1500000" -> "1.500.000", "12500,5" -> "12.500,5"
 */
function formatAmountInput(text) {
  const cleaned = text.replace(/[^0-9,]/g, '');
  const [intRaw, ...rest] = cleaned.split(',');
  const intPart = intRaw.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (rest.length === 0) return intPart;
  return `${intPart || '0'},${rest.join('').slice(0, 2)}`;
}

/** "1.500.000,50" -> 1500000.5 (NaN when empty). */
function parseAmountInput(text) {
  if (!text) return NaN;
  return Number(text.replace(/\./g, '').replace(',', '.'));
}

function validate({ amount, categoryId, hasCategories, date, description }) {
  const errors = {};
  if (!Number.isFinite(amount) || amount <= 0) errors.amount = 'Enter an amount greater than 0.';
  else if (amount > MAX_AMOUNT) errors.amount = 'Amount is too large.';
  if (hasCategories && !categoryId) errors.category = 'Choose a category.';
  if (date > new Date()) errors.date = 'Date cannot be in the future.';
  if (description.length > 200) errors.description = 'Max 200 characters.';
  return errors;
}

export default function AddTransactionModal({ visible, userId, categories = [], onClose, onSaved }) {
  const [type, setType] = useState('expense');
  const [amountText, setAmountText] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset the form each time the modal opens.
  useEffect(() => {
    if (!visible) return;
    setType('expense');
    setAmountText('');
    setDescription('');
    setCategoryId(null);
    setDate(new Date());
    setShowPicker(false);
    setErrors({});
    setSubmitError('');
  }, [visible]);

  const filteredCategories = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);

  function changeType(next) {
    if (next === type) return;
    setType(next);
    setCategoryId(null); // a category of the other type is no longer valid
    setErrors((e) => ({ ...e, category: undefined }));
  }

  function onDateChange(event, selected) {
    if (Platform.OS === 'android') setShowPicker(false); // Android shows a dialog that closes itself
    if (event.type === 'set' && selected) {
      setDate(selected);
      setErrors((e) => ({ ...e, date: undefined }));
    }
  }

  async function handleSave() {
    const amount = parseAmountInput(amountText);
    const trimmed = description.trim();
    const found = validate({ amount, categoryId, hasCategories: filteredCategories.length > 0, date, description: trimmed });
    setErrors(found);
    setSubmitError('');
    if (Object.keys(found).length > 0) return;
    if (isSupabaseConfigured && !userId) {
      setSubmitError('Please sign in again to save transactions.');
      return;
    }

    setSaving(true);
    try {
      const saved = await createTransaction({
        userId,
        categoryId,
        amount: Math.round(amount * 100) / 100,
        type,
        date: toISODate(date),
        description: trimmed || null,
      });
      await onSaved?.(saved);
      onClose();
    } catch (e) {
      setSubmitError(e.message || 'Could not save the transaction.');
    } finally {
      setSaving(false);
    }
  }

  const accent = type === 'income' ? colors.income : colors.expense;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={saving ? undefined : onClose} />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>New Transaction</Text>
            <Pressable onPress={onClose} hitSlop={10} disabled={saving}>
              <X size={22} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Type */}
            <View style={styles.segment}>
              {['expense', 'income'].map((t) => {
                const active = type === t;
                const tint = t === 'income' ? colors.income : colors.expense;
                return (
                  <Pressable key={t} onPress={() => changeType(t)} style={[styles.segBtn, active && { backgroundColor: tint }]}>
                    <Text style={[styles.segText, active && styles.segTextActive]}>{t === 'income' ? 'Income' : 'Expense'}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Amount */}
            <Text style={styles.label}>Amount</Text>
            <View style={[styles.amountWrap, errors.amount && styles.inputError]}>
              <Text style={styles.currency}>Rp</Text>
              <TextInput
                style={[styles.amountInput, { color: accent }]}
                placeholder="0"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                value={amountText}
                onChangeText={(t) => {
                  setAmountText(formatAmountInput(t));
                  if (errors.amount) setErrors((e) => ({ ...e, amount: undefined }));
                }}
                maxLength={20}
              />
            </View>
            {errors.amount ? <Text style={styles.fieldError}>{errors.amount}</Text> : null}

            {/* Category */}
            <Text style={styles.label}>Category</Text>
            {filteredCategories.length === 0 ? (
              <Text style={styles.hint}>No {type} categories yet. The transaction will be saved without one.</Text>
            ) : (
              <View style={styles.chips}>
                {filteredCategories.map((c) => {
                  const active = categoryId === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => { setCategoryId(c.id); setErrors((e) => ({ ...e, category: undefined })); }}
                      style={[styles.chip, active && { backgroundColor: accent, borderColor: accent }]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {errors.category ? <Text style={styles.fieldError}>{errors.category}</Text> : null}

            {/* Date */}
            <Text style={styles.label}>Date</Text>
            {Platform.OS === 'ios' ? (
              <View style={styles.iosDateRow}>
                <Calendar size={18} color={colors.muted} />
                <DateTimePicker value={date} mode="date" display="compact" maximumDate={new Date()} onChange={onDateChange} />
              </View>
            ) : (
              <>
                <Pressable style={[styles.input, styles.dateBtn, errors.date && styles.inputError]} onPress={() => setShowPicker(true)}>
                  <Calendar size={18} color={colors.muted} />
                  <Text style={styles.dateText}>
                    {date.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                  </Text>
                </Pressable>
                {showPicker && (
                  <DateTimePicker value={date} mode="date" display="default" maximumDate={new Date()} onChange={onDateChange} />
                )}
              </>
            )}
            {errors.date ? <Text style={styles.fieldError}>{errors.date}</Text> : null}

            {/* Description */}
            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={[styles.input, errors.description && styles.inputError]}
              placeholder="e.g. Lunch with team"
              placeholderTextColor={colors.muted}
              value={description}
              onChangeText={setDescription}
              maxLength={200}
              returnKeyType="done"
            />
            {errors.description ? <Text style={styles.fieldError}>{errors.description}</Text> : null}

            {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

            <View style={styles.actions}>
              <Pressable onPress={onClose} disabled={saving} style={[styles.btn, styles.btnGhost]}>
                <Text style={styles.btnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={saving}
                style={({ pressed }) => [styles.btn, { backgroundColor: accent }, (pressed || saving) && { opacity: 0.75 }]}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Save</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, maxHeight: '90%',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  segment: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 12, padding: 4, marginBottom: 8 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  segText: { fontWeight: '600', color: colors.muted },
  segTextActive: { color: '#fff' },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 12, marginBottom: 6 },
  hint: { fontSize: 13, color: colors.muted },
  amountWrap: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12,
  },
  currency: { fontSize: 18, fontWeight: '700', color: colors.muted, marginRight: 6 },
  amountInput: { flex: 1, fontSize: 24, fontWeight: '700', paddingVertical: 10 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 15, color: colors.text },
  inputError: { borderColor: colors.expense },
  fieldError: { color: colors.expense, fontSize: 12, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { color: colors.text, fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateText: { fontSize: 15, color: colors.text },
  iosDateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  submitError: { color: colors.expense, marginTop: 14, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: colors.bg },
  btnGhostText: { color: colors.text, fontWeight: '600' },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
});
