import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_MOTTO, APP_NAME } from '../brand';
import { Avatar } from '../components/Avatar';
import { tapImpact } from '../lib/haptics';
import { DEMO_CODE } from '../lib/tripCode';
import { RidePlannerScreen } from './RidePlannerScreen';
import { useTrip } from '../store/TripContext';
import { colors, radii, space } from '../theme';

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { startDemo, startTrip, joinTrip, savedName, liveReady } = useTrip();
  const [joining, setJoining] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState(savedName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (savedName) {
      setName((current) => current || savedName);
    }
  }, [savedName]);

  const onStart = () => {
    if (!name.trim()) {
      setError('Add your name so your crew can see you.');
      return;
    }
    setError(null);
    tapImpact();
    setPlanning(true);
  };

  const onDemo = () => {
    tapImpact();
    startDemo();
  };

  const onJoin = async () => {
    setError(null);
    const result = await joinTrip(code, name);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setJoining(false);
  };

  if (planning) {
    return (
      <RidePlannerScreen
        onCancel={() => setPlanning(false)}
        onCreate={(draft) => startTrip(name, draft)}
      />
    );
  }

  return (
    <LinearGradient colors={[colors.ink, '#15202B']} style={styles.root}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + 20,
              paddingBottom: Math.max(insets.bottom, 20) + 24,
            },
          ]}
        >
          <Text style={styles.kicker}>Group road trips</Text>
          <Text style={styles.wordmark}>{APP_NAME}</Text>
          <Text style={styles.tagline}>{APP_MOTTO}</Text>

          {!joining ? (
            <View style={styles.preview}>
              <View style={styles.avatars}>
                <Avatar initials="JO" color="#C47B12" size={48} />
                <View style={styles.overlap}>
                  <Avatar initials="PR" color="#2F8F7B" size={48} />
                </View>
                <View style={styles.overlap}>
                  <Avatar initials="AR" color="#3D5A80" size={48} />
                </View>
              </View>
              <View style={styles.chip}>
                <MaterialCommunityIcons name="gas-station" size={16} color={colors.amber} />
                <Text style={styles.chipText}>John · Refueling · 12 min</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.actions}>
            <TextInput
              accessibilityLabel="Your name"
              autoCapitalize="words"
              placeholder="Your name"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={(value) => {
                setName(value);
                setError(null);
              }}
              style={styles.nameInput}
            />
            {error && !joining ? <Text style={styles.homeError}>{error}</Text> : null}

            {joining ? (
              <View style={styles.joinCard}>
                <Text style={styles.joinLabel}>Trip code</Text>
                <TextInput
                  autoFocus
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={6}
                  placeholder={DEMO_CODE}
                  placeholderTextColor={colors.muted}
                  value={code}
                  onChangeText={(value) => {
                    setCode(value.toUpperCase());
                    setError(null);
                  }}
                  style={styles.input}
                  returnKeyType="join"
                  onSubmitEditing={onJoin}
                />
                {error ? (
                  <Text style={styles.error}>{error}</Text>
                ) : (
                  <Text style={styles.hint}>
                    Paste the host’s code, or try {DEMO_CODE} for the fake Pune convoy.
                  </Text>
                )}
                <View style={styles.joinRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Join trip"
                    style={styles.joinBtn}
                    onPress={onJoin}
                  >
                    <Text style={styles.joinBtnText}>Join trip</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cancel join"
                    onPress={() => {
                      setJoining(false);
                      setError(null);
                    }}
                  >
                    <Text style={styles.cancel}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <Text style={styles.liveHint}>
                  {liveReady
                    ? 'Start a trip, plan the destination, then send the code to the crew.'
                    : 'Live crew sharing needs Firebase in .env. Demo still works.'}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Start a trip"
                  style={styles.primary}
                  onPress={onStart}
                >
                  <Text style={styles.primaryText}>Start a trip</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Join with a code"
                  style={styles.secondary}
                  onPress={() => setJoining(true)}
                >
                  <Text style={styles.secondaryText}>Join with a code</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Watch a demo"
                  style={styles.ghost}
                  onPress={onDemo}
                >
                  <Text style={styles.ghostText}>Watch a demo</Text>
                </Pressable>
                <Pressable
                  onPress={() => Clipboard.setStringAsync(DEMO_CODE)}
                  style={styles.foot}
                >
                  <Text style={styles.footText}>
                    Location is shared only while a trip is on. Friends open {APP_NAME} and join with your code — they do not log into your Expo account.
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: space.lg,
  },
  kicker: {
    color: colors.amber,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  wordmark: {
    marginTop: 6,
    color: colors.cream,
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: 1,
  },
  tagline: {
    marginTop: 6,
    color: colors.creamMuted,
    fontSize: 16,
    lineHeight: 22,
    maxWidth: 320,
  },
  preview: {
    marginTop: 20,
    backgroundColor: colors.inkSoft,
    borderRadius: radii.lg,
    padding: space.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  avatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  overlap: {
    marginLeft: -12,
  },
  chip: {
    marginTop: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  chipText: {
    color: colors.cream,
    fontWeight: '700',
  },
  actions: {
    marginTop: 22,
    gap: 10,
  },
  nameInput: {
    backgroundColor: colors.paper,
    borderRadius: radii.pill,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  homeError: {
    color: '#F3C1B8',
    fontSize: 13,
    textAlign: 'center',
  },
  liveHint: {
    color: 'rgba(246,241,232,0.7)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 4,
  },
  primary: {
    backgroundColor: colors.amber,
    borderRadius: radii.pill,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryText: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 17,
  },
  secondary: {
    backgroundColor: colors.inkSoft,
    borderRadius: radii.pill,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  secondaryText: {
    color: colors.cream,
    fontWeight: '800',
    fontSize: 17,
  },
  ghost: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  ghostText: {
    color: colors.creamMuted,
    fontWeight: '700',
    fontSize: 16,
  },
  joinCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.md,
    padding: space.md,
  },
  joinLabel: {
    color: colors.muted,
    fontWeight: '700',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 4,
    color: colors.ink,
  },
  hint: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 13,
  },
  error: {
    marginTop: 8,
    color: colors.rose,
    fontSize: 13,
  },
  joinRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  joinBtn: {
    flex: 1,
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  joinBtnText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
  cancel: {
    color: colors.muted,
    fontWeight: '700',
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  foot: {
    marginTop: 8,
  },
  footText: {
    color: 'rgba(246,241,232,0.55)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
