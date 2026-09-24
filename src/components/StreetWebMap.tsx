import React, { useEffect, useMemo, useRef } from 'react';
import { WebView } from 'react-native-webview';

import { inferStatus, statusChipText } from '../lib/status';
import { rideFitPoints, tripStartCoordinate } from '../lib/geo';
import type { Trip } from '../types';

type Props = {
  trip: Trip;
  selectedId: string | null;
  onSelect: (id: string) => void;
  width: number;
  height: number;
  fitNonce: number;
  cameraMode: 'overview' | 'follow';
};

const PAGE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; background: #cfd8dc; }
    .dot {
      width: 16px; height: 16px; border-radius: 50%;
      border: 2px solid #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,.4);
    }
    .dot.you {
      box-shadow: 0 0 0 3px rgba(232,162,58,.7), 0 1px 4px rgba(0,0,0,.35);
    }
    .dot.selected {
      width: 20px; height: 20px;
      border-width: 3px;
    }
    .pointer {
      position: relative;
      width: 26px;
      height: 36px;
    }
    .pointer .head {
      width: 22px; height: 22px;
      margin: 0 auto;
      border: 2px solid #fff;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 2px 6px rgba(0,0,0,.35);
    }
    .pointer.start .head { background: #E8A23A; }
    .pointer.dest .head { background: #2F8F7B; }
    .pointer.pit .head { background: #0E141B; }
    .pointer .glyph {
      position: absolute; left: 0; right: 0; top: 5px;
      text-align: center;
      color: #fff; font: 700 9px/1 sans-serif;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    window.__queued = null;
    window.__last = null;
    window.render = function (payload) { window.__queued = payload; };
    window.fitToRide = function () {};
    function esc(value) {
      return String(value).replace(/[&<>"']/g, function (ch) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
      });
    }

    function boot(tries) {
      if (typeof L === 'undefined') {
        if (tries < 40) setTimeout(function () { boot(tries + 1); }, 100);
        return;
      }
      const map = L.map('map', {
        zoomControl: true,
        attributionControl: true,
        minZoom: 4,
        maxZoom: 19
      });
      L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
        subdomains: 'abc',
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);
      map.setView([18.52, 73.86], 13);
      const layer = L.layerGroup().addTo(map);
      const stopsLayer = L.layerGroup().addTo(map);
      let routeLine = null;
      let routeKey = '';
      let didInitialFit = false;
      let hadRoute = false;
      const markers = {};

      function collectFitPoints(payload) {
        if (payload.fit && payload.fit.length) {
          return payload.fit.map(function (point) { return [point.lat, point.lng]; });
        }
        const pts = [];
        (payload.members || []).forEach(function (m) { pts.push([m.lat, m.lng]); });
        (payload.stops || []).forEach(function (stop) { pts.push([stop.lat, stop.lng]); });
        return pts.filter(function (pt) {
          return isFinite(pt[0]) && isFinite(pt[1]);
        });
      }

      window.fitToRide = function () {
        const payload = window.__last;
        if (!payload) return;
        const pts = collectFitPoints(payload);
        if (pts.length === 1) map.setView(pts[0], 15);
        else if (pts.length > 1) {
          map.fitBounds(pts, { padding: [72, 72], maxZoom: 16 });
        }
      };

      window.render = function (payload) {
        window.__last = payload;
        const members = payload.members || [];
        const stops = payload.stops || [];
        const route = payload.route;
        const seen = {};
        members.forEach(function (m) {
          seen[m.id] = true;
          const latlng = [m.lat, m.lng];
          const klass = 'dot' + (m.you ? ' you' : '') + (m.selected ? ' selected' : '');
          const size = m.selected ? 20 : 16;
          const html = '<div class="' + klass + '" style="background:' + m.color + '"></div>';
          const icon = L.divIcon({
            className: '',
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
            html: html
          });
          if (markers[m.id]) {
            markers[m.id].setLatLng(latlng);
            markers[m.id].setIcon(icon);
          } else {
            const marker = L.marker(latlng, { icon: icon, zIndexOffset: 600 }).addTo(layer);
            marker.on('click', function () {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'select', id: m.id }));
              }
            });
            markers[m.id] = marker;
          }
        });
        Object.keys(markers).forEach(function (id) {
          if (!seen[id]) {
            layer.removeLayer(markers[id]);
            delete markers[id];
          }
        });
        stopsLayer.clearLayers();
        stops.forEach(function (stop) {
          const glyph = stop.kind === 'start' ? 'S' : stop.kind === 'destination' ? 'D' : esc(stop.name).slice(0, 1);
          const html = '<div class="pointer ' + stop.kind + '"><div class="head"></div><div class="glyph">' + glyph + '</div></div>';
          L.marker([stop.lat, stop.lng], {
            icon: L.divIcon({ className: '', iconSize: [26, 36], iconAnchor: [13, 34], html: html }),
            interactive: false,
            zIndexOffset: 200
          }).addTo(stopsLayer);
        });
        const route = payload.route;
        if (Array.isArray(route)) {
          const nextKey = String(route.length) + ':' + (route[0] ? route[0].lat + ',' + route[0].lng : '') + ':' + (route[route.length - 1] ? route[route.length - 1].lat + ',' + route[route.length - 1].lng : '');
          if (nextKey !== routeKey) {
            routeKey = nextKey;
            if (routeLine) {
              map.removeLayer(routeLine);
              routeLine = null;
            }
            if (route.length >= 2) {
              routeLine = L.polyline(route.map(function (point) { return [point.lat, point.lng]; }), {
                color: '#C47B12',
                weight: 5,
                opacity: 0.92,
                lineJoin: 'round',
                lineCap: 'round'
              }).addTo(map);
            }
          }
        }
        if (payload.camera === 'follow' && payload.you) {
          map.setView([payload.you.lat, payload.you.lng], 16, { animate: true });
          return;
        }
        if (!didInitialFit && (members.length || (Array.isArray(route) && route.length) || routeLine)) {
          didInitialFit = true;
          window.fitToRide();
        } else if (Array.isArray(route) && route.length >= 2 && !hadRoute) {
          hadRoute = true;
          window.fitToRide();
        }
      };

      function onMsg(event) {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (data && data.type === 'members') window.render(data);
          if (data && data.type === 'fit') window.fitToRide();
        } catch (e) {}
      }
      document.addEventListener('message', onMsg);
      window.addEventListener('message', onMsg);
      if (window.__queued) window.render(window.__queued);
    }
    boot(0);
  </script>
</body>
</html>`;

export function StreetWebMap({ trip, selectedId, onSelect, width, height, fitNonce, cameraMode }: Props) {
  const webRef = useRef<WebView>(null);
  const loaded = useRef(false);
  const start = tripStartCoordinate(trip);
  const you = trip.members.find((member) => member.isYou) ?? trip.members[0];
  const routeSig = `${trip.route.length}:${trip.route[0]?.latitude}:${trip.route[trip.route.length - 1]?.longitude}`;
  const lastRouteSig = useRef('');

  const payload = useMemo(() => {
    const includeRoute = lastRouteSig.current !== routeSig;
    if (includeRoute) lastRouteSig.current = routeSig;
    return JSON.stringify({
        type: 'members',
        camera: cameraMode,
        you: you
          ? { lat: you.coordinate.latitude, lng: you.coordinate.longitude }
          : null,
        members: trip.members.map((member) => ({
          id: member.id,
          name: member.name,
          initials: member.initials,
          color: member.color,
          you: Boolean(member.isYou),
          selected: member.id === selectedId,
          lat: member.coordinate.latitude,
          lng: member.coordinate.longitude,
          status: statusChipText(inferStatus(member)),
        })),
        stops: [
          {
            id: 'start',
            name: 'Start',
            lat: start.latitude,
            lng: start.longitude,
            kind: 'start',
          },
          {
            id: 'destination',
            name: trip.destination.name,
            lat: trip.destination.latitude,
            lng: trip.destination.longitude,
            kind: 'destination',
          },
          ...trip.pitStops.map((stop, index) => ({
            id: stop.id,
            name: String(index + 1),
            lat: stop.coordinate.latitude,
            lng: stop.coordinate.longitude,
            kind: 'pit',
          })),
        ],
        route: includeRoute
          ? trip.route.map((point) => ({
              lat: point.latitude,
              lng: point.longitude,
            }))
          : null,
        fit: rideFitPoints(trip).map((point) => ({
          lat: point.latitude,
          lng: point.longitude,
        })),
      });
  }, [trip, selectedId, start, cameraMode, you, routeSig]);

  const pushMembers = () => {
    webRef.current?.injectJavaScript(`render(${payload}); true;`);
  };

  useEffect(() => {
    if (loaded.current) pushMembers();
  }, [payload]);

  useEffect(() => {
    if (!loaded.current || fitNonce === 0) return;
    webRef.current?.injectJavaScript('window.fitToRide && window.fitToRide(); true;');
  }, [fitNonce]);

  return (
    <WebView
      ref={webRef}
      originWhitelist={['*']}
      source={{ html: PAGE, baseUrl: 'https://cdn.jsdelivr.net/' }}
      style={{ width, height, opacity: 0.99, backgroundColor: '#CFD8DC' }}
      javaScriptEnabled
      domStorageEnabled
      mixedContentMode="always"
      setSupportMultipleWindows={false}
      androidLayerType="hardware"
      userAgent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
      onLoadEnd={() => {
        loaded.current = true;
        pushMembers();
      }}
      onMessage={(event) => {
        try {
          const data = JSON.parse(event.nativeEvent.data) as { type?: string; id?: string };
          if (data.type === 'select' && data.id) onSelect(data.id);
        } catch {
          // Ignore unrelated messages.
        }
      }}
    />
  );
}
