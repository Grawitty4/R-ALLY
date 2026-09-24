import { DEMO_CODE } from '../lib/tripCode';
import { CREATOR_ROLES } from '../lib/roles';
import type { Trip } from '../types';

const TWELVE_MIN = 12 * 60 * 1000;

export function createDemoTrip(now = Date.now()): Trip {
  return {
    id: 'demo-pune',
    code: DEMO_CODE,
    isDemo: true,
    createdBy: 'you',
    destination: {
      name: 'Lonavala',
      latitude: 18.7481,
      longitude: 73.4072,
    },
    pitStops: [
      {
        id: 'pit-1',
        name: 'Mulshi viewpoint',
        coordinate: { latitude: 18.5094, longitude: 73.5165 },
      },
    ],
    route: [],
    members: [
      {
        id: 'you',
        name: 'You',
        initials: 'YO',
        color: '#1A242F',
        isYou: true,
        roleIds: [...CREATOR_ROLES],
        coordinate: { latitude: 18.5314, longitude: 73.8478 },
        heading: 310,
        speedKmh: 38,
      },
      {
        id: 'john',
        name: 'John',
        initials: 'JO',
        color: '#C47B12',
        phone: '+919876543210',
        roleIds: ['marshal'],
        coordinate: { latitude: 18.5596, longitude: 73.807 },
        heading: 0,
        speedKmh: 0,
        stoppedAt: now - TWELVE_MIN,
        nearbyPlace: {
          name: 'Shell',
          address: 'Baner Road, Pune, Maharashtra 411045',
          types: ['gas_station', 'point_of_interest'],
        },
      },
      {
        id: 'priya',
        name: 'Priya',
        initials: 'PR',
        color: '#2F8F7B',
        phone: '+919811122233',
        roleIds: ['rider'],
        coordinate: { latitude: 18.575, longitude: 73.78 },
        heading: 300,
        speedKmh: 46,
      },
      {
        id: 'aarav',
        name: 'Aarav',
        initials: 'AR',
        color: '#3D5A80',
        phone: '+919700011122',
        roleIds: ['rider'],
        coordinate: { latitude: 18.5204, longitude: 73.8567 },
        heading: 315,
        speedKmh: 34,
      },
    ],
  };
}
