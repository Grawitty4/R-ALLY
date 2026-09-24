import { decodePolyline, encodePolyline } from './polyline';
import {
  get,
  onDisconnect,
  onValue,
  ref,
  remove,
  set,
  update,
} from 'firebase/database';

import type { RoleId } from './roles';
import { CREATOR_ROLES, JOINER_ROLES, normalizeRoles } from './roles';
import type { Coordinate, Member, PitStop, Place, Trip } from '../types';
import { getFirebaseDatabase } from './firebase';
import { colorFromId, initialsFromName } from './identity';

export type LiveMember = {
  name: string;
  initials: string;
  color: string;
  roles: RoleId[];
  latitude: number;
  longitude: number;
  heading: number;
  speedKmh: number;
  stoppedAt: number | null;
  nearbyPlace?: Place;
  updatedAt: number;
};

type LivePitStop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

type LiveTripRecord = {
  createdAt: number;
  createdBy: string;
  destination: { name: string; latitude: number; longitude: number };
  pitStops?: LivePitStop[];
  routePolyline?: string;
  route?: Array<{ latitude: number; longitude: number }>;
  members?: Record<string, LiveMember>;
};

function tripRef(code: string) {
  return ref(getFirebaseDatabase(), `trips/${code}`);
}

function memberRef(code: string, deviceId: string) {
  return ref(getFirebaseDatabase(), `trips/${code}/members/${deviceId}`);
}

export function toLocalTrip(
  code: string,
  record: LiveTripRecord,
  deviceId: string,
): Trip {
  const members: Member[] = Object.entries(record.members ?? {}).map(([id, item]) => ({
    id,
    name: id === deviceId ? 'You' : item.name,
    initials: id === deviceId ? 'YO' : item.initials,
    color: item.color,
    isYou: id === deviceId,
    roleIds: normalizeRoles(item.roles),
    coordinate: { latitude: item.latitude, longitude: item.longitude },
    heading: item.heading,
    speedKmh: item.speedKmh,
    stoppedAt: item.stoppedAt ?? undefined,
    nearbyPlace: item.nearbyPlace,
  }));

  members.sort((a, b) => Number(b.isYou) - Number(a.isYou));

  const pitStops: PitStop[] = (record.pitStops ?? []).map((stop) => ({
    id: stop.id,
    name: stop.name,
    coordinate: { latitude: stop.latitude, longitude: stop.longitude },
  }));

  return {
    id: `trip-${code}`,
    code,
    isDemo: false,
    createdBy: record.createdBy,
    destination: record.destination,
    pitStops,
    route:
      (record.routePolyline ? decodePolyline(record.routePolyline) : record.route) ?? [],
    members,
  };
}

export async function createLiveTrip(input: {
  code: string;
  deviceId: string;
  name: string;
  coordinate: Coordinate;
  destination: { name: string } & Coordinate;
  pitStops: PitStop[];
  route: Coordinate[];
}) {
  const payload: LiveTripRecord = {
    createdAt: Date.now(),
    createdBy: input.deviceId,
    destination: input.destination,
    pitStops: input.pitStops.map((stop) => ({
      id: stop.id,
      name: stop.name,
      latitude: stop.coordinate.latitude,
      longitude: stop.coordinate.longitude,
    })),
    routePolyline: input.route.length >= 2 ? encodePolyline(input.route) : '',
    members: {
      [input.deviceId]: buildMember(
        input.deviceId,
        input.name,
        input.coordinate,
        [...CREATOR_ROLES],
        0,
        0,
      ),
    },
  };
  await set(tripRef(input.code), payload);
  await onDisconnect(memberRef(input.code, input.deviceId)).remove();
}

export async function joinLiveTrip(input: {
  code: string;
  deviceId: string;
  name: string;
  coordinate: Coordinate;
}) {
  const snapshot = await get(tripRef(input.code));
  if (!snapshot.exists()) {
    return { ok: false as const, message: `No live trip for ${input.code}. Ask the host to start first.` };
  }
  await set(
    memberRef(input.code, input.deviceId),
    buildMember(input.deviceId, input.name, input.coordinate, [...JOINER_ROLES], 0, 0),
  );
  await onDisconnect(memberRef(input.code, input.deviceId)).remove();
  return { ok: true as const };
}

export function subscribeLiveTrip(
  code: string,
  deviceId: string,
  onTrip: (trip: Trip) => void,
) {
  return onValue(tripRef(code), (snapshot) => {
    const record = snapshot.val() as LiveTripRecord | null;
    if (!record) return;
    onTrip(toLocalTrip(code, record, deviceId));
  });
}

export async function publishLiveLocation(input: {
  code: string;
  deviceId: string;
  coordinate: Coordinate;
  heading: number;
  speedKmh: number;
  stoppedAt: number | null;
}) {
  await update(memberRef(input.code, input.deviceId), {
    latitude: input.coordinate.latitude,
    longitude: input.coordinate.longitude,
    heading: input.heading,
    speedKmh: input.speedKmh,
    stoppedAt: input.stoppedAt,
    updatedAt: Date.now(),
  });
}

export async function setLiveMemberRoles(input: {
  code: string;
  memberId: string;
  roles: RoleId[];
}) {
  await update(memberRef(input.code, input.memberId), {
    roles: normalizeRoles(input.roles),
  });
}

export async function leaveLiveTrip(code: string, deviceId: string) {
  await remove(memberRef(code, deviceId));
}

function buildMember(
  deviceId: string,
  name: string,
  coordinate: Coordinate,
  roles: RoleId[],
  heading: number,
  speedKmh: number,
): LiveMember {
  return {
    name,
    initials: initialsFromName(name),
    color: colorFromId(deviceId),
    roles: normalizeRoles(roles),
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    heading,
    speedKmh,
    stoppedAt: speedKmh < 4 ? Date.now() : null,
    updatedAt: Date.now(),
  };
}
