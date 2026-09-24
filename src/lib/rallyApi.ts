import { colorFromId } from './identity';
import type { Coordinate, PitStop } from '../types';

export type ArchiveSample = {
  recordedAt: string;
  lat: number;
  lng: number;
  altitudeM?: number | null;
  accuracyM?: number | null;
  speedKmh: number;
  heading: number;
  stopped: boolean;
};

const BASE = process.env.EXPO_PUBLIC_API_URL ?? '';

export function isArchiveConfigured() {
  return BASE.replace(/\/$/, '').length > 0;
}

function url(path: string) {
  return `${BASE.replace(/\/$/, '')}${path}`;
}

async function postJson(path: string, deviceId: string, body: Record<string, unknown>) {
  if (!isArchiveConfigured()) return { ok: false as const, skipped: true as const };
  try {
    const response = await fetch(url(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': deviceId,
      },
      body: JSON.stringify({ ...body, deviceId }),
    });
    if (!response.ok) return { ok: false as const, skipped: false as const };
    return { ok: true as const, skipped: false as const };
  } catch {
    return { ok: false as const, skipped: false as const };
  }
}

export function archiveCreateRide(input: {
  code: string;
  deviceId: string;
  displayName: string;
  phone?: string;
  destination: { name: string } & Coordinate;
  start: Coordinate;
  pitStops: PitStop[];
  route: Coordinate[];
}) {
  return postJson('/rides', input.deviceId, {
    code: input.code,
    displayName: input.displayName,
    phone: input.phone,
    color: colorFromId(input.deviceId),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    destination: input.destination,
    start: input.start,
    pitStops: input.pitStops.map((stop) => ({
      name: stop.name,
      latitude: stop.coordinate.latitude,
      longitude: stop.coordinate.longitude,
    })),
    route: input.route,
  });
}

export function archiveJoinRide(input: {
  code: string;
  deviceId: string;
  displayName: string;
  phone?: string;
}) {
  return postJson(`/rides/${input.code}/join`, input.deviceId, {
    displayName: input.displayName,
    phone: input.phone,
    color: colorFromId(input.deviceId),
  });
}

export function archiveSamples(input: {
  code: string;
  deviceId: string;
  samples: ArchiveSample[];
}) {
  if (input.samples.length === 0) {
    return Promise.resolve({ ok: true as const, skipped: !isArchiveConfigured() });
  }
  return postJson(`/rides/${input.code}/samples`, input.deviceId, {
    samples: input.samples,
  });
}

export function archiveLeaveRide(code: string, deviceId: string, asAdmin: boolean) {
  const path = asAdmin ? `/rides/${code}/end` : `/rides/${code}/leave`;
  return postJson(path, deviceId, {});
}

export async function requestOtp(phone: string, deviceId: string) {
  if (!isArchiveConfigured()) {
    return { ok: false as const, message: 'Set EXPO_PUBLIC_API_URL to send an OTP.' };
  }
  try {
    const response = await fetch(url('/auth/otp/request'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId },
      body: JSON.stringify({ phone, deviceId }),
    });
    const json = (await response.json()) as {
      ok?: boolean;
      error?: string;
      devCode?: string;
    };
    if (!response.ok || !json.ok) {
      return { ok: false as const, message: json.error ?? 'Could not send OTP.' };
    }
    return { ok: true as const, devCode: json.devCode };
  } catch {
    return { ok: false as const, message: 'Could not reach the R-ALLY API.' };
  }
}

export async function verifyOtp(input: {
  phone: string;
  code: string;
  displayName: string;
  deviceId: string;
}) {
  if (!isArchiveConfigured()) {
    return { ok: false as const, message: 'Set EXPO_PUBLIC_API_URL to verify an OTP.' };
  }
  try {
    const response = await fetch(url('/auth/otp/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': input.deviceId },
      body: JSON.stringify(input),
    });
    const json = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !json.ok) {
      return { ok: false as const, message: json.error ?? 'That code did not match.' };
    }
    return { ok: true as const };
  } catch {
    return { ok: false as const, message: 'Could not reach the R-ALLY API.' };
  }
}

export type RideHistoryItem = {
  code: string;
  status: string;
  destination_name: string;
  started_at: string | null;
  ended_at: string | null;
  distance_km: string | number | null;
  elapsed_s: number | null;
};

export async function fetchMyRides(deviceId: string, phone?: string) {
  if (!isArchiveConfigured()) return [];
  try {
    const response = await fetch(
      url(`/me/rides${phone ? `?phone=${encodeURIComponent(phone)}` : ''}`),
      { headers: { 'X-Device-Id': deviceId } },
    );
    if (!response.ok) return [];
    const json = (await response.json()) as { ok?: boolean; rides?: RideHistoryItem[] };
    return json.rides ?? [];
  } catch {
    return [];
  }
}
