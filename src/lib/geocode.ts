import * as Location from 'expo-location';

import type { Coordinate } from '../types';

export async function geocodePlace(
  query: string,
  fallback: Coordinate,
): Promise<{ name: string } & Coordinate> {
  const name = query.trim();
  if (!name) {
    return { name: 'Open ride', ...fallback };
  }
  try {
    const results = await Location.geocodeAsync(name);
    const first = results[0];
    if (first && Number.isFinite(first.latitude) && Number.isFinite(first.longitude)) {
      return { name, latitude: first.latitude, longitude: first.longitude };
    }
  } catch {
    // Keep the typed name even if the device cannot geocode it.
  }
  return { name, ...fallback };
}
