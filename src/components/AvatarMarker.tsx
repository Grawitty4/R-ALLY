import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { inferStatus, statusChipText, statusCopy } from '../lib/status';
import { colors, radii } from '../theme';
import type { Member } from '../types';
import { Avatar } from './Avatar';

type Props = {
  member: Member;
  selected?: boolean;
};

export function AvatarMarker({ member, selected }: Props) {
  const status = inferStatus(member);
  const chip = statusChipText(status);
  const accent = member.isYou ? colors.ink : statusCopy[status.kind].color;

  return (
    <View style={styles.wrap}>
      {!member.isYou ? (
        <View style={[styles.chip, selected && styles.chipSelected]}>
          <Text style={styles.chipText} numberOfLines={1}>
            {chip}
          </Text>
        </View>
      ) : null}
      <Avatar
        initials={member.initials}
        color={member.color}
        size={selected ? 52 : 44}
        ring={selected ? accent : colors.white}
      />
      {member.isYou ? (
        <View style={styles.youPill}>
          <Text style={styles.youText}>You</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    minWidth: 150,
    pointerEvents: 'none',
  },
  chip: {
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    maxWidth: 150,
  },
  chipSelected: {
    backgroundColor: colors.inkSoft,
  },
  chipText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  youPill: {
    marginTop: 4,
    backgroundColor: colors.ink,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  youText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
});
