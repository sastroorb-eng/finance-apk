import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Wallet } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { card, colors } from '../theme';

export default function AuthScreen() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function submit() {
    setLoading(true);
    setMessage('');
    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name } } });
    setLoading(false);
    if (error) return setMessage(error.message);
    if (mode === 'signup' && !data.session) setMessage('Check your email to confirm your account, then sign in.');
    // On success, onAuthStateChange in App.js switches to the dashboard.
  }

  return (
    <View style={styles.container}>
      <View style={styles.logo}><Wallet size={32} color={colors.primary} /></View>
      <Text style={styles.heading}>Money Manager</Text>
      <Text style={styles.sub}>{mode === 'signin' ? 'Sign in to continue' : 'Create your account'}</Text>

      <View style={styles.card}>
        {mode === 'signup' && (
          <TextInput style={styles.input} placeholder="Name" value={name} onChangeText={setName} />
        )}
        <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Pressable style={styles.button} onPress={submit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{mode === 'signin' ? 'Sign In' : 'Sign Up'}</Text>}
        </Pressable>
        <Pressable onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          <Text style={styles.switch}>
            {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  logo: { alignSelf: 'center', backgroundColor: colors.primarySoft, padding: 16, borderRadius: 20, marginBottom: 12 },
  heading: { textAlign: 'center', fontSize: 24, fontWeight: '800', color: colors.text },
  sub: { textAlign: 'center', color: colors.muted, marginBottom: 24 },
  card: { ...card, padding: 20 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 15, marginBottom: 12 },
  message: { color: colors.expense, marginBottom: 12 },
  button: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  switch: { textAlign: 'center', color: colors.primary, marginTop: 16, fontWeight: '600' },
});
