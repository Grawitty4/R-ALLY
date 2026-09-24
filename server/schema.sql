-- R-ALLY Postgres schema
-- Live convoy GPS stays in Firebase. This database is the logbook:
-- plan, bikes, GPS traces, and recap stats computed at End.
--
-- Lives in its own Postgres schema (`rally`) so it can share an existing
-- Railway database with other apps. Tables are rally.rides, rally.riders, …
-- Connect with search_path=rally (do not ALTER DATABASE search_path).

CREATE SCHEMA IF NOT EXISTS rally;
COMMENT ON SCHEMA rally IS 'R-ALLY logbook. Live GPS stays in Firebase.';

-- Keep the extension in public so other schemas can use it too.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

SET search_path TO rally, public;

-- ---------------------------------------------------------------------------
-- Catalogs (extend without migrations where possible)
-- ---------------------------------------------------------------------------

CREATE TABLE roles (
  id text PRIMARY KEY,
  label text NOT NULL,
  rank int NOT NULL,
  assignable boolean NOT NULL DEFAULT false,
  privileges jsonb NOT NULL DEFAULT '[]'
);

INSERT INTO roles (id, label, rank, assignable, privileges) VALUES
  ('rider', 'Rider', 10, true, '[]'),
  ('marshal', 'Marshal', 20, true, '[]'),
  ('head_marshal', 'Head marshal', 30, false, '[]'),
  ('admin', 'Admin', 40, false, '[]')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE story_tags (
  id text PRIMARY KEY,
  label text NOT NULL,
  fun boolean NOT NULL DEFAULT true,
  description text
);

INSERT INTO story_tags (id, label, fun, description) VALUES
  ('aggressive_rider', 'Aggressive rider', true, 'Most overtakes / lively passing'),
  ('lantern_rouge', 'Lantern rouge', true, 'Last to the destination among finishers'),
  ('smooth_operator', 'Smooth operator', true, 'Fewest stops, steady pace'),
  ('pit_king', 'Pit king', true, 'Longest combined break time'),
  ('rabbit', 'Rabbit', true, 'Highest top speed in the group'),
  ('glue', 'Glue', true, 'Spent the most time near the group centroid')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- People and machines
-- ---------------------------------------------------------------------------

CREATE TABLE riders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text UNIQUE NOT NULL,
  display_name text NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bikes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  name text NOT NULL,
  make text,
  model text,
  cc int,
  year int,
  nickname text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bikes_rider_id_idx ON bikes (rider_id);

-- ---------------------------------------------------------------------------
-- Ride plan + group recap
-- Stats columns are NULL until status = 'ended'.
-- Industry-standard activity fields (Strava / Garmin / REVER):
--   elapsed vs moving vs stopped time, distance, avg/max speed, elevation.
-- Group-only fields: spread, regroups, pit breaks, top group speed.
-- ---------------------------------------------------------------------------

CREATE TABLE rides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  created_by uuid NOT NULL REFERENCES riders(id),
  status text NOT NULL CHECK (status IN ('planned', 'live', 'ended', 'cancelled')),
  destination_name text NOT NULL,
  destination_lat double precision NOT NULL,
  destination_lng double precision NOT NULL,
  start_name text,
  start_lat double precision,
  start_lng double precision,
  start_altitude_m double precision,
  end_lat double precision,
  end_lng double precision,
  started_at timestamptz,
  ended_at timestamptz,
  timezone text,
  firebase_path text,

  -- time (seconds)
  elapsed_s int,
  moving_s int,
  stopped_s int,

  -- distance and speed
  distance_km numeric(8, 2),
  avg_speed_kmh numeric(6, 2),
  avg_moving_speed_kmh numeric(6, 2),
  top_group_speed_kmh numeric(6, 2),

  -- elevation (from GPS altitude; noisy on phones, still useful)
  elevation_gain_m numeric(8, 1),
  elevation_loss_m numeric(8, 1),
  min_altitude_m numeric(8, 1),
  max_altitude_m numeric(8, 1),

  -- pits / regroups
  pit_stop_count int NOT NULL DEFAULT 0,
  avg_pit_break_s int,
  regroup_count int,
  max_group_spread_km numeric(6, 2),

  -- weather at start (REVER-style; optional)
  avg_temp_c numeric(4, 1),
  weather jsonb,

  -- encoded route used for route_km / overtakes
  route_polyline text,
  sample_interval_s numeric(4, 1),

  recap jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rides_created_by_idx ON rides (created_by);
CREATE INDEX rides_status_idx ON rides (status);
CREATE INDEX rides_started_at_idx ON rides (started_at);

CREATE TABLE ride_waypoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('start', 'pit', 'destination')),
  seq int NOT NULL,
  name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  UNIQUE (ride_id, seq)
);

CREATE INDEX ride_waypoints_ride_id_idx ON ride_waypoints (ride_id);

CREATE TABLE ride_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL REFERENCES riders(id),
  bike_id uuid REFERENCES bikes(id),
  roles text[] NOT NULL DEFAULT ARRAY['rider']::text[],
  color text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  finished_at timestamptz,
  finish_rank int,

  elapsed_s int,
  moving_s int,
  stopped_s int,
  distance_km numeric(8, 2),
  avg_speed_kmh numeric(6, 2),
  avg_moving_speed_kmh numeric(6, 2),
  top_speed_kmh numeric(6, 2),
  elevation_gain_m numeric(8, 1),
  max_gap_behind_km numeric(6, 2),
  overtakes int NOT NULL DEFAULT 0,
  times_overtaken int NOT NULL DEFAULT 0,
  samples_count int NOT NULL DEFAULT 0,

  UNIQUE (ride_id, rider_id)
);

CREATE INDEX ride_members_ride_id_idx ON ride_members (ride_id);
CREATE INDEX ride_members_rider_id_idx ON ride_members (rider_id);

CREATE TABLE ride_member_tags (
  ride_member_id uuid NOT NULL REFERENCES ride_members(id) ON DELETE CASCADE,
  tag_id text NOT NULL REFERENCES story_tags(id),
  PRIMARY KEY (ride_member_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- Traces used to *compute* recap (not the live map)
-- ---------------------------------------------------------------------------

CREATE TABLE ride_samples (
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL REFERENCES riders(id),
  recorded_at timestamptz NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  altitude_m double precision,
  accuracy_m double precision,
  speed_kmh numeric(6, 2),
  heading numeric(6, 2),
  -- Distance along the planned route; overtakes are 1-D order changes here.
  route_km numeric(8, 3),
  stopped boolean NOT NULL DEFAULT false,
  PRIMARY KEY (ride_id, rider_id, recorded_at)
);

CREATE INDEX ride_samples_ride_time_idx ON ride_samples (ride_id, recorded_at);

CREATE TABLE ride_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL REFERENCES riders(id),
  waypoint_id uuid REFERENCES ride_waypoints(id),
  kind text NOT NULL DEFAULT 'pause' CHECK (kind IN ('pause', 'pit', 'regroup')),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_s int,
  lat double precision,
  lng double precision
);

CREATE INDEX ride_stops_ride_id_idx ON ride_stops (ride_id);

CREATE TABLE ride_overtakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  passer_id uuid NOT NULL REFERENCES riders(id),
  passed_id uuid NOT NULL REFERENCES riders(id),
  at timestamptz NOT NULL,
  route_km numeric(8, 3),
  passer_speed_kmh numeric(6, 2),
  passed_speed_kmh numeric(6, 2)
);

CREATE INDEX ride_overtakes_ride_id_idx ON ride_overtakes (ride_id);

-- Optional recap photos (REVER-style). URL is uploaded later (e.g. R2 / S3).
CREATE TABLE ride_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  rider_id uuid REFERENCES riders(id),
  recorded_at timestamptz,
  lat double precision,
  lng double precision,
  url text NOT NULL,
  caption text
);

CREATE INDEX ride_photos_ride_id_idx ON ride_photos (ride_id);
