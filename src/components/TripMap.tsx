import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { boundingRegion, projectToBox, rideFitPoints, tripStartCoordinate } from '../lib/geo';
import { inferStatus, statusChipText } from '../lib/status';
import type { Coordinate, Trip } from '../types';
import { AvatarMarker } from './AvatarMarker';
import { StreetWebMap } from './StreetWebMap';

type Props = {
  trip: Trip;
  selectedId: string | null;
  onSelect: (id: string) => void;
  fitNonce?: number;
  cameraMode?: 'overview' | 'follow';
};

type Size = { width: number; height: number };

function isValidCoord(point: Coordinate) {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

function usableMembers(trip: Trip) {
  return trip.members.filter((member) => isValidCoord(member.coordinate));
}

function CrewCanvas({
  trip,
  selectedId,
  onSelect,
  width,
  height,
}: Props & Size) {
  const members = usableMembers(trip);
  const region =
    members.length > 0
      ? boundingRegion(members.map((member) => member.coordinate))
      : boundingRegion([{ latitude: 18.5204, longitude: 73.8567 }]);

  return (
    <View style={[styles.canvas, { width, height }]}>
      <View style={styles.roadA} />
      <View style={styles.roadB} />
      <View style={styles.legend}>
        <Text style={styles.legendText}>Crew positions</Text>
      </View>
      {members.map((member) => {
        const point = projectToBox(member.coordinate, region, width, height);
        return (
          <Pressable
            key={member.id}
            onPress={() => onSelect(member.id)}
            style={[
              styles.pin,
              {
                left: Math.min(width - 80, Math.max(16, point.x - 75)),
                top: Math.min(height - 180, Math.max(96, point.y - 70)),
              },
            ]}
          >
            <AvatarMarker member={member} selected={member.id === selectedId} />
          </Pressable>
        );
      })}
    </View>
  );
}

class MapErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function RiderDot({ color, selected, you }: { color: string; selected: boolean; you: boolean }) {
  return (
    <View
      style={[
        styles.dot,
        { backgroundColor: color },
        you && styles.dotYou,
        selected && styles.dotSelected,
      ]}
    />
  );
}

function AppleMap({
  trip,
  selectedId,
  onSelect,
  width,
  height,
  fitNonce = 0,
  cameraMode = 'overview',
}: Props & Size) {
  const maps = require('react-native-maps') as typeof import('react-native-maps');
  const MapView = maps.default;
  const Marker = maps.Marker;
  const Polyline = maps.Polyline;
  const mapRef = useRef<InstanceType<typeof MapView> | null>(null);
  const members = usableMembers(trip);
  const start = tripStartCoordinate(trip);
  const region = useMemo(
    () => boundingRegion(rideFitPoints(trip)),
    [trip],
  );

  const you = members.find((member) => member.isYou) ?? members[0];

  const fit = () => {
    const points = rideFitPoints(trip);
    if (points.length === 1) {
      mapRef.current?.animateToRegion(
        {
          ...points[0],
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        },
        350,
      );
      return;
    }
    if (points.length > 1) {
      mapRef.current?.fitToCoordinates(points, {
        edgePadding: { top: 140, right: 48, bottom: 220, left: 48 },
        animated: true,
      });
    }
  };

  useEffect(() => {
    if (cameraMode !== 'follow' || !you) return;
    mapRef.current?.animateToRegion(
      {
        ...you.coordinate,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      },
      280,
    );
  }, [cameraMode, you?.coordinate.latitude, you?.coordinate.longitude]);

  useEffect(() => {
    if (fitNonce === 0 || cameraMode === 'follow') return;
    fit();
  }, [fitNonce, cameraMode]);

  useEffect(() => {
    if (cameraMode === 'follow' || trip.route.length < 2) return;
    fit();
  }, [trip.route.length, cameraMode]);

  return (
    <MapView
      ref={mapRef}
      style={{ width, height }}
      initialRegion={region}
      mapType="standard"
      loadingEnabled
      rotateEnabled={false}
      pitchEnabled={false}
      scrollEnabled
      zoomEnabled
      showsUserLocation={false}
      showsCompass={false}
      showsMyLocationButton={false}
      onMapReady={fit}
    >
      {trip.route.length >= 2 ? (
        <Polyline
          coordinates={trip.route}
          strokeColor="#C47B12"
          strokeWidth={5}
        />
      ) : null}
      <Marker coordinate={start} title="Start" description="Ride start" pinColor="#E8A23A" />
      <Marker
        coordinate={trip.destination}
        title={trip.destination.name}
        description="Destination"
        pinColor="#2F8F7B"
      />
      {trip.pitStops.map((stop, index) => (
        <Marker
          key={stop.id}
          coordinate={stop.coordinate}
          title={stop.name}
          description={`Pit stop ${index + 1}`}
          pinColor="#0E141B"
        />
      ))}
      {members.map((member) => (
        <Marker
          key={member.id}
          coordinate={member.coordinate}
          title={member.name}
          description={statusChipText(inferStatus(member))}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          onPress={() => onSelect(member.id)}
        >
          <RiderDot
            color={member.color}
            selected={member.id === selectedId}
            you={Boolean(member.isYou)}
          />
        </Marker>
      ))}
    </MapView>
  );
}

export function TripMap(props: Props) {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const ready = size.width > 1 && size.height > 1;
  const canvas = ready ? <CrewCanvas {...props} {...size} /> : null;
  const fitNonce = props.fitNonce ?? 0;
  const cameraMode = props.cameraMode ?? 'overview';

  return (
    <View
      style={styles.host}
      onLayout={(event) => {
        const next = event.nativeEvent.layout;
        setSize({ width: next.width, height: next.height });
      }}
    >
      {!ready ? null : Platform.OS === 'web' ? (
        canvas
      ) : Platform.OS === 'android' ? (
        <StreetWebMap {...props} {...size} fitNonce={fitNonce} cameraMode={cameraMode} />
      ) : (
        <MapErrorBoundary fallback={canvas}>
          <AppleMap {...props} {...size} fitNonce={fitNonce} cameraMode={cameraMode} />
        </MapErrorBoundary>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    backgroundColor: '#D7E0D4',
  },
  canvas: {
    backgroundColor: '#D7E0D4',
    overflow: 'hidden',
  },
  legend: {
    position: 'absolute',
    top: 88,
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 3,
  },
  legendText: {
    backgroundColor: 'rgba(14,20,27,0.78)',
    color: '#F6F1E8',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '700',
  },
  roadA: {
    position: 'absolute',
    top: '38%',
    left: '-10%',
    width: '120%',
    height: 18,
    backgroundColor: '#E8DFC8',
    transform: [{ rotate: '-18deg' }],
  },
  roadB: {
    position: 'absolute',
    top: '58%',
    left: '-20%',
    width: '140%',
    height: 12,
    backgroundColor: '#F0E6D0',
    transform: [{ rotate: '12deg' }],
  },
  pin: {
    position: 'absolute',
    zIndex: 2,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  dotYou: {
    shadowColor: '#E8A23A',
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  dotSelected: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
  },
});
