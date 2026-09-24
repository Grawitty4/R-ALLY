import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { distanceKm, formatDistance, relativeToYou } from '../lib/geo';
import { tap } from '../lib/haptics';
import {
  ASSIGNABLE_ROLES,
  memberCanAssignRoles,
  primaryRole,
} from '../lib/roles';
import { inferStatus, statusCopy, statusDetail } from '../lib/status';
import { useTrip } from '../store/TripContext';
import { colors, radii, space } from '../theme';
import type { Member, Trip } from '../types';
import { Avatar } from './Avatar';

type Props = {
  trip: Trip;
  member: Member;
  onClose: () => void;
};

const iconMap = {
  gas: 'gas-station',
  food: 'silverware-fork-knife',
  pause: 'pause-circle-outline',
  nav: 'navigation-variant',
} as const;

export function MemberSheet({ trip, member, onClose }: Props) {
  const { setMemberRole } = useTrip();
  const you = trip.members.find((item) => item.isYou) ?? member;
  const status = inferStatus(member);
  const meta = statusCopy[status.kind];
  const away = formatDistance(distanceKm(you.coordinate, member.coordinate));
  const relative = member.isYou
    ? 'This is your position'
    : relativeToYou(member.coordinate, you.coordinate, trip.destination);
  const role = primaryRole(member.roleIds);
  const canAssign =
    memberCanAssignRoles(you.roleIds) && member.id !== trip.createdBy;

  const openDirections = async () => {
    tap();
    const { latitude, longitude } = member.coordinate;
    const label = encodeURIComponent(member.nearbyPlace?.name ?? member.name);
    const url = Platform.select({
      ios: `maps:0,0?q=${latitude},${longitude}(${label})`,
      android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
    });
    if (url) {
      await Linking.openURL(url);
    }
  };

  const callMember = async () => {
    if (!member.phone) return;
    tap();
    await Linking.openURL(`tel:${member.phone}`);
  };

  return (
    <View style={styles.sheet}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <Avatar initials={member.initials} color={member.color} size={56} ring={meta.color} />
        <View style={styles.headerText}>
          <Text style={styles.name}>{member.name}</Text>
          <Text style={styles.sub}>
            {role.label}
            {member.isYou ? ` · ${relative}` : ` · ${away} · ${relative}`}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close member details"
          onPress={onClose}
          hitSlop={12}
          style={styles.close}
        >
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>

      <View style={styles.statusRow}>
        <MaterialCommunityIcons name={iconMap[meta.icon]} size={20} color={meta.color} />
        <Text style={[styles.statusLabel, { color: meta.color }]}>
          {statusDetail(status)}
        </Text>
      </View>

      {member.nearbyPlace ? (
        <View style={styles.place}>
          <Text style={styles.placeName}>{member.nearbyPlace.name}</Text>
          <Text style={styles.placeAddress}>{member.nearbyPlace.address}</Text>
        </View>
      ) : (
        <Text style={styles.placeAddress}>
          {trip.isDemo
            ? `Heading toward ${trip.destination.name}`
            : trip.members.length > 1
              ? 'Live location from this trip'
              : 'Share this trip code so friends can appear here.'}
        </Text>
      )}

      {canAssign ? (
        <View style={styles.roles}>
          <Text style={styles.roleLabel}>Ride role</Text>
          <View style={styles.roleRow}>
            {ASSIGNABLE_ROLES.map((option) => {
              const selected = member.roleIds.includes(option.id);
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Set role to ${option.label}`}
                  style={[styles.roleChip, selected && styles.roleChipOn]}
                  onPress={() => {
                    tap();
                    void setMemberRole(member.id, option.id);
                  }}
                >
                  <Text style={[styles.roleChipText, selected && styles.roleChipTextOn]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {!member.isYou ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Get directions"
            style={styles.primary}
            onPress={openDirections}
          >
            <Text style={styles.primaryText}>Directions</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Call member"
            style={[styles.secondary, !member.phone && styles.disabled]}
            onPress={callMember}
            disabled={!member.phone}
          >
            <Text style={styles.secondaryText}>Call</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    paddingTop: space.sm,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.creamMuted,
    marginBottom: space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  sub: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 14,
  },
  close: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  closeText: {
    color: colors.muted,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: space.md,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  place: {
    marginTop: 10,
    backgroundColor: colors.cream,
    borderRadius: radii.md,
    padding: space.md,
  },
  placeName: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
  },
  placeAddress: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: space.md,
  },
  primary: {
    flex: 1,
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
  secondary: {
    flex: 1,
    backgroundColor: colors.cream,
    borderRadius: radii.pill,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  secondaryText: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 16,
  },
  disabled: {
    opacity: 0.45,
  },
  roles: {
    marginTop: space.md,
  },
  roleLabel: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  roleRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  roleChip: {
    flex: 1,
    borderRadius: radii.pill,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.line,
  },
  roleChipOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  roleChipText: {
    fontWeight: '800',
    color: colors.ink,
  },
  roleChipTextOn: {
    color: colors.white,
  },
});
