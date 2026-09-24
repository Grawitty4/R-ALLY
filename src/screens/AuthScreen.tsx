import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_MOTTO, APP_NAME } from '../brand';
import { formatPhone } from '../lib/phone';
import { useAuth } from '../store/AuthContext';
import { colors, radii, space } from '../theme';

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { sendOtp, confirmOtp } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | undefined>();

  const onSend = async () => {
    setError(null);
    setBusy(true);
    const result = await sendOtp(phone, name);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDevCode(result.devCode);
    setStep('otp');
  };

  const onConfirm = async () => {
    setError(null);
    setBusy(true);
    const result = await confirmOtp(code);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
    }
  };

  return (
    <LinearGradient colors={[colors.ink, '#15202B']} style={styles.root}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.body, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 }]}>
          <Text style={styles.kicker}>Your ALLY for the Ride</Text>
          <Text style={styles.wordmark}>{APP_NAME}</Text>
          <Text style={styles.tagline}>{APP_MOTTO}</Text>
          <Text style={styles.lead}>
            Sign in with your mobile number. Rides you finish will show up here on this phone.
          </Text>

          {step === 'phone' ? (
            <>
              <TextInput
                accessibilityLabel="Your name"
                autoCapitalize="words"
                placeholder="Your name"
                placeholderTextColor={colors.muted}
                value={name}
                onChangeText={setName}
                style={styles.input}
              />
              <TextInput
                accessibilityLabel="Mobile number"
                keyboardType="phone-pad"
                placeholder="Mobile number"
                placeholderTextColor={colors.muted}
                value={phone}
                onChangeText={setPhone}
                style={styles.input}
              />
              <Text style={styles.hint}>India numbers don’t need +91 — we add it.</Text>
            </>
          ) : (
            <>
              <Text style={styles.otpLabel}>Code sent to {formatPhone(phone)}</Text>
              <TextInput
                accessibilityLabel="One-time code"
                keyboardType="number-pad"
                maxLength={6}
                placeholder="6-digit OTP"
                placeholderTextColor={colors.muted}
                value={code}
                onChangeText={setCode}
                style={styles.input}
              />
              {devCode ? (
                <Text style={styles.dev}>Dev OTP: {devCode}</Text>
              ) : (
                <Text style={styles.hint}>Enter the SMS code. It expires in 5 minutes.</Text>
              )}
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            accessibilityRole="button"
            style={[styles.primary, busy && styles.disabled]}
            disabled={busy}
            onPress={step === 'phone' ? onSend : onConfirm}
          >
            <Text style={styles.primaryText}>
              {busy ? 'Please wait…' : step === 'phone' ? 'Send OTP' : 'Verify and continue'}
            </Text>
          </Pressable>
          {step === 'otp' ? (
            <Pressable onPress={() => { setStep('phone'); setCode(''); setError(null); }}>
              <Text style={styles.back}>Use a different number</Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: {
    flex: 1,
    paddingHorizontal: space.lg,
    gap: 10,
  },
  kicker: {
    color: colors.amber,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  wordmark: {
    color: colors.cream,
    fontSize: 44,
    fontWeight: '800',
  },
  tagline: {
    color: colors.creamMuted,
    fontSize: 16,
  },
  lead: {
    marginTop: 8,
    marginBottom: 8,
    color: 'rgba(246,241,232,0.72)',
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    backgroundColor: colors.paper,
    borderRadius: radii.pill,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  hint: {
    color: 'rgba(246,241,232,0.55)',
    fontSize: 13,
  },
  otpLabel: {
    color: colors.cream,
    fontWeight: '700',
  },
  dev: {
    color: colors.amber,
    fontWeight: '700',
  },
  error: {
    color: '#F3C1B8',
    fontSize: 13,
  },
  primary: {
    marginTop: 8,
    backgroundColor: colors.amber,
    borderRadius: radii.pill,
    paddingVertical: 16,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  primaryText: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 17,
  },
  back: {
    color: colors.creamMuted,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 12,
  },
});
