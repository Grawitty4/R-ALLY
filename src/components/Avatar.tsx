import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

type Props = {
  initials: string;
  color: string;
  size?: number;
  ring?: string;
};

export function Avatar({ initials, color, size = 44, ring }: Props) {
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          borderColor: ring ?? colors.white,
          borderWidth: ring ? 3 : 2,
        },
      ]}
    >
      <Text style={[styles.letters, { fontSize: size * 0.34 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  letters: {
    color: colors.white,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
