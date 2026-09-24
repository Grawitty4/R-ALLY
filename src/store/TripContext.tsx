import * as Location from 'expo-location';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { createDemoTrip } from '../data/demoTrip';
import { isFirebaseConfigured } from '../lib/firebase';
import { geocodePlace } from '../lib/geocode';
import { moveToward } from '../lib/geo';
import { colorFromId, getDeviceId, getSavedName, saveName } from '../lib/identity';
import { useAuth } from './AuthContext';
import {
  createLiveTrip,
  joinLiveTrip,
  leaveLiveTrip,
  publishLiveLocation,
  setLiveMemberRoles,
  subscribeLiveTrip,
} from '../lib/liveTrip';
import {
  archiveCreateRide,
  archiveJoinRide,
  archiveLeaveRide,
  archiveSamples,
  type ArchiveSample,
} from '../lib/rallyApi';
import {
  applyAssignableRole,
  CREATOR_ROLES,
  JOINER_ROLES,
  type RoleId,
} from '../lib/roles';
import { fetchDrivingRoute } from '../lib/route';
import { DEMO_CODE, makeTripCode, normalizeCode } from '../lib/tripCode';
import type { PitStop, RideDraft, Trip } from '../types';

type Result = { ok: true } | { ok: false; message: string };

type TripContextValue = {
  trip: Trip | null;
  selectedId: string | null;
  savedName: string;
  liveReady: boolean;
  startDemo: () => void;
  startTrip: (name: string, draft: RideDraft) => Promise<Result>;
  joinTrip: (code: string, name: string) => Promise<Result>;
  endTrip: () => void;
  setMemberRole: (memberId: string, role: RoleId) => Promise<Result>;
  selectMember: (id: string | null) => void;
};

const TripContext = createContext<TripContextValue | null>(null);

const PUNE = { latitude: 18.5204, longitude: 73.8567 };

export function TripProvider({ children }: { children: React.ReactNode }) {
  const { phone: accountPhone } = useAuth();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [savedName, setSavedName] = useState('');
  const displayNameRef = useRef('');
  const stoppedAtRef = useRef<number | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const liveCodeRef = useRef<string | null>(null);
  const pendingSamplesRef = useRef<ArchiveSample[]>([]);
  const lastLivePublishRef = useRef(0);
  const lastSampleFlushRef = useRef(0);

  useEffect(() => {
    getDeviceId().then(setDeviceId);
    getSavedName().then((name) => {
      setSavedName(name);
      displayNameRef.current = name;
    });
  }, []);

  const detachLive = useCallback(async () => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    const code = liveCodeRef.current;
    liveCodeRef.current = null;
    stoppedAtRef.current = null;
    if (code && deviceId) {
      try {
        await leaveLiveTrip(code, deviceId);
      } catch {
        // Offline leave is handled by Firebase onDisconnect.
      }
    }
  }, [deviceId]);

  const attachLive = useCallback((code: string, id: string) => {
    unsubscribeRef.current?.();
    liveCodeRef.current = code;
    pendingSamplesRef.current = [];
    lastLivePublishRef.current = 0;
    lastSampleFlushRef.current = 0;
    unsubscribeRef.current = subscribeLiveTrip(code, id, (next) => {
      setTrip(next);
    });
  }, []);

  const flushSamples = useCallback(async (code: string, id: string) => {
    const batch = pendingSamplesRef.current;
    if (batch.length === 0) return;
    pendingSamplesRef.current = [];
    const result = await archiveSamples({ code, deviceId: id, samples: batch });
    if (!result.ok && !result.skipped) {
      pendingSamplesRef.current = [...batch, ...pendingSamplesRef.current].slice(-2000);
    }
    lastSampleFlushRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!trip?.isDemo) return undefined;

    const timer = setInterval(() => {
      setTrip((current) => {
        if (!current?.isDemo) return current;
        return {
          ...current,
          members: current.members.map((member) => {
            if (member.id === 'priya') {
              return {
                ...member,
                coordinate: moveToward(member.coordinate, current.destination, 0.12),
                speedKmh: 44 + Math.round(Math.random() * 4),
              };
            }
            if (member.id === 'aarav') {
              return {
                ...member,
                coordinate: moveToward(member.coordinate, current.destination, 0.07),
                speedKmh: 32 + Math.round(Math.random() * 4),
              };
            }
            return member;
          }),
        };
      });
    }, 2500);

    return () => clearInterval(timer);
  }, [trip?.isDemo]);

  useEffect(() => {
    if (!trip || trip.isDemo || !deviceId) return undefined;
    const code = trip.code;
    let subscription: Location.LocationSubscription | undefined;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 1000,
          distanceInterval: 4,
        },
        (pos) => {
          const speedKmh = Math.max(0, (pos.coords.speed ?? 0) * 3.6);
          if (speedKmh >= 4) {
            stoppedAtRef.current = null;
          } else if (!stoppedAtRef.current) {
            stoppedAtRef.current = Date.now();
          }
          const coordinate = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          };
          pendingSamplesRef.current.push({
            recordedAt: new Date().toISOString(),
            lat: coordinate.latitude,
            lng: coordinate.longitude,
            altitudeM: pos.coords.altitude,
            accuracyM: pos.coords.accuracy,
            speedKmh,
            heading: pos.coords.heading ?? 0,
            stopped: speedKmh < 4,
          });
          const now = Date.now();
          if (
            pendingSamplesRef.current.length >= 25 ||
            now - lastSampleFlushRef.current >= 30_000
          ) {
            void flushSamples(code, deviceId);
          }
          if (now - lastLivePublishRef.current >= 3_000) {
            lastLivePublishRef.current = now;
            publishLiveLocation({
              code,
              deviceId,
              coordinate,
              heading: pos.coords.heading ?? 0,
              speedKmh,
              stoppedAt: stoppedAtRef.current,
            }).catch(() => undefined);
          }
        },
      );
    })();

    return () => {
      subscription?.remove();
    };
  }, [trip?.code, trip?.isDemo, deviceId, flushSamples]);

  const startDemo = useCallback(() => {
    void detachLive();
    const next = createDemoTrip();
    setTrip(next);
    setSelectedId('john');
    const origin = next.members.find((member) => member.isYou)?.coordinate;
    if (!origin) return;
    void fetchDrivingRoute([
      origin,
      ...next.pitStops.map((stop) => stop.coordinate),
      next.destination,
    ]).then((route) => {
      if (route.length === 0) return;
      setTrip((current) => (current?.id === next.id ? { ...current, route } : current));
    });
  }, [detachLive]);

  const rememberName = useCallback(async (name: string) => {
    const trimmed = name.trim();
    displayNameRef.current = trimmed;
    setSavedName(trimmed);
    await saveName(trimmed);
    return trimmed;
  }, []);

  const startTrip = useCallback(async (rawName: string, draft: RideDraft): Promise<Result> => {
    if (!deviceId) {
      return { ok: false, message: 'Still setting up this phone. Try again in a moment.' };
    }
    if (!isFirebaseConfigured()) {
      return {
        ok: false,
        message: 'Live trips need a Firebase project. Add keys to .env, then restart Expo.',
      };
    }
    const name = await rememberName(rawName);
    if (!name) {
      return { ok: false, message: 'Add your name so your crew can see you.' };
    }
    const destinationName = draft.destinationName.trim();
    if (!destinationName) {
      return { ok: false, message: 'Add a destination so the crew knows where you are heading.' };
    }

    let coordinate = PUNE;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        coordinate = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
      }
    } catch {
      // Keep the fallback so the trip still opens.
    }

    const destination = draft.destinationCoordinate
      ? { name: destinationName, ...draft.destinationCoordinate }
      : await geocodePlace(destinationName, coordinate);
    const pitStops: PitStop[] = [];
    for (const [index, stop] of draft.pitStops.entries()) {
      const trimmed = stop.name.trim();
      if (!trimmed) continue;
      const place = stop.coordinate
        ? { name: trimmed, ...stop.coordinate }
        : await geocodePlace(trimmed, destination);
      pitStops.push({
        id: `pit-${index + 1}`,
        name: place.name,
        coordinate: { latitude: place.latitude, longitude: place.longitude },
      });
    }

    const route = await fetchDrivingRoute([
      coordinate,
      ...pitStops.map((stop) => stop.coordinate),
      destination,
    ]);

    const code = makeTripCode();
    try {
      await createLiveTrip({
        code,
        deviceId,
        name,
        coordinate,
        destination,
        pitStops,
        route,
      });
    } catch {
      return {
        ok: false,
        message: 'Could not create a live trip. Check Firebase keys, Realtime Database, and rules.',
      };
    }
    void archiveCreateRide({
      code,
      deviceId,
      displayName: name,
      phone: accountPhone,
      destination,
      start: coordinate,
      pitStops,
      route,
    });
    setTrip(localLiveTrip(code, deviceId, coordinate, destination, pitStops, [...CREATOR_ROLES], route));
    attachLive(code, deviceId);
    setSelectedId(null);
    return { ok: true };
  }, [accountPhone, attachLive, deviceId, rememberName]);

  const joinTrip = useCallback(async (rawCode: string, rawName: string): Promise<Result> => {
    const code = normalizeCode(rawCode);
    if (!code) {
      return { ok: false, message: 'Enter a 6-character trip code.' };
    }
    if (code === DEMO_CODE || code === 'DEMO' || code === 'RALLY') {
      startDemo();
      return { ok: true };
    }
    if (!deviceId) {
      return { ok: false, message: 'Still setting up this phone. Try again in a moment.' };
    }
    if (!isFirebaseConfigured()) {
      return {
        ok: false,
        message: 'Live join needs Firebase. Demo code PITSTP still works.',
      };
    }
    const name = await rememberName(rawName);
    if (!name) {
      return { ok: false, message: 'Add your name so the host can see you.' };
    }

    let coordinate = PUNE;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        coordinate = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
      }
    } catch {
      // Join with fallback coords; GPS watch will correct it.
    }

    let result: Result;
    try {
      result = await joinLiveTrip({ code, deviceId, name, coordinate });
    } catch {
      return {
        ok: false,
        message: 'Could not join that trip. Check the code and your Firebase setup.',
      };
    }
    if (!result.ok) return result;
    void archiveJoinRide({ code, deviceId, displayName: name, phone: accountPhone });
    setTrip(
      localLiveTrip(
        code,
        deviceId,
        coordinate,
        { name: 'Shared trip', ...coordinate },
        [],
        [...JOINER_ROLES],
        [],
      ),
    );
    attachLive(code, deviceId);
    setSelectedId(null);
    return { ok: true };
  }, [accountPhone, attachLive, deviceId, rememberName, startDemo]);

  const endTrip = useCallback(() => {
    const code = liveCodeRef.current;
    const id = deviceId;
    const you = trip?.members.find((member) => member.id === id);
    const asAdmin = Boolean(
      you && (you.roleIds.includes('admin') || you.roleIds.includes('head_marshal')),
    );
    const leftover = pendingSamplesRef.current;
    pendingSamplesRef.current = [];
    void detachLive();
    setTrip(null);
    setSelectedId(null);
    if (code && id) {
      void (async () => {
        if (leftover.length > 0) {
          await archiveSamples({ code, deviceId: id, samples: leftover });
        }
        await archiveLeaveRide(code, id, asAdmin);
      })();
    }
  }, [detachLive, deviceId, trip]);

  const setMemberRole = useCallback(async (memberId: string, role: RoleId): Promise<Result> => {
    const current = trip;
    if (!current || !deviceId) {
      return { ok: false, message: 'No live trip to update.' };
    }
    const you = current.members.find((member) => member.id === deviceId);
    if (!you || !(you.roleIds.includes('admin') || you.roleIds.includes('head_marshal'))) {
      return { ok: false, message: 'Only the head marshal can change roles.' };
    }
    if (memberId === current.createdBy) {
      return { ok: false, message: 'The ride admin keeps head marshal.' };
    }
    const target = current.members.find((member) => member.id === memberId);
    if (!target) {
      return { ok: false, message: 'That rider is no longer on this trip.' };
    }
    const nextRoles = applyAssignableRole(target.roleIds, role);
    if (current.isDemo) {
      setTrip({
        ...current,
        members: current.members.map((member) =>
          member.id === memberId ? { ...member, roleIds: nextRoles } : member,
        ),
      });
      return { ok: true };
    }
    try {
      await setLiveMemberRoles({ code: current.code, memberId, roles: nextRoles });
    } catch {
      return { ok: false, message: 'Could not update that role. Try again.' };
    }
    return { ok: true };
  }, [deviceId, trip]);

  const value = useMemo(
    () => ({
      trip,
      selectedId,
      savedName,
      liveReady: isFirebaseConfigured(),
      startDemo,
      startTrip,
      joinTrip,
      endTrip,
      setMemberRole,
      selectMember: setSelectedId,
    }),
    [trip, selectedId, savedName, startDemo, startTrip, joinTrip, endTrip, setMemberRole],
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

function localLiveTrip(
  code: string,
  deviceId: string,
  coordinate: { latitude: number; longitude: number },
  destination: { name: string; latitude: number; longitude: number },
  pitStops: PitStop[],
  roles: RoleId[] = [...CREATOR_ROLES],
  route: { latitude: number; longitude: number }[] = [],
): Trip {
  return {
    id: `trip-${code}`,
    code,
    isDemo: false,
    createdBy: deviceId,
    destination,
    pitStops,
    route,
    members: [
      {
        id: deviceId,
        name: 'You',
        initials: 'YO',
        color: colorFromId(deviceId),
        isYou: true,
        roleIds: roles,
        coordinate,
        heading: 0,
        speedKmh: 0,
      },
    ],
  };
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) {
    throw new Error('useTrip must be used inside TripProvider');
  }
  return ctx;
}
