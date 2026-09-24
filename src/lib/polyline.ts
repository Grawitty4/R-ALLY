import type { Coordinate } from '../types';

function round(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round(value * factor);
}

export function encodePolyline(points: Coordinate[], precision = 5) {
  let lastLat = 0;
  let lastLng = 0;
  let result = '';

  const emit = (value: number) => {
    let num = value < 0 ? ~(value << 1) : value << 1;
    while (num >= 0x20) {
      result += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
      num >>= 5;
    }
    result += String.fromCharCode(num + 63);
  };

  for (const point of points) {
    const lat = round(point.latitude, precision);
    const lng = round(point.longitude, precision);
    emit(lat - lastLat);
    emit(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return result;
}

export function decodePolyline(encoded: string, precision = 5): Coordinate[] {
  const points: Coordinate[] = [];
  const factor = 10 ** precision;
  let index = 0;
  let lat = 0;
  let lng = 0;

  const next = () => {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push({ latitude: lat / factor, longitude: lng / factor });
  }
  return points;
}
