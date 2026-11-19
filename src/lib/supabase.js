import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** False when .env is missing -> the app runs in offline Demo Mode with sample data. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // AsyncStorage keeps the session across app restarts on the device.
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // No browser URL on native, so never try to parse a session from it.
        detectSessionInUrl: false,
      },
    })
  : null;

// Only refresh the token while the app is in the foreground. Timers are paused
// in the background, so the refresh restarts when the app becomes active again.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/**
 * Turns any error from supabase.functions.invoke() into
 * { message, code, status, retryAfter, insight }.
 * A non-2xx response arrives as FunctionsHttpError, with the JSON body in error.context.
 */
export async function parseFunctionError(error) {
  const result = { message: error?.message || 'Request failed', code: 'UNKNOWN', status: 0, retryAfter: null, insight: null };
  const response = error?.context;
  if (response && typeof response.json === 'function') {
    result.status = response.status;
    try {
      const body = await response.json();
      result.message = body.error || result.message;
      result.code = body.code || result.code;
      result.retryAfter = body.retry_after ?? null;
      result.insight = body.insight ?? null;
    } catch {
      // Body was not JSON; keep the generic message.
    }
  } else if (error?.name === 'FunctionsFetchError') {
    result.code = 'NETWORK';
    result.message = 'Network error. Check your connection and try again.';
  }
  return result;
}
