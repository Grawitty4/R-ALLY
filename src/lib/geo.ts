import type { Coordinate } from '../types';

const EARTH_KM = 6371;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function distanceKm(a: Coordinate, b: Coordinate) {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(km: number) {
  if (km < 0.08) return 'Right here';
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km away`;
}

export function relativeToYou(
  member: Coordinate,
  you: Coordinate,
  destination: Coordinate,
) {
  const theirs = distanceKm(member, destination);
  const yours = distanceKm(you, destination);
  const gap = theirs - yours;
  if (gap < -0.35) return 'ahead of you';
  if (gap > 0.35) return 'behind you';
  return 'near you';
}

export function moveToward(from: Coordinate, to: Coordinate, km: number): Coordinate {
  const dist = distanceKm(from, to);
  if (dist === 0) return from;
  const t = Math.min(1, km / dist);
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * t,
    longitude: from.longitude + (to.longitude - from.longitude) * t,
  };
}

export function boundingRegion(points: Coordinate[]) {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.12, (maxLat - minLat) * 2.4 + 0.04),
    longitudeDelta: Math.max(0.12, (maxLng - minLng) * 2.4 + 0.04),
  };
}

function isValidCoord(point: Coordinate) {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

export function tripStartCoordinate(
  trip: {
    route: Coordinate[];
    createdBy: string;
    members: Array<{ id?: string; coordinate: Coordinate }>;
    destination: Coordinate;
  },
): Coordinate {
  if (trip.route[0] && isValidCoord(trip.route[0])) return trip.route[0];
  const host = trip.members.find((member) => member.id === trip.createdBy);
  if (host && isValidCoord(host.coordinate)) return host.coordinate;
  const first = trip.members.find((member) => isValidCoord(member.coordinate));
  return first?.coordinate ?? trip.destination;
}

/** Frame the crew, start, next waypoint, and the road they are about to ride. */
export function rideFitPoints(trip: {
  members: Array<{ id?: string; coordinate: Coordinate }>;
  pitStops: Array<{ coordinate: Coordinate }>;
  destination: Coordinate;
  route: Coordinate[];
  createdBy: string;
}): Coordinate[] {
  const members = trip.members
    .map((member) => member.coordinate)
    .filter(isValidCoord);
  const start = tripStartCoordinate(trip);
  const nextStop = trip.pitStops.find((stop) => isValidCoord(stop.coordinate))?.coordinate
    ?? trip.destination;
  const points: Coordinate[] = [...members, start, nextStop];

  if (trip.route.length >= 2) {
    const anchor = members[0] ?? start;
    let nearest = 0;
    let nearestKm = Number.POSITIVE_INFINITY;
    trip.route.forEach((point, index) => {
      const km = distanceKm(anchor, point);
      if (km < nearestKm) {
        nearestKm = km;
        nearest = index;
      }
    });
    let covered = 0;
    for (let index = nearest; index < trip.route.length; index += 1) {
      const point = trip.route[index];
      if (!isValidCoord(point)) continue;
      points.push(point);
      if (index > nearest) {
        covered += distanceKm(trip.route[index - 1], point);
      }
      if (covered >= 12) break;
      if (distanceKm(point, nextStop) < 0.45) break;
    }
  }

  return points;
}

export function projectToBox(
  point: Coordinate,
  region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number },
  width: number,
  height: number,
) {
  const x =
    ((point.longitude - (region.longitude - region.longitudeDelta / 2)) /
      region.longitudeDelta) *
    width;
  const y =
    ((region.latitude + region.latitudeDelta / 2 - point.latitude) /
      region.latitudeDelta) *
    height;
  return { x, y };
}
