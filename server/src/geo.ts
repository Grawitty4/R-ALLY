export type LatLng = { lat: number; lng: number };

const EARTH_KM = 6371;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function haversineKm(a: LatLng, b: LatLng) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function encodeRoute(points: LatLng[]) {
  return JSON.stringify(points.map((p) => [Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6))]));
}

export function decodeRoute(raw: string | null): LatLng[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (Array.isArray(item) && item.length >= 2) {
          return { lat: Number(item[0]), lng: Number(item[1]) };
        }
        if (item && typeof item === 'object' && 'lat' in item && 'lng' in item) {
          const row = item as { lat: unknown; lng: unknown };
          return { lat: Number(row.lat), lng: Number(row.lng) };
        }
        return null;
      })
      .filter((p): p is LatLng => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  } catch {
    return [];
  }
}

function projectOnSegment(p: LatLng, a: LatLng, b: LatLng) {
  const vx = b.lng - a.lng;
  const vy = b.lat - a.lat;
  const wx = p.lng - a.lng;
  const wy = p.lat - a.lat;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  const closest = { lat: a.lat + t * vy, lng: a.lng + t * vx };
  return { t, distKm: haversineKm(p, closest) };
}

export function routeKmAt(point: LatLng, line: LatLng[]) {
  if (line.length === 0) return 0;
  if (line.length === 1) return 0;
  let bestDist = Infinity;
  let bestKm = 0;
  let cum = 0;
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i];
    const b = line[i + 1];
    const segKm = haversineKm(a, b);
    const { t, distKm } = projectOnSegment(point, a, b);
    if (distKm < bestDist) {
      bestDist = distKm;
      bestKm = cum + t * segKm;
    }
    cum += segKm;
  }
  return bestKm;
}

export function routeLengthKm(line: LatLng[]) {
  let total = 0;
  for (let i = 1; i < line.length; i += 1) {
    total += haversineKm(line[i - 1], line[i]);
  }
  return total;
}
