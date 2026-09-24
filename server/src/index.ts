import { createHash, randomInt } from 'node:crypto';
import express from 'express';

import { decodeRoute, encodeRoute, routeKmAt, type LatLng } from './geo.js';
import { pingDb, pool } from './db.js';
import { finalizeRide } from './recap.js';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Device-Id');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});
app.options('*', (_req, res) => res.sendStatus(204));

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function deviceIdFrom(req: express.Request, body?: Record<string, unknown>) {
  return asString(req.header('x-device-id')) || asString(body?.deviceId);
}

async function upsertRider(deviceId: string, displayName: string, phone?: string) {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO riders (device_id, display_name, phone)
     VALUES ($1, $2, $3)
     ON CONFLICT (device_id) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           phone = COALESCE(EXCLUDED.phone, riders.phone),
           updated_at = now()
     RETURNING id`,
    [deviceId, displayName || 'Rider', phone ?? null],
  );
  return result.rows[0].id;
}

function hashOtp(phone: string, code: string) {
  return createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

async function mergeRiderInto(fromId: string, toId: string) {
  if (fromId === toId) return;
  await pool.query(`UPDATE rides SET created_by = $1 WHERE created_by = $2`, [toId, fromId]);
  await pool.query(`UPDATE bikes SET rider_id = $1 WHERE rider_id = $2`, [toId, fromId]);
  await pool.query(
    `DELETE FROM ride_members a
     USING ride_members b
     WHERE a.rider_id = $2 AND b.rider_id = $1 AND a.ride_id = b.ride_id`,
    [toId, fromId],
  );
  await pool.query(`UPDATE ride_members SET rider_id = $1 WHERE rider_id = $2`, [toId, fromId]);
  await pool.query(
    `DELETE FROM ride_samples a
     USING ride_samples b
     WHERE a.rider_id = $2 AND b.rider_id = $1
       AND a.ride_id = b.ride_id AND a.recorded_at = b.recorded_at`,
    [toId, fromId],
  );
  await pool.query(`UPDATE ride_samples SET rider_id = $1 WHERE rider_id = $2`, [toId, fromId]);
  await pool.query(`UPDATE ride_stops SET rider_id = $1 WHERE rider_id = $2`, [toId, fromId]);
  await pool.query(`UPDATE ride_overtakes SET passer_id = $1 WHERE passer_id = $2`, [toId, fromId]);
  await pool.query(`UPDATE ride_overtakes SET passed_id = $1 WHERE passed_id = $2`, [toId, fromId]);
  await pool.query(`UPDATE ride_photos SET rider_id = $1 WHERE rider_id = $2`, [toId, fromId]);
  await pool.query(`DELETE FROM riders WHERE id = $1`, [fromId]);
}

async function linkRider(deviceId: string, displayName: string, phone: string) {
  const byPhone = await pool.query<{ id: string; device_id: string }>(
    `SELECT id, device_id FROM riders WHERE phone = $1`,
    [phone],
  );
  const byDevice = await pool.query<{ id: string; phone: string | null }>(
    `SELECT id, phone FROM riders WHERE device_id = $1`,
    [deviceId],
  );

  let riderId = byPhone.rows[0]?.id;
  if (!riderId && byDevice.rowCount && !byDevice.rows[0].phone) {
    await pool.query(
      `UPDATE riders
       SET phone = $2,
           display_name = COALESCE(NULLIF($3, ''), display_name),
           updated_at = now()
       WHERE id = $1`,
      [byDevice.rows[0].id, phone, displayName],
    );
    return byDevice.rows[0].id;
  }
  if (!riderId) {
    return upsertRider(deviceId, displayName, phone);
  }
  if (byDevice.rowCount && byDevice.rows[0].id !== riderId) {
    await mergeRiderInto(byDevice.rows[0].id, riderId);
  }
  if (byPhone.rows[0].device_id !== deviceId) {
    await pool.query(
      `UPDATE riders
       SET device_id = device_id || '-prev-' || substr(id::text, 1, 8)
       WHERE device_id = $1 AND id <> $2`,
      [deviceId, riderId],
    );
  }
  await pool.query(
    `UPDATE riders
     SET device_id = $1,
         display_name = COALESCE(NULLIF($2, ''), display_name),
         updated_at = now()
     WHERE id = $3`,
    [deviceId, displayName, riderId],
  );
  return riderId;
}

async function sendOtpSms(phone: string, code: string) {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;
  if (!authKey || !templateId) return false;
  const mobile = phone.replace(/^\+/, '');
  const response = await fetch('https://control.msg91.com/api/v5/otp', {
    method: 'POST',
    headers: {
      authkey: authKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template_id: templateId,
      mobile,
      otp: code,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MSG91 ${response.status}: ${text.slice(0, 200)}`);
  }
  return true;
}

app.get('/health', async (_req, res) => {
  try {
    await pingDb();
    res.json({ ok: true, schema: process.env.PG_SCHEMA ?? 'rally' });
  } catch (error) {
    console.error(error);
    res.status(503).json({ ok: false, error: 'database_unavailable' });
  }
});

app.post('/auth/otp/request', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const phone = asString(body.phone);
  if (!/^\+\d{10,15}$/.test(phone)) {
    res.status(400).json({ ok: false, error: 'Enter a valid mobile number.' });
    return;
  }
  const code = String(randomInt(100000, 1000000));
  try {
    await pool.query(
      `INSERT INTO otp_challenges (phone, code_hash, expires_at, attempts)
       VALUES ($1, $2, now() + interval '5 minutes', 0)
       ON CONFLICT (phone) DO UPDATE
         SET code_hash = EXCLUDED.code_hash,
             expires_at = EXCLUDED.expires_at,
             attempts = 0`,
      [phone, hashOtp(phone, code)],
    );
    let sent = false;
    try {
      sent = await sendOtpSms(phone, code);
    } catch (error) {
      console.error(error);
    }
    const echo = process.env.OTP_ECHO === '1';
    if (!sent && !echo) {
      res.status(503).json({
        ok: false,
        error: 'SMS is not configured yet. Set MSG91 keys, or OTP_ECHO=1 to test without SMS.',
      });
      return;
    }
    res.json({ ok: true, sent, ...(echo ? { devCode: code } : {}) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Could not start OTP. Apply server/migrate_otp.sql.' });
  }
});

app.post('/auth/otp/verify', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const phone = asString(body.phone);
  const code = asString(body.code);
  const deviceId = deviceIdFrom(req, body);
  const displayName = asString(body.displayName);
  if (!phone || !/^\d{6}$/.test(code) || !deviceId) {
    res.status(400).json({ ok: false, error: 'Enter the 6-digit code.' });
    return;
  }
  try {
    const row = await pool.query<{ code_hash: string; expires_at: Date; attempts: number }>(
      `SELECT code_hash, expires_at, attempts FROM otp_challenges WHERE phone = $1`,
      [phone],
    );
    if (!row.rowCount) {
      res.status(400).json({ ok: false, error: 'Request a new code.' });
      return;
    }
    const challenge = row.rows[0];
    if (challenge.attempts >= 5) {
      res.status(429).json({ ok: false, error: 'Too many tries. Request a new code.' });
      return;
    }
    if (challenge.expires_at.getTime() < Date.now()) {
      res.status(400).json({ ok: false, error: 'That code expired. Request a new one.' });
      return;
    }
    if (challenge.code_hash !== hashOtp(phone, code)) {
      await pool.query(`UPDATE otp_challenges SET attempts = attempts + 1 WHERE phone = $1`, [phone]);
      res.status(400).json({ ok: false, error: 'That code did not match.' });
      return;
    }
    await linkRider(deviceId, displayName, phone);
    await pool.query(`DELETE FROM otp_challenges WHERE phone = $1`, [phone]);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Could not verify OTP.' });
  }
});

app.get('/me/rides', async (req, res) => {
  const deviceId = deviceIdFrom(req);
  const phone = asString(typeof req.query.phone === 'string' ? req.query.phone : '');
  if (!deviceId) {
    res.status(400).json({ ok: false, error: 'missing_device' });
    return;
  }
  try {
    const result = await pool.query(
      `SELECT ride.code, ride.status, ride.destination_name, ride.started_at, ride.ended_at,
              ride.distance_km, ride.elapsed_s
       FROM ride_members m
       JOIN riders r ON r.id = m.rider_id
       JOIN rides ride ON ride.id = m.ride_id
       WHERE r.device_id = $1 OR ($2 <> '' AND r.phone = $2)
       ORDER BY ride.started_at DESC NULLS LAST
       LIMIT 40`,
      [deviceId, phone],
    );
    res.json({ ok: true, rides: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'history_failed' });
  }
});

app.post('/rides', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const deviceId = deviceIdFrom(req, body);
  const displayName = asString(body.displayName);
  const code = asString(body.code).toUpperCase();
  const destination = (body.destination ?? {}) as Record<string, unknown>;
  const destName = asString(destination.name);
  const destLat = asNumber(destination.latitude ?? destination.lat);
  const destLng = asNumber(destination.longitude ?? destination.lng);
  const start = (body.start ?? {}) as Record<string, unknown>;
  const startLat = asNumber(start.latitude ?? start.lat);
  const startLng = asNumber(start.longitude ?? start.lng);
  const color = asString(body.color) || null;
  const timezone = asString(body.timezone) || null;

  const phone = asString(body.phone);
  if (!deviceId || !phone || code.length < 4 || !destName || destLat == null || destLng == null) {
    res.status(400).json({ ok: false, error: 'invalid_ride' });
    return;
  }

  const pitStops = Array.isArray(body.pitStops) ? body.pitStops : [];
  const route = Array.isArray(body.route)
    ? (body.route as Record<string, unknown>[])
        .map((p) => ({
          lat: asNumber(p.latitude ?? p.lat) ?? NaN,
          lng: asNumber(p.longitude ?? p.lng) ?? NaN,
        }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    : [];

  const client = await pool.connect();
  try {
    const riderId = await linkRider(deviceId, displayName || 'Rider', phone);
    await client.query('BEGIN');

    const ride = (
      await client.query<{ id: string }>(
        `INSERT INTO rides (
           code, created_by, status, destination_name, destination_lat, destination_lng,
           start_name, start_lat, start_lng, started_at, timezone, firebase_path, route_polyline
         ) VALUES ($1, $2, 'live', $3, $4, $5, $6, $7, $8, now(), $9, $10, $11)
         RETURNING id`,
        [
          code,
          riderId,
          destName,
          destLat,
          destLng,
          asString(start.name) || null,
          startLat,
          startLng,
          timezone,
          `trips/${code}`,
          route.length ? encodeRoute(route) : null,
        ],
      )
    ).rows[0];

    let seq = 0;
    if (startLat != null && startLng != null) {
      await client.query(
        `INSERT INTO ride_waypoints (ride_id, kind, seq, name, lat, lng)
         VALUES ($1, 'start', $2, $3, $4, $5)`,
        [ride.id, seq, asString(start.name) || 'Start', startLat, startLng],
      );
      seq += 1;
    }
    for (const stop of pitStops) {
      const row = stop as Record<string, unknown>;
      const lat = asNumber(row.latitude ?? row.lat);
      const lng = asNumber(row.longitude ?? row.lng);
      const name = asString(row.name);
      if (lat == null || lng == null || !name) continue;
      await client.query(
        `INSERT INTO ride_waypoints (ride_id, kind, seq, name, lat, lng)
         VALUES ($1, 'pit', $2, $3, $4, $5)`,
        [ride.id, seq, name, lat, lng],
      );
      seq += 1;
    }
    await client.query(
      `INSERT INTO ride_waypoints (ride_id, kind, seq, name, lat, lng)
       VALUES ($1, 'destination', $2, $3, $4, $5)`,
      [ride.id, seq, destName, destLat, destLng],
    );

    await client.query(
      `INSERT INTO ride_members (ride_id, rider_id, roles, color)
       VALUES ($1, $2, $3, $4)`,
      [ride.id, riderId, ['admin', 'head_marshal'], color],
    );
    await client.query('COMMIT');
    res.json({ ok: true, rideId: ride.id, code });
  } catch (error) {
    await client.query('ROLLBACK');
    const codeName = (error as { code?: string }).code;
    if (codeName === '23505') {
      res.status(409).json({ ok: false, error: 'code_taken' });
      return;
    }
    console.error(error);
    res.status(500).json({ ok: false, error: 'create_failed' });
  } finally {
    client.release();
  }
});

app.post('/rides/:code/join', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const deviceId = deviceIdFrom(req, body);
  const displayName = asString(body.displayName);
  const color = asString(body.color) || null;
  const code = asString(req.params.code).toUpperCase();
  const phone = asString(body.phone);
  if (!deviceId || !code || !phone) {
    res.status(400).json({ ok: false, error: 'invalid_join' });
    return;
  }

  try {
    const ride = await pool.query<{ id: string; status: string }>(
      `SELECT id, status FROM rides WHERE code = $1`,
      [code],
    );
    if (!ride.rowCount) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    if (ride.rows[0].status === 'ended' || ride.rows[0].status === 'cancelled') {
      res.status(409).json({ ok: false, error: 'ride_closed' });
      return;
    }
    const riderId = await linkRider(deviceId, displayName, phone);
    await pool.query(
      `INSERT INTO ride_members (ride_id, rider_id, roles, color)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (ride_id, rider_id) DO UPDATE
         SET left_at = NULL, color = COALESCE(EXCLUDED.color, ride_members.color)`,
      [ride.rows[0].id, riderId, ['rider'], color],
    );
    res.json({ ok: true, rideId: ride.rows[0].id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'join_failed' });
  }
});

app.post('/rides/:code/samples', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const deviceId = deviceIdFrom(req, body);
  const code = asString(req.params.code).toUpperCase();
  const samples = Array.isArray(body.samples) ? body.samples : [];
  if (!deviceId || !code || samples.length === 0) {
    res.status(400).json({ ok: false, error: 'invalid_samples' });
    return;
  }

  try {
    const ride = await pool.query<{ id: string; route_polyline: string | null; status: string }>(
      `SELECT id, route_polyline, status FROM rides WHERE code = $1`,
      [code],
    );
    if (!ride.rowCount) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    const endedAtOk = ride.rows[0].status !== 'cancelled';
    if (!endedAtOk) {
      res.status(409).json({ ok: false, error: 'ride_closed' });
      return;
    }
    const rider = await pool.query<{ id: string }>(
      `SELECT r.id
       FROM riders r
       JOIN ride_members m ON m.rider_id = r.id
       WHERE r.device_id = $1 AND m.ride_id = $2`,
      [deviceId, ride.rows[0].id],
    );
    if (!rider.rowCount) {
      res.status(403).json({ ok: false, error: 'not_on_ride' });
      return;
    }

    const line = decodeRoute(ride.rows[0].route_polyline);
    const values: unknown[] = [];
    const tuples: string[] = [];
    let i = 1;
    for (const raw of samples) {
      const row = raw as Record<string, unknown>;
      const lat = asNumber(row.lat ?? row.latitude);
      const lng = asNumber(row.lng ?? row.longitude);
      const at = asString(row.recordedAt) || asString(row.recorded_at);
      if (lat == null || lng == null || !at) continue;
      const speed = asNumber(row.speedKmh ?? row.speed_kmh);
      const heading = asNumber(row.heading);
      const altitude = asNumber(row.altitudeM ?? row.altitude_m);
      const accuracy = asNumber(row.accuracyM ?? row.accuracy_m);
      const stopped = Boolean(row.stopped);
      const km = line.length > 1 ? routeKmAt({ lat, lng } as LatLng, line) : null;
      tuples.push(
        `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`,
      );
      values.push(
        ride.rows[0].id,
        rider.rows[0].id,
        at,
        lat,
        lng,
        altitude,
        accuracy,
        speed,
        heading,
        km,
        stopped,
      );
    }
    if (tuples.length === 0) {
      res.json({ ok: true, inserted: 0 });
      return;
    }
    await pool.query(
      `INSERT INTO ride_samples (
         ride_id, rider_id, recorded_at, lat, lng, altitude_m, accuracy_m,
         speed_kmh, heading, route_km, stopped
       ) VALUES ${tuples.join(',')}
       ON CONFLICT (ride_id, rider_id, recorded_at) DO NOTHING`,
      values,
    );
    res.json({ ok: true, inserted: tuples.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'samples_failed' });
  }
});

app.post('/rides/:code/leave', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const deviceId = deviceIdFrom(req, body);
  const code = asString(req.params.code).toUpperCase();
  if (!deviceId || !code) {
    res.status(400).json({ ok: false, error: 'invalid_leave' });
    return;
  }
  try {
    await pool.query(
      `UPDATE ride_members m
       SET left_at = COALESCE(m.left_at, now())
       FROM riders r, rides ride
       WHERE m.rider_id = r.id AND m.ride_id = ride.id
         AND r.device_id = $1 AND ride.code = $2`,
      [deviceId, code],
    );
    const remaining = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n
       FROM ride_members m
       JOIN rides ride ON ride.id = m.ride_id
       WHERE ride.code = $1 AND m.left_at IS NULL`,
      [code],
    );
    if (Number(remaining.rows[0]?.n ?? 1) === 0) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const ride = await client.query<{ id: string }>(
          `SELECT id FROM rides WHERE code = $1 FOR UPDATE`,
          [code],
        );
        if (ride.rowCount) await finalizeRide(client, ride.rows[0].id);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'leave_failed' });
  }
});

app.post('/rides/:code/end', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const deviceId = deviceIdFrom(req, body);
  const code = asString(req.params.code).toUpperCase();
  if (!deviceId || !code) {
    res.status(400).json({ ok: false, error: 'invalid_end' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ride = await client.query<{ id: string }>(
      `SELECT id FROM rides WHERE code = $1 FOR UPDATE`,
      [code],
    );
    if (!ride.rowCount) {
      await client.query('ROLLBACK');
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    const allowed = await client.query(
      `SELECT 1
       FROM ride_members m
       JOIN riders r ON r.id = m.rider_id
       WHERE m.ride_id = $1
         AND r.device_id = $2
         AND m.roles && ARRAY['admin','head_marshal']::text[]`,
      [ride.rows[0].id, deviceId],
    );
    if (!allowed.rowCount) {
      await client.query('ROLLBACK');
      res.status(403).json({ ok: false, error: 'not_allowed' });
      return;
    }
    await finalizeRide(client, ride.rows[0].id);
    await client.query('COMMIT');
    res.json({ ok: true, rideId: ride.rows[0].id });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ ok: false, error: 'end_failed' });
  } finally {
    client.release();
  }
});

app.get('/rides/:code', async (req, res) => {
  const code = asString(req.params.code).toUpperCase();
  try {
    const ride = await pool.query(`SELECT * FROM rides WHERE code = $1`, [code]);
    if (!ride.rowCount) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    const members = await pool.query(
      `SELECT m.*, r.display_name, r.device_id,
              COALESCE(
                (SELECT array_agg(tag_id) FROM ride_member_tags t WHERE t.ride_member_id = m.id),
                ARRAY[]::text[]
              ) AS tags
       FROM ride_members m
       JOIN riders r ON r.id = m.rider_id
       WHERE m.ride_id = $1
       ORDER BY m.finish_rank NULLS LAST, m.joined_at`,
      [ride.rows[0].id],
    );
    res.json({ ok: true, ride: ride.rows[0], members: members.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'read_failed' });
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`R-ALLY API listening on ${port} schema=${process.env.PG_SCHEMA ?? 'rally'}`);
});
