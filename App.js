import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isSupabaseConfigured, supabase } from './src/lib/supabase';
import AuthScreen from './src/screens/AuthScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import { colors } from './src/theme';

export default function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  let content;
  if (!ready) {
    content = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  } else if (isSupabaseConfigured && !session) {
    content = <AuthScreen />;
  } else {
    // Demo Mode (no .env) goes straight to the dashboard with sample data.
    content = <DashboardScreen key={session?.user?.id ?? 'demo'} session={session} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {content}
    </SafeAreaProvider>
  );
}
