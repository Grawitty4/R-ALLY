import type { RoleId } from './lib/roles';

export type StatusKind = 'en_route' | 'refueling' | 'eating' | 'stopped';

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type Place = {
  name: string;
  address: string;
  types: string[];
};

export type PitStop = {
  id: string;
  name: string;
  coordinate: Coordinate;
};

export type Member = {
  id: string;
  name: string;
  initials: string;
  color: string;
  phone?: string;
  isYou?: boolean;
  roleIds: RoleId[];
  coordinate: Coordinate;
  heading: number;
  speedKmh: number;
  stoppedAt?: number;
  nearbyPlace?: Place;
};

export type Trip = {
  id: string;
  code: string;
  isDemo: boolean;
  createdBy: string;
  destination: { name: string } & Coordinate;
  pitStops: PitStop[];
  route: Coordinate[];
  members: Member[];
};

export type RideDraftStop = {
  name: string;
  coordinate?: Coordinate;
};

export type RideDraft = {
  destinationName: string;
  destinationCoordinate?: Coordinate;
  pitStops: RideDraftStop[];
};

export type DerivedStatus = {
  kind: StatusKind;
  minutesAgo?: number;
};
