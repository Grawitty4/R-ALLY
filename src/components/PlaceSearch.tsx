import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { tap } from '../lib/haptics';
import { suggestPlaces, type PlaceSuggestion } from '../lib/places';
import type { Coordinate } from '../types';
import { colors, radii } from '../theme';

type Props = {
  label: string;
  placeholder: string;
  value: string;
  near?: Coordinate;
  onChangeQuery: (value: string) => void;
  onPick: (place: PlaceSuggestion) => void;
};

export function PlaceSearch({
  label,
  placeholder,
  value,
  near,
  onChangeQuery,
  onPick,
}: Props) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return undefined;
    }

    const handle = setTimeout(() => {
      const id = requestId.current + 1;
      requestId.current = id;
      setLoading(true);
      void suggestPlaces(query, near).then((results) => {
        if (requestId.current !== id) return;
        setSuggestions(results);
        setLoading(false);
      });
    }, 280);

    return () => clearTimeout(handle);
  }, [near, value]);

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel={label}
          autoCapitalize="words"
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          value={value}
          onChangeText={(next) => {
            onChangeQuery(next);
            if (next.trim().length < 2) setSuggestions([]);
          }}
          style={styles.input}
          returnKeyType="search"
        />
        {loading ? <ActivityIndicator style={styles.spinner} color={colors.amberDeep} /> : null}
      </View>
      {suggestions.length > 0 ? (
        <View style={styles.list}>
          {suggestions.map((place) => (
            <Pressable
              key={place.id}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${place.name}`}
              style={styles.item}
              onPress={() => {
                tap();
                onPick(place);
                setSuggestions([]);
              }}
            >
              <Text style={styles.name}>{place.name}</Text>
              {place.subtitle ? <Text style={styles.sub}>{place.subtitle}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 0,
  },
  inputRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: colors.paper,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingRight: 42,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  spinner: {
    position: 'absolute',
    right: 14,
  },
  list: {
    backgroundColor: colors.paper,
    borderRadius: radii.md,
    marginTop: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
  },
  item: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  name: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 15,
  },
  sub: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 12,
  },
});
