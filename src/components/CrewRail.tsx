import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { tap } from '../lib/haptics';
import { primaryRole } from '../lib/roles';
import { inferStatus, statusChipText } from '../lib/status';
import { colors, radii } from '../theme';
import type { Member } from '../types';
import { Avatar } from './Avatar';

type Props = {
  members: Member[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function CrewRail({ members, selectedId, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {members.map((member) => {
        const selected = member.id === selectedId;
        const status = inferStatus(member);
        return (
          <Pressable
            key={member.id}
            accessibilityRole="button"
            accessibilityLabel={`${member.name} in the crew`}
            onPress={() => {
              tap();
              onSelect(member.id);
            }}
            style={[styles.card, selected && styles.cardOn]}
          >
            <Avatar initials={member.initials} color={member.color} size={36} />
            <View>
              <Text style={styles.name}>{member.name}</Text>
              <Text style={styles.status} numberOfLines={1}>
                {primaryRole(member.roleIds).label}
                {member.isYou ? '' : ` · ${statusChipText(status)}`}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingHorizontal: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.paper,
    borderRadius: radii.pill,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardOn: {
    borderColor: colors.ink,
    backgroundColor: colors.cream,
  },
  name: {
    fontWeight: '800',
    color: colors.ink,
    fontSize: 13,
  },
  status: {
    color: colors.muted,
    fontSize: 11,
    maxWidth: 110,
  },
});
