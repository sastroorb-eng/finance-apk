// Data-access layer: the UI only talks to these functions, never to Supabase directly.
// In Demo Mode (no .env) everything runs against an in-memory copy of the sample data,
// so add / delete / category changes work for the rest of the session.
import { parseFunctionError, supabase, isSupabaseConfigured } from '../lib/supabase';
import { demoCategories, demoInsight, demoTransactions, demoUser } from '../data/demoData';
import { toISODate } from '../utils/finance';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Demo Mode store ----------
let demoTxStore = demoTransactions.map((t) => ({ ...t }));
let demoCatStore = demoCategories.map((c) => ({ ...c }));
const newId = () => `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const sortTx = (list) => [...list].sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
const sortCats = (list) => [...list].sort((a, b) => a.name.localeCompare(b.name));

function normalizeTx(t) {
  return {
    id: t.id,
    amount: Number(t.amount),
    type: t.type,
    date: t.date,
    description: t.description,
    category_id: t.category_id ?? null,
    category: t.categories?.name ?? 'Uncategorized',
  };
}

/** Turns Postgres error codes into messages a user can act on. */
function friendlyDbError(error) {
  if (error?.code === '23505') return new Error('A category with that name already exists.');
  if (error?.code === '23514') return new Error(error.message || 'Invalid value.');
  return error instanceof Error ? error : new Error(error?.message || 'Database error');
}

// ---------- Profile ----------
export async function getProfile(userId) {
  if (!isSupabaseConfigured) return demoUser;
  const { data, error } = await supabase.from('users').select('name, email').eq('id', userId).single();
  if (error) throw error;
  return data;
}

// ---------- Transactions ----------
export async function getTransactions({ limit = 50 } = {}) {
  if (!isSupabaseConfigured) return sortTx(demoTxStore).slice(0, limit);
  const { data, error } = await supabase
    .from('transactions')
    .select('id, amount, type, date, description, category_id, categories(name)')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map(normalizeTx);
}

/** All of one month's transactions ('YYYY-MM'), newest first. Uses idx_transactions_user_date. */
export async function getTransactionsForMonth(period) {
  const [y, m] = period.split('-').map(Number);
  const start = `${period}-01`;
  const end = toISODate(new Date(y, m, 1)); // first day of the next month (local)
  if (!isSupabaseConfigured) return sortTx(demoTxStore.filter((t) => t.date >= start && t.date < end));
  const { data, error } = await supabase
    .from('transactions')
    .select('id, amount, type, date, description, category_id, categories(name)')
    .gte('date', start)
    .lt('date', end)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(normalizeTx);
}

/** Inserts a transaction. Returns the normalized row. */
export async function createTransaction({ userId, amount, type, categoryId, description, date }) {
  if (!isSupabaseConfigured) {
    const cat = demoCatStore.find((c) => c.id === categoryId);
    const row = { id: newId(), amount, type, date, description, category_id: categoryId ?? null, category: cat?.name ?? 'Uncategorized' };
    demoTxStore = [row, ...demoTxStore];
    return row;
  }
  const { data, error } = await supabase
    .from('transactions')
    .insert({ user_id: userId, category_id: categoryId ?? null, amount, type, date, description: description || null })
    .select('id, amount, type, date, description, category_id, categories(name)')
    .single();
  if (error) throw friendlyDbError(error);
  return normalizeTx(data);
}

export async function deleteTransaction(id) {
  if (!isSupabaseConfigured) {
    demoTxStore = demoTxStore.filter((t) => t.id !== id);
    return;
  }
  // .select() makes PostgREST return the deleted row, so "0 rows" (already gone / RLS) is detectable.
  const { data, error } = await supabase.from('transactions').delete().eq('id', id).select('id');
  if (error) throw friendlyDbError(error);
  if (!data?.length) throw new Error('Transaction not found. It may already have been deleted.');
}

// ---------- Categories ----------
export async function getCategories() {
  if (!isSupabaseConfigured) return sortCats(demoCatStore);
  const { data, error } = await supabase.from('categories').select('id, name, type').order('name');
  if (error) throw error;
  return data;
}

/** Number of transactions per category id: { [categoryId]: count }. */
export async function getCategoryUsage() {
  if (!isSupabaseConfigured) {
    return demoTxStore.reduce((acc, t) => {
      if (t.category_id) acc[t.category_id] = (acc[t.category_id] || 0) + 1;
      return acc;
    }, {});
  }
  const { data, error } = await supabase.from('categories').select('id, transactions(count)');
  if (error) throw error;
  return Object.fromEntries(data.map((c) => [c.id, c.transactions?.[0]?.count ?? 0]));
}

export async function createCategory({ userId, name, type }) {
  const clean = name.trim();
  if (!isSupabaseConfigured) {
    if (demoCatStore.some((c) => c.type === type && c.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error('A category with that name already exists.');
    }
    const row = { id: newId(), name: clean, type };
    demoCatStore = [...demoCatStore, row];
    return row;
  }
  const { data, error } = await supabase
    .from('categories')
    .insert({ user_id: userId, name: clean, type })
    .select('id, name, type')
    .single();
  if (error) throw friendlyDbError(error);
  return data;
}

export async function renameCategory(id, name) {
  const clean = name.trim();
  if (!isSupabaseConfigured) {
    const target = demoCatStore.find((c) => c.id === id);
    if (demoCatStore.some((c) => c.id !== id && c.type === target?.type && c.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error('A category with that name already exists.');
    }
    demoCatStore = demoCatStore.map((c) => (c.id === id ? { ...c, name: clean } : c));
    demoTxStore = demoTxStore.map((t) => (t.category_id === id ? { ...t, category: clean } : t));
    return;
  }
  const { error } = await supabase.from('categories').update({ name: clean }).eq('id', id);
  if (error) throw friendlyDbError(error);
}

/** Deletes a category. Its transactions are kept and become "Uncategorized" (FK ON DELETE SET NULL). */
export async function deleteCategory(id) {
  if (!isSupabaseConfigured) {
    demoCatStore = demoCatStore.filter((c) => c.id !== id);
    demoTxStore = demoTxStore.map((t) => (t.category_id === id ? { ...t, category_id: null, category: 'Uncategorized' } : t));
    return;
  }
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw friendlyDbError(error);
}

// ---------- AI insights ----------
/** Latest stored AI insight for a period (null if none yet). */
export async function getLatestInsight(period) {
  if (!isSupabaseConfigured) return demoInsight;
  const { data, error } = await supabase
    .from('ai_insights')
    .select('spending_score, suggestions, created_at')
    .eq('period', period)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { spending_score: data.spending_score, ...data.suggestions };
}

/** Calls the Edge Function, which runs the AI evaluation and saves it to ai_insights. */
export async function refreshInsight(period) {
  if (!isSupabaseConfigured) {
    await wait(900);
    return demoInsight;
  }
  const { data, error } = await supabase.functions.invoke('evaluate-finances', { body: { period } });
  if (error) {
    // Rebuild a clean Error from the function's JSON payload ({ error, code, retry_after, insight }).
    const info = await parseFunctionError(error);
    const err = new Error(info.message);
    err.code = info.code;
    err.retryAfter = info.retryAfter;
    err.insight = info.insight;
    throw err;
  }
  return data; // { spending_score, analysis, tips, period, created_at }
}
