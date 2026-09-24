import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlaceSearch } from '../components/PlaceSearch';
import { tap, tapImpact } from '../lib/haptics';
import type { PlaceSuggestion } from '../lib/places';
import type { Coordinate, RideDraft } from '../types';
import { colors, radii, space } from '../theme';

type Result = { ok: true } | { ok: false; message: string };

type Props = {
  onCancel: () => void;
  onCreate: (draft: RideDraft) => Promise<Result>;
};

type PlaceField = {
  query: string;
  coordinate?: Coordinate;
};

const MAX_STOPS = 6;
const EMPTY_FIELD: PlaceField = { query: '' };

export function RidePlannerScreen({ onCancel, onCreate }: Props) {
  const insets = useSafeAreaInsets();
  const [destination, setDestination] = useState<PlaceField>(EMPTY_FIELD);
  const [stopCount, setStopCount] = useState(0);
  const [stopFields, setStopFields] = useState<PlaceField[]>([]);
  const [near, setNear] = useState<Coordinate | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getLastKnownPositionAsync();
        const coords = pos?.coords;
        if (coords) {
          setNear({ latitude: coords.latitude, longitude: coords.longitude });
        }
      } catch {
        // Suggestions still work without a location bias.
      }
    })();
  }, []);

  const stops = useMemo(
    () => Array.from({ length: stopCount }, (_, index) => stopFields[index] ?? EMPTY_FIELD),
    [stopCount, stopFields],
  );

  const setStopCountSafe = (next: number) => {
    const count = Math.max(0, Math.min(MAX_STOPS, next));
    setStopCount(count);
    setStopFields((current) => current.slice(0, count));
  };

  const pickDestination = (place: PlaceSuggestion) => {
    setDestination({ query: place.name, coordinate: place.coordinate });
    setError(null);
  };

  const pickStop = (index: number, place: PlaceSuggestion) => {
    setStopFields((current) => {
      const next = [...current];
      next[index] = { query: place.name, coordinate: place.coordinate };
      return next;
    });
  };

  const onSubmit = async () => {
    const destinationName = destination.query.trim();
    if (!destinationName) {
      setError('Where is the ride heading?');
      return;
    }
    if (!destination.coordinate) {
      setError('Pick the destination from the suggestions so we can draw the route.');
      return;
    }
    setBusy(true);
    setError(null);
    tapImpact();
    const result = await onCreate({
      destinationName,
      destinationCoordinate: destination.coordinate,
      pitStops: stops
        .filter((stop) => stop.query.trim())
        .map((stop) => ({
          name: stop.query.trim(),
          coordinate: stop.coordinate,
        })),
    });
    if (!result.ok) setError(result.message);
    setBusy(false);
  };

  return (
    <LinearGradient colors={[colors.ink, '#15202B']} style={styles.root}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
          <Text style={styles.kicker}>Ride planner</Text>
          <Text style={styles.title}>Set the route</Text>
          <Text style={styles.tagline}>
            Type a few letters and pick a place. We’ll draw the driving route from where you are.
          </Text>

          <Text style={styles.label}>Destination</Text>
          <PlaceSearch
            label="Destination"
            placeholder="Lonavala, Goa, Mahabaleshwar…"
            value={destination.query}
            near={near}
            onChangeQuery={(query) => {
              setDestination({ query });
              setError(null);
            }}
            onPick={pickDestination}
          />

          <View style={styles.countRow}>
            <View>
              <Text style={styles.label}>Pit stops</Text>
              <Text style={styles.countHint}>Fuel, food, viewpoints</Text>
            </View>
            <View style={styles.stepper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fewer pit stops"
                style={styles.step}
                onPress={() => {
                  tap();
                  setStopCountSafe(stopCount - 1);
                }}
              >
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <Text style={styles.count}>{stopCount}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More pit stops"
                style={styles.step}
                onPress={() => {
                  tap();
                  setStopCountSafe(stopCount + 1);
                }}
              >
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>
          </View>

          {stops.map((stop, index) => (
            <PlaceSearch
              key={`stop-${index}`}
              label={`Pit stop ${index + 1}`}
              placeholder={`Pit stop ${index + 1}`}
              value={stop.query}
              near={near}
              onChangeQuery={(query) => {
                setStopFields((current) => {
                  const next = [...current];
                  next[index] = { query };
                  return next;
                });
              }}
              onPick={(place) => pickStop(index, place)}
            />
          ))}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create ride"
            style={styles.primary}
            onPress={onSubmit}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <Text style={styles.primaryText}>Create ride</Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel planner"
            style={styles.ghost}
            onPress={onCancel}
            disabled={busy}
          >
            <Text style={styles.ghostText}>Back</Text>
          </Pressable>
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
    gap: 10,
  },
  kicker: {
    color: colors.amber,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  title: {
    marginTop: 6,
    color: colors.cream,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
  },
  tagline: {
    color: colors.creamMuted,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 12,
  },
  label: {
    color: colors.cream,
    fontWeight: '800',
    fontSize: 14,
    marginTop: 8,
  },
  countHint: {
    color: colors.creamMuted,
    fontSize: 12,
    marginTop: 2,
  },
  countRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.inkSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  step: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inkMid,
  },
  stepText: {
    color: colors.cream,
    fontSize: 22,
    fontWeight: '700',
  },
  count: {
    color: colors.cream,
    fontWeight: '800',
    fontSize: 18,
    minWidth: 18,
    textAlign: 'center',
  },
  error: {
    color: '#F3C1B8',
    fontSize: 13,
    textAlign: 'center',
  },
  primary: {
    marginTop: 12,
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
  ghost: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  ghostText: {
    color: colors.creamMuted,
    fontWeight: '700',
    fontSize: 16,
  },
});
