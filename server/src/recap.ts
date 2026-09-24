import type { PoolClient } from 'pg';

import { decodeRoute, haversineKm, routeKmAt, routeLengthKm } from './geo.js';

const MOVE_KMH = 4;
const MAX_SPEED_KMH = 180;
const HYSTERESIS_KM = 0.025;
const FINISH_RATIO = 0.98;

type SampleRow = {
  rider_id: string;
  recorded_at: Date;
  lat: number;
  lng: number;
  altitude_m: number | null;
  speed_kmh: number | null;
  route_km: number | null;
  stopped: boolean;
};

type MemberRow = {
  id: string;
  rider_id: string;
};

function num(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function riderStats(samples: SampleRow[]) {
  if (samples.length === 0) {
    return {
      elapsed_s: 0,
      moving_s: 0,
      stopped_s: 0,
      distance_km: 0,
      avg_speed_kmh: 0,
      avg_moving_speed_kmh: 0,
      top_speed_kmh: 0,
      elevation_gain_m: 0,
      min_alt: null as number | null,
      max_alt: null as number | null,
    };
  }

  const start = samples[0].recorded_at.getTime();
  const end = samples[samples.length - 1].recorded_at.getTime();
  const elapsed_s = Math.max(0, Math.round((end - start) / 1000));
  let distance_km = 0;
  let moving_s = 0;
  let top = 0;
  let gain = 0;
  let minAlt: number | null = null;
  let maxAlt: number | null = null;

  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1];
    const cur = samples[i];
    const dt = (cur.recorded_at.getTime() - prev.recorded_at.getTime()) / 1000;
    if (dt <= 0 || dt > 120) continue;
    const d = haversineKm({ lat: prev.lat, lng: prev.lng }, { lat: cur.lat, lng: cur.lng });
    const implied = (d / dt) * 3600;
    if (implied > MAX_SPEED_KMH) continue;
    distance_km += d;
    const speed = Math.min(cur.speed_kmh ?? implied, MAX_SPEED_KMH);
    if (speed > top) top = speed;
    const moving = !cur.stopped && (speed >= MOVE_KMH || implied >= MOVE_KMH);
    if (moving) moving_s += dt;
    if (prev.altitude_m != null && cur.altitude_m != null) {
      const dh = cur.altitude_m - prev.altitude_m;
      if (dh > 0.5 && dh < 40 && d < 0.2) gain += dh;
      minAlt = minAlt == null ? cur.altitude_m : Math.min(minAlt, cur.altitude_m);
      maxAlt = maxAlt == null ? cur.altitude_m : Math.max(maxAlt, cur.altitude_m);
    }
  }

  const movingRounded = Math.round(moving_s);
  const stopped_s = Math.max(0, elapsed_s - movingRounded);
  const hoursMoving = movingRounded / 3600;
  const hoursElapsed = elapsed_s / 3600;

  return {
    elapsed_s,
    moving_s: movingRounded,
    stopped_s,
    distance_km: num(distance_km),
    avg_speed_kmh: hoursElapsed > 0 ? num(distance_km / hoursElapsed) : 0,
    avg_moving_speed_kmh: hoursMoving > 0 ? num(distance_km / hoursMoving) : 0,
    top_speed_kmh: num(top),
    elevation_gain_m: num(gain, 1),
    min_alt: minAlt,
    max_alt: maxAlt,
  };
}

function interpolateKm(samples: SampleRow[], at: number): number | null {
  if (samples.length === 0) return null;
  if (at <= samples[0].recorded_at.getTime()) return samples[0].route_km;
  const last = samples[samples.length - 1];
  if (at >= last.recorded_at.getTime()) return last.route_km;
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    const t0 = a.recorded_at.getTime();
    const t1 = b.recorded_at.getTime();
    if (at < t0 || at > t1 || a.route_km == null || b.route_km == null) continue;
    const u = t1 === t0 ? 0 : (at - t0) / (t1 - t0);
    return a.route_km + (b.route_km - a.route_km) * u;
  }
  return null;
}

export async function finalizeRide(client: PoolClient, rideId: string) {
  const rideRes = await client.query<{
    id: string;
    started_at: Date | null;
    route_polyline: string | null;
  }>(
    `SELECT id, started_at, route_polyline FROM rides WHERE id = $1 FOR UPDATE`,
    [rideId],
  );
  const ride = rideRes.rows[0];
  if (!ride) return;

  const membersRes = await client.query<MemberRow>(
    `SELECT id, rider_id FROM ride_members WHERE ride_id = $1`,
    [rideId],
  );
  const samplesRes = await client.query<SampleRow>(
    `SELECT rider_id, recorded_at, lat, lng, altitude_m, speed_kmh, route_km, stopped
     FROM ride_samples
     WHERE ride_id = $1
     ORDER BY rider_id, recorded_at`,
    [rideId],
  );

  const decodedLine = decodeRoute(ride.route_polyline);
  const totalRouteKm = routeLengthKm(decodedLine);

  const byRider = new Map<string, SampleRow[]>();
  for (const sample of samplesRes.rows) {
    const withKm =
      sample.route_km == null && decodedLine.length > 1
        ? { ...sample, route_km: routeKmAt({ lat: sample.lat, lng: sample.lng }, decodedLine) }
        : sample;
    const list = byRider.get(sample.rider_id) ?? [];
    list.push(withKm);
    byRider.set(sample.rider_id, list);
  }

  await client.query(`DELETE FROM ride_overtakes WHERE ride_id = $1`, [rideId]);
  await client.query(
    `DELETE FROM ride_member_tags
     WHERE ride_member_id IN (SELECT id FROM ride_members WHERE ride_id = $1)`,
    [rideId],
  );

  const memberStats = membersRes.rows.map((member) => {
    const samples = byRider.get(member.rider_id) ?? [];
    const stats = riderStats(samples);
    const last = samples[samples.length - 1];
    const finishKm = last?.route_km ?? 0;
    const finished =
      totalRouteKm > 0.2 && finishKm >= totalRouteKm * FINISH_RATIO ? last.recorded_at : null;
    return { member, samples, stats, finished, last };
  });

  const finishers = memberStats
    .filter((row) => row.finished)
    .sort((a, b) => (a.finished as Date).getTime() - (b.finished as Date).getTime());

  let maxSpread = 0;
  const times = new Set<number>();
  for (const samples of byRider.values()) {
    for (const sample of samples) times.add(sample.recorded_at.getTime());
  }
  const sortedTimes = [...times].sort((a, b) => a - b);
  for (const t of sortedTimes) {
    const kms: number[] = [];
    for (const samples of byRider.values()) {
      const km = interpolateKm(samples, t);
      if (km != null) kms.push(km);
    }
    if (kms.length >= 2) {
      maxSpread = Math.max(maxSpread, Math.max(...kms) - Math.min(...kms));
    }
  }

  const riderIds = membersRes.rows.map((m) => m.rider_id);
  for (let i = 0; i < riderIds.length; i += 1) {
    for (let j = i + 1; j < riderIds.length; j += 1) {
      const aId = riderIds[i];
      const bId = riderIds[j];
      const aSamples = byRider.get(aId) ?? [];
      const bSamples = byRider.get(bId) ?? [];
      let aAhead: boolean | null = null;
      for (const t of sortedTimes) {
        const aKm = interpolateKm(aSamples, t);
        const bKm = interpolateKm(bSamples, t);
        if (aKm == null || bKm == null) continue;
        const delta = aKm - bKm;
        if (Math.abs(delta) < HYSTERESIS_KM) continue;
        const nowAhead = delta > 0;
        if (aAhead === false && nowAhead) {
          const aSpeed = aSamples.find((s) => s.recorded_at.getTime() === t)?.speed_kmh ?? null;
          const bSpeed = bSamples.find((s) => s.recorded_at.getTime() === t)?.speed_kmh ?? null;
          await client.query(
            `INSERT INTO ride_overtakes
              (ride_id, passer_id, passed_id, at, route_km, passer_speed_kmh, passed_speed_kmh)
             VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), $5, $6, $7)`,
            [rideId, aId, bId, t, num(aKm, 3), aSpeed, bSpeed],
          );
        } else if (aAhead === true && !nowAhead) {
          await client.query(
            `INSERT INTO ride_overtakes
              (ride_id, passer_id, passed_id, at, route_km, passer_speed_kmh, passed_speed_kmh)
             VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), $5, $6, $7)`,
            [rideId, bId, aId, t, num(bKm, 3), null, null],
          );
        }
        aAhead = nowAhead;
      }
    }
  }

  const overtakesRes = await client.query<{ passer_id: string; passed_id: string }>(
    `SELECT passer_id, passed_id FROM ride_overtakes WHERE ride_id = $1`,
    [rideId],
  );
  const overtakes = new Map<string, number>();
  const overtaken = new Map<string, number>();
  for (const row of overtakesRes.rows) {
    overtakes.set(row.passer_id, (overtakes.get(row.passer_id) ?? 0) + 1);
    overtaken.set(row.passed_id, (overtaken.get(row.passed_id) ?? 0) + 1);
  }

  let groupDistance = 0;
  let groupMoving = 0;
  let groupElapsed = 0;
  let groupStopped = 0;
  let topGroup = 0;
  let elevGain = 0;
  let elevLoss = 0;
  let minAlt: number | null = null;
  let maxAlt: number | null = null;
  let startLat: number | null = null;
  let startLng: number | null = null;
  let endLat: number | null = null;
  let endLng: number | null = null;

  for (const row of memberStats) {
    const rank = row.finished
      ? finishers.findIndex((item) => item.member.rider_id === row.member.rider_id) + 1
      : null;
    const first = row.samples[0];
    const last = row.last;
    if (first && startLat == null) {
      startLat = first.lat;
      startLng = first.lng;
    }
    if (last) {
      endLat = last.lat;
      endLng = last.lng;
    }
    groupDistance = Math.max(groupDistance, row.stats.distance_km);
    groupMoving = Math.max(groupMoving, row.stats.moving_s);
    groupElapsed = Math.max(groupElapsed, row.stats.elapsed_s);
    groupStopped = Math.max(groupStopped, row.stats.stopped_s);
    topGroup = Math.max(topGroup, row.stats.top_speed_kmh);
    elevGain = Math.max(elevGain, row.stats.elevation_gain_m);
    if (row.stats.min_alt != null) {
      minAlt = minAlt == null ? row.stats.min_alt : Math.min(minAlt, row.stats.min_alt);
    }
    if (row.stats.max_alt != null) {
      maxAlt = maxAlt == null ? row.stats.max_alt : Math.max(maxAlt, row.stats.max_alt);
    }

    await client.query(
      `UPDATE ride_members SET
         left_at = COALESCE(left_at, now()),
         finished_at = $2,
         finish_rank = $3,
         elapsed_s = $4,
         moving_s = $5,
         stopped_s = $6,
         distance_km = $7,
         avg_speed_kmh = $8,
         avg_moving_speed_kmh = $9,
         top_speed_kmh = $10,
         elevation_gain_m = $11,
         overtakes = $12,
         times_overtaken = $13,
         samples_count = $14
       WHERE id = $1`,
      [
        row.member.id,
        row.finished,
        rank,
        row.stats.elapsed_s,
        row.stats.moving_s,
        row.stats.stopped_s,
        row.stats.distance_km,
        row.stats.avg_speed_kmh,
        row.stats.avg_moving_speed_kmh,
        row.stats.top_speed_kmh,
        row.stats.elevation_gain_m,
        overtakes.get(row.member.rider_id) ?? 0,
        overtaken.get(row.member.rider_id) ?? 0,
        row.samples.length,
      ],
    );
  }

  if (memberStats.length >= 2) {
    const byOvertakes = [...memberStats].sort(
      (a, b) => (overtakes.get(b.member.rider_id) ?? 0) - (overtakes.get(a.member.rider_id) ?? 0),
    );
    const byFinish = [...finishers].reverse();
    const byStoppedLow = [...memberStats].sort((a, b) => a.stats.stopped_s - b.stats.stopped_s);
    const byStoppedHigh = [...memberStats].sort((a, b) => b.stats.stopped_s - a.stats.stopped_s);
    const bySpeed = [...memberStats].sort((a, b) => b.stats.top_speed_kmh - a.stats.top_speed_kmh);

    const tags: Array<{ memberId: string; tag: string }> = [];
    if ((overtakes.get(byOvertakes[0].member.rider_id) ?? 0) > 0) {
      tags.push({ memberId: byOvertakes[0].member.id, tag: 'aggressive_rider' });
    }
    if (byFinish[0]) tags.push({ memberId: byFinish[0].member.id, tag: 'lantern_rouge' });
    tags.push({ memberId: byStoppedLow[0].member.id, tag: 'smooth_operator' });
    if (byStoppedHigh[0].stats.stopped_s > 60) {
      tags.push({ memberId: byStoppedHigh[0].member.id, tag: 'pit_king' });
    }
    if (bySpeed[0].stats.top_speed_kmh > 0) {
      tags.push({ memberId: bySpeed[0].member.id, tag: 'rabbit' });
    }
    for (const tag of tags) {
      await client.query(
        `INSERT INTO ride_member_tags (ride_member_id, tag_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [tag.memberId, tag.tag],
      );
    }
  }

  const pitCountRes = await client.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM ride_waypoints WHERE ride_id = $1 AND kind = 'pit'`,
    [rideId],
  );

  await client.query(
    `UPDATE rides SET
       status = 'ended',
       ended_at = COALESCE(ended_at, now()),
       start_lat = COALESCE(start_lat, $2),
       start_lng = COALESCE(start_lng, $3),
       end_lat = $4,
       end_lng = $5,
       elapsed_s = $6,
       moving_s = $7,
       stopped_s = $8,
       distance_km = $9,
       avg_speed_kmh = $10,
       avg_moving_speed_kmh = $11,
       top_group_speed_kmh = $12,
       elevation_gain_m = $13,
       elevation_loss_m = $14,
       min_altitude_m = $15,
       max_altitude_m = $16,
       pit_stop_count = $17,
       max_group_spread_km = $18,
       recap = $19
     WHERE id = $1`,
    [
      rideId,
      startLat,
      startLng,
      endLat,
      endLng,
      groupElapsed,
      groupMoving,
      groupStopped,
      num(groupDistance),
      groupElapsed > 0 ? num(groupDistance / (groupElapsed / 3600)) : 0,
      groupMoving > 0 ? num(groupDistance / (groupMoving / 3600)) : 0,
      num(topGroup),
      num(elevGain, 1),
      num(elevLoss, 1),
      minAlt,
      maxAlt,
      Number(pitCountRes.rows[0]?.n ?? 0),
      num(maxSpread),
      JSON.stringify({ computed_at: new Date().toISOString() }),
    ],
  );
}
