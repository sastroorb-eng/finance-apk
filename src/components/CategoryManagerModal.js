import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import { createCategory, deleteCategory, getCategoryUsage, renameCategory } from '../services/financeService';
import { colors } from '../theme';

const MAX_NAME = 50;

function validateName(name) {
  const clean = name.trim();
  if (!clean) return 'Enter a category name.';
  if (clean.length > MAX_NAME) return `Max ${MAX_NAME} characters.`;
  return '';
}

export default function CategoryManagerModal({ visible, userId, categories = [], onClose, onChanged }) {
  const [type, setType] = useState('expense');
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [usage, setUsage] = useState({});
  const [busyId, setBusyId] = useState(null); // 'new' | category id | null
  const [error, setError] = useState('');

  const loadUsage = useCallback(async () => {
    try {
      setUsage(await getCategoryUsage());
    } catch {
      setUsage({});
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setNewName('');
    setEditingId(null);
    setError('');
    loadUsage();
  }, [visible, loadUsage]);

  const list = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);

  async function refresh() {
    await onChanged?.();
    await loadUsage();
  }

  async function handleAdd() {
    const msg = validateName(newName);
    if (msg) return setError(msg);
    setError('');
    setBusyId('new');
    try {
      await createCategory({ userId, name: newName, type });
      setNewName('');
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(cat) {
    setEditingId(cat.id);
    setEditName(cat.name);
    setError('');
  }

  async function handleRename(cat) {
    const msg = validateName(editName);
    if (msg) return setError(msg);
    if (editName.trim() === cat.name) return setEditingId(null);
    setError('');
    setBusyId(cat.id);
    try {
      await renameCategory(cat.id, editName);
      setEditingId(null);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  function confirmDelete(cat) {
    const count = usage[cat.id] || 0;
    const detail = count > 0
      ? `${count} transaction${count === 1 ? '' : 's'} will be kept and marked "Uncategorized".`
      : 'No transactions use this category.';
    Alert.alert(`Delete "${cat.name}"?`, detail, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusyId(cat.id);
          setError('');
          try {
            await deleteCategory(cat.id);
            if (editingId === cat.id) setEditingId(null);
            await refresh();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }

  const accent = type === 'income' ? colors.income : colors.expense;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Manage Categories</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <X size={22} color={colors.muted} />
            </Pressable>
          </View>

          {/* Type toggle */}
          <View style={styles.segment}>
            {['expense', 'income'].map((t) => {
              const isActive = type === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => { setType(t); setEditingId(null); setError(''); }}
                  style={[styles.segBtn, isActive && { backgroundColor: t === 'income' ? colors.income : colors.expense }]}
                >
                  <Text style={[styles.segText, isActive && styles.segTextActive]}>{t === 'income' ? 'Income' : 'Expense'}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Add new */}
          <View style={styles.addRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder={`New ${type} category`}
              placeholderTextColor={colors.muted}
              value={newName}
              onChangeText={(t) => { setNewName(t); if (error) setError(''); }}
              maxLength={MAX_NAME}
              returnKeyType="done"
              onSubmitEditing={handleAdd}
            />
            <Pressable
              onPress={handleAdd}
              disabled={busyId === 'new'}
              style={[styles.addBtn, { backgroundColor: accent }, busyId === 'new' && { opacity: 0.7 }]}
              accessibilityLabel="Add category"
            >
              {busyId === 'new' ? <ActivityIndicator color="#fff" /> : <Plus size={20} color="#fff" />}
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Existing */}
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {list.length === 0 ? (
              <Text style={styles.empty}>No {type} categories yet.</Text>
            ) : (
              list.map((cat, i) => {
                const editing = editingId === cat.id;
                const busy = busyId === cat.id;
                const count = usage[cat.id] || 0;
                return (
                  <View key={cat.id} style={[styles.row, i > 0 && styles.divider]}>
                    <View style={[styles.dot, { backgroundColor: accent }]} />
                    {editing ? (
                      <TextInput
                        style={[styles.input, styles.editInput]}
                        value={editName}
                        onChangeText={setEditName}
                        maxLength={MAX_NAME}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={() => handleRename(cat)}
                      />
                    ) : (
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name} numberOfLines={1}>{cat.name}</Text>
                        <Text style={styles.count}>{count} transaction{count === 1 ? '' : 's'}</Text>
                      </View>
                    )}

                    {busy ? (
                      <ActivityIndicator color={colors.muted} style={styles.iconBtn} />
                    ) : editing ? (
                      <>
                        <Pressable onPress={() => handleRename(cat)} hitSlop={8} style={styles.iconBtn} accessibilityLabel="Save name">
                          <Check size={18} color={colors.income} />
                        </Pressable>
                        <Pressable onPress={() => setEditingId(null)} hitSlop={8} style={styles.iconBtn} accessibilityLabel="Cancel edit">
                          <X size={18} color={colors.muted} />
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Pressable onPress={() => startEdit(cat)} hitSlop={8} style={styles.iconBtn} accessibilityLabel={`Rename ${cat.name}`}>
                          <Pencil size={17} color={colors.muted} />
                        </Pressable>
                        <Pressable onPress={() => confirmDelete(cat)} hitSlop={8} style={styles.iconBtn} accessibilityLabel={`Delete ${cat.name}`}>
                          <Trash2 size={17} color={colors.expense} />
                        </Pressable>
                      </>
                    )}
                  </View>
                );
              })
            )}
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
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, maxHeight: '85%',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  segment: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 12, padding: 4, marginBottom: 12 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  segText: { fontWeight: '600', color: colors.muted },
  segTextActive: { color: '#fff' },
  addRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text },
  addBtn: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.expense, fontSize: 13, marginTop: 8 },
  list: { marginTop: 12 },
  empty: { color: colors.muted, paddingVertical: 16, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, minHeight: 56 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  name: { fontSize: 15, color: colors.text, fontWeight: '500' },
  count: { fontSize: 12, color: colors.muted, marginTop: 2 },
  editInput: { flex: 1, paddingVertical: 6 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
});
