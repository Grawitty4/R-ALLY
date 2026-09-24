import type { Coordinate } from '../types';

export type PlaceSuggestion = {
  id: string;
  name: string;
  subtitle: string;
  coordinate: Coordinate;
};

const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'R-ALLY/1.0 (group ride app)',
};

function labelOf(parts: Array<string | undefined>) {
  return [...new Set(parts.filter((part): part is string => Boolean(part && part.trim())))].join(', ');
}

async function fromPhoton(query: string, near?: Coordinate): Promise<PlaceSuggestion[]> {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '6');
  url.searchParams.set('lang', 'en');
  if (near) {
    url.searchParams.set('lat', String(near.latitude));
    url.searchParams.set('lon', String(near.longitude));
  }
  const response = await fetch(url.toString(), { headers: HEADERS });
  if (!response.ok) return [];
  const json = (await response.json()) as {
    features?: Array<{
      geometry?: { coordinates?: number[] };
      properties?: {
        osm_id?: number;
        name?: string;
        street?: string;
        city?: string;
        state?: string;
        country?: string;
        osm_value?: string;
      };
    }>;
  };
  return (json.features ?? [])
    .map((feature, index) => {
      const [longitude, latitude] = feature.geometry?.coordinates ?? [];
      const props = feature.properties ?? {};
      const name = props.name || props.street;
      if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return {
        id: `photon-${props.osm_id ?? index}`,
        name,
        subtitle: labelOf([props.city, props.state, props.country]),
        coordinate: { latitude, longitude },
      } satisfies PlaceSuggestion;
    })
    .filter((item): item is PlaceSuggestion => item !== null);
}

async function fromNominatim(query: string): Promise<PlaceSuggestion[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '6');
  url.searchParams.set('countrycodes', 'in');
  const response = await fetch(url.toString(), { headers: HEADERS });
  if (!response.ok) return [];
  const json = (await response.json()) as Array<{
    place_id?: number;
    lat?: string;
    lon?: string;
    name?: string;
    display_name?: string;
    address?: { city?: string; town?: string; village?: string; state?: string };
  }>;
  return json
    .map((item) => {
      const latitude = Number(item.lat);
      const longitude = Number(item.lon);
      const name = item.name || item.display_name?.split(',')[0];
      if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return {
        id: `osm-${item.place_id ?? `${latitude}-${longitude}`}`,
        name,
        subtitle: labelOf([
          item.address?.city ?? item.address?.town ?? item.address?.village,
          item.address?.state,
        ]),
        coordinate: { latitude, longitude },
      } satisfies PlaceSuggestion;
    })
    .filter((item): item is PlaceSuggestion => item !== null);
}

export async function suggestPlaces(query: string, near?: Coordinate) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  try {
    const photon = await fromPhoton(trimmed, near);
    if (photon.length > 0) return photon;
  } catch {
    // Try Nominatim if Photon is unreachable.
  }
  try {
    return await fromNominatim(trimmed);
  } catch {
    return [];
  }
}
