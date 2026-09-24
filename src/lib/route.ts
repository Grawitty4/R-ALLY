import type { Coordinate } from '../types';
import { distanceKm } from './geo';

const MAX_POINTS = 1800;
const NEAR_KM = 18;
const NEAR_STEP_KM = 0.05;
const FAR_STEP_KM = 0.22;

const OSRM_URLS = [
  'https://router.project-osrm.org/route/v1/driving',
  'https://routing.openstreetmap.de/routed-car/route/v1/driving',
];

function valid(points: Coordinate[]) {
  return points.filter(
    (point) =>
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude) &&
      Math.abs(point.latitude) <= 90 &&
      Math.abs(point.longitude) <= 180,
  );
}

/** Keep street-level detail near the start and each pit; thin the long highway. */
export function shapeDrivingRoute(points: Coordinate[], anchors: Coordinate[]) {
  const source = valid(points);
  if (source.length <= 2) return source;

  const kept: Coordinate[] = [];
  let lastKept = source[0];
  kept.push(lastKept);

  for (let index = 1; index < source.length; index += 1) {
    const point = source[index];
    const nearAnchor = anchors.some((anchor) => distanceKm(point, anchor) <= NEAR_KM);
    const minStep = nearAnchor ? NEAR_STEP_KM : FAR_STEP_KM;
    const isTail = index === source.length - 1;
    if (isTail || distanceKm(lastKept, point) >= minStep) {
      kept.push(point);
      lastKept = point;
    }
  }

  if (kept.length <= MAX_POINTS) return kept;
  const step = Math.ceil(kept.length / MAX_POINTS);
  return kept.filter((_, index) => index % step === 0 || index === kept.length - 1);
}

async function fetchOsrm(path: string, base: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18_000);
  try {
    const response = await fetch(
      `${base}/${path}?overview=full&geometries=geojson&alternatives=false`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'R-ALLY/1.0 (group ride app)',
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) return [];
    const json = (await response.json()) as {
      code?: string;
      routes?: Array<{ geometry?: { coordinates?: number[][] } }>;
    };
    if (json.code && json.code !== 'Ok') return [];
    return (json.routes?.[0]?.geometry?.coordinates ?? [])
      .map(([longitude, latitude]) => ({ latitude, longitude }))
      .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchDrivingRoute(waypoints: Coordinate[]) {
  const points = valid(waypoints);
  if (points.length < 2) return [];

  const path = points
    .map((point) => `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`)
    .join(';');

  let geometry: Coordinate[] = [];
  for (const base of OSRM_URLS) {
    geometry = await fetchOsrm(path, base);
    if (geometry.length >= 2) break;
  }

  return shapeDrivingRoute(geometry, points);
}
