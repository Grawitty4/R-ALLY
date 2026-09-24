import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_NAME } from '../brand';
import { CrewRail } from '../components/CrewRail';
import { MemberSheet } from '../components/MemberSheet';
import { TripMap } from '../components/TripMap';
import { tap, tapSuccess } from '../lib/haptics';
import { useTrip } from '../store/TripContext';
import { colors, radii } from '../theme';

export function TripScreen() {
  const insets = useSafeAreaInsets();
  const { trip, selectedId, selectMember, endTrip } = useTrip();
  const [fitNonce, setFitNonce] = useState(0);

  if (!trip) return null;

  const selected = trip.members.find((member) => member.id === selectedId) ?? null;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.mapHost}>
        <TripMap
          trip={trip}
          selectedId={selectedId}
          onSelect={selectMember}
          fitNonce={fitNonce}
        />
      </View>

      <View style={[styles.top, { top: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy trip code"
          style={styles.codePill}
          onPress={async () => {
            await Clipboard.setStringAsync(trip.code);
            tapSuccess();
            if (!trip.isDemo) {
              Share.share({
                message: `Join my ${APP_NAME} trip to ${trip.destination.name} with code ${trip.code}`,
              }).catch(() => undefined);
            }
          }}
        >
          <Text style={styles.codeLabel}>{trip.isDemo ? 'DEMO' : 'TRIP'}</Text>
          <Text style={styles.code}>{trip.code}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="End trip"
          style={styles.end}
          onPress={() => {
            tap();
            endTrip();
          }}
        >
          <Text style={styles.endText}>End</Text>
        </Pressable>
      </View>
      <View style={[styles.plan, { top: insets.top + 58 }]} pointerEvents="none">
        <Text style={styles.planText} numberOfLines={1}>
          To {trip.destination.name}
          {trip.pitStops.length
            ? ` · ${trip.pitStops.length} pit stop${trip.pitStops.length === 1 ? '' : 's'}`
            : ''}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fit crew and route on screen"
        style={[
          styles.fit,
          { bottom: selected ? 210 : insets.bottom + 86 },
        ]}
        onPress={() => {
          tap();
          setFitNonce((current) => current + 1);
        }}
      >
        <MaterialCommunityIcons name="image-filter-center-focus" size={22} color={colors.ink} />
      </Pressable>

      <View style={[styles.bottom, { paddingBottom: selected ? 0 : insets.bottom + 12 }]}>
        <CrewRail
          members={trip.members}
          selectedId={selectedId}
          onSelect={selectMember}
        />
        {selected ? (
          <MemberSheet
            trip={trip}
            member={selected}
            onClose={() => selectMember(null)}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#D7E0D4',
  },
  mapHost: {
    flex: 1,
  },
  top: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 4,
  },
  codePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.paper,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.pill,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  codeLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  code: {
    color: colors.ink,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  end: {
    backgroundColor: colors.ink,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.pill,
  },
  endText: {
    color: colors.white,
    fontWeight: '800',
  },
  plan: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 4,
  },
  planText: {
    backgroundColor: 'rgba(14,20,27,0.78)',
    color: colors.cream,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    fontSize: 12,
    fontWeight: '700',
    maxWidth: '100%',
  },
  fit: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 10,
    zIndex: 4,
  },
});
