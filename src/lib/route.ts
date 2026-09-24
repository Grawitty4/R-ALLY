import type { Coordinate } from '../types';

const MAX_POINTS = 180;

function downsample(points: Coordinate[]) {
  if (points.length <= MAX_POINTS) return points;
  const step = Math.ceil(points.length / MAX_POINTS);
  const next = points.filter((_, index) => index % step === 0);
  const last = points[points.length - 1];
  const tail = next[next.length - 1];
  if (!tail || tail.latitude !== last.latitude || tail.longitude !== last.longitude) {
    next.push(last);
  }
  return next;
}

export async function fetchDrivingRoute(waypoints: Coordinate[]) {
  const points = waypoints.filter(
    (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
  );
  if (points.length < 2) return [];

  const path = points
    .map((point) => `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`)
    .join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson&alternatives=false`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'R-ALLY/1.0 (group ride app)',
      },
    });
    if (!response.ok) return [];
    const json = (await response.json()) as {
      routes?: Array<{ geometry?: { coordinates?: number[][] } }>;
    };
    const coordinates = json.routes?.[0]?.geometry?.coordinates ?? [];
    return downsample(
      coordinates
        .map(([longitude, latitude]) => ({ latitude, longitude }))
        .filter(
          (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
        ),
    );
  } catch {
    return [];
  }
}
