# R-ALLY data plane

Live dots = Firebase. Recap = Postgres. Phones never talk to Postgres directly; a small API on Railway will sit in front of this schema (`schema.sql`).

## What “ride stats” usually means

From Strava, Garmin, and REVER (moto), a recap almost always has:

| Stat | Meaning | In our schema |
|---|---|---|
| Elapsed time | Start → End, including chai | `rides.elapsed_s` |
| Moving time | GPS says you were actually rolling | `rides.moving_s` / `ride_members.moving_s` |
| Stopped time | Elapsed − moving (lights, pumps, photos) | `rides.stopped_s` |
| Distance | Path length of the trace | `distance_km` |
| Average speed | Distance / **moving** time (Strava-style) | `avg_moving_speed_kmh` |
| Average including stops | Distance / elapsed | `avg_speed_kmh` |
| Max speed | Fastest filtered GPS segment | `top_speed_kmh` / `top_group_speed_kmh` |
| Elevation gain / loss / min / max | From altitude samples | `elevation_*` / `min_altitude_m` / `max_altitude_m` |
| Start / end points | First and last fix | `start_lat/lng`, `end_lat/lng` |
| Temperature / weather | Optional, at ride start | `avg_temp_c`, `weather` |
| Photos on the map | Optional, after upload | `ride_photos` |
| Local clock | Recap in the club’s timezone | `timezone` |

We skip as first-class columns (need extra sensors or guesswork): heart rate, cadence, power, calories, lean angle. `rides.recap` JSON is the escape hatch.

**Group-only** (not on Strava solo rides): pit-break average, regroups, max spread, finish order, overtakes, story tags.

Max speed is computed from consecutive samples and **clipped** for GPS jumps (Strava’s own warning). We will not trust a single 240 km/h spike.

---

## Overtakes: they are not computed live on Firebase

Firebase is a **walkie-talkie**. It shows “who is roughly where” every few seconds. It is a bad place to decide “A passed B at 12:04:01.3”.

### Why a 1-second pass is not lost the way it sounds

1. **A real overtake is not one GPS tick.** Two bikes swapping order along the road is several seconds of closing, alongside, and pulling ahead. Even at a 3 s live update, the **order along the route** (`route_km`) still crosses in the stored trace.
2. **The live map interval ≠ the recap interval.** Today Firebase gets a point about every 3 s / 8 m so the map stays cheap. On the **phone** we will also keep a denser local buffer (about 1 s) for recap. That buffer is what Postgres sees.
3. **We interpolate.** If A is behind at 12:04:00 and ahead at 12:04:02, the server treats the pass as happening in between. You do not need a sample in the exact second.
4. **We require hysteresis.** A 15 m GPS wobble must not count as an overtake. Passer must go from clearly behind to clearly ahead (e.g. +25 m along route) and stay there for a few seconds.

What *would* miss overtakes: only looking at Firebase snapshots and never storing a trace. That is why traces exist.

### Flow

```
During the ride
  Phone GPS (1 s local buffer)
       │
       ├─ every ~3 s ──► Firebase   (map dots, roles, live route)
       │
       └─ every ~30 s ──► Railway API  POST /rides/:id/samples
                          (append ride_samples; OK if a batch is late)

On End
  Phone flushes remaining samples
  API job:
    1. Project each sample onto the planned polyline → route_km
    2. Per rider: distance, moving/elapsed, elevation, top speed
    3. For each pair of riders, walk time: when route_km order flips
       with hysteresis → insert ride_overtakes
    4. Derive pit stops from low speed near waypoints → ride_stops
    5. Fill ride_members + rides recap columns + story_tags
    6. Optionally delete the Firebase node
```

Firebase delay (1–2 s) does **not** drop an overtake, because the overtake is **not decided in Firebase**. It is decided later from each rider’s own clocked trace.

If a phone is offline, samples stay on the device and upload when data returns. Recap waits until enough traces are in (or End + a short grace).

### Pairing

`ride_overtakes.passer_id` / `passed_id` match `riders.id`. `route_km` is metres/km along **the planned R-ALLY route**, not raw lat/lng crossing (two people in adjacent lanes would false-trigger in 2-D).

---

## Apply on Railway

R-ALLY uses a **Postgres schema** named `rally` inside whatever database you already have. Other tables in `public` (or other schemas) are untouched.

Do **not** point the Expo app at `DATABASE_URL`. Phones stay on Firebase for live GPS; a later API on Railway is the only thing that should talk to Postgres.

### 1. Open the Postgres you already have

1. Go to [railway.com](https://railway.com) and sign in.
2. Open the **project** that already has your database.
3. Click the **PostgreSQL** service (not an app service).
4. Confirm it is healthy (green).

If you do **not** have Postgres yet: on the project canvas click **+ New → Database → PostgreSQL**. Wait until it is running. That is a new *service*, still one Railway project.

### 2. Copy a connection URL you can use from your laptop

On the Postgres service:

1. Open **Variables**.
2. Copy **`DATABASE_PUBLIC_URL`** (this is the TCP-proxy URL for your machine / DBeaver / `psql`).
3. Leave **`DATABASE_URL`** alone — that private `*.railway.internal` host is for services *inside* the same Railway project (the future R-ALLY API).

If `DATABASE_PUBLIC_URL` is missing: **Settings → Networking** and enable the TCP proxy, then reload Variables.

Never paste this URL into the Expo app, GitHub, or chat.

### 3. Apply `server/schema.sql`

From this repo, with `psql` installed:

```bash
psql "$DATABASE_PUBLIC_URL" -v ON_ERROR_STOP=1 -f server/schema.sql
```

Or paste the file into a GUI (DBeaver, pgAdmin, TablePlus) connected to that same public URL.

Railway’s in-dashboard SQL tab is optional (feature flag **Raw SQL Query Tab**). `psql` / DBeaver is more reliable for a full file.

### 4. Check it landed in `rally`, not `public`

```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'rally'
ORDER BY 1;

SELECT id, label FROM rally.roles ORDER BY rank;
```

You should see **12 tables**, including `ride_member_tags`.

Do **not** run `ALTER DATABASE … SET search_path`. That would change every other app on this database. The API sets `search_path=rally` on its own connection.

---

## API

Node service in this folder. Phones call it over HTTPS. It is the only process that uses `DATABASE_URL`.

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/health` | anyone | DB ping |
| POST | `/rides` | marshal | create logbook row + waypoints |
| POST | `/rides/:code/join` | rider | add member |
| POST | `/rides/:code/samples` | rider | append GPS trace (~1 s buffer, ~30 s batches) |
| POST | `/rides/:code/leave` | rider | mark `left_at`; recap if last person |
| POST | `/rides/:code/end` | admin / head marshal | close ride, compute recap + overtakes |
| GET | `/rides/:code` | anyone with the code | recap JSON |

Firebase remains the live map. If this API is down, the ride still runs; traces are retried from the phone buffer.

### Deploy on Railway (same project as Postgres)

1. Push this repo to GitHub (`Grawitty4/R-ALLY`) so Railway can see `server/`.
2. In the Railway project canvas: **+ New → GitHub Repo** → `R-ALLY` (or **Empty Service** then connect the repo).
3. Open that new service → **Settings**:
   - **Root Directory:** `server`
   - **Generate Domain** (public HTTPS)
4. **Variables** (use the variable picker, do not paste the password):
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`  
     (private URL, same project — the service name might be `PostgreSQL` not `Postgres`; pick it from autocomplete)
   - `PG_SCHEMA` = `rally`
5. Deploy. Open `https://<your-domain>/health` — you want `{ "ok": true, "schema": "rally" }`.
6. In the Expo `.env` (local, not GitHub):

```
EXPO_PUBLIC_API_URL=https://<your-domain>
```

Restart Expo (`npx expo start`). Create a short test ride, End it, then in TablePlus:

```sql
SELECT code, status, distance_km FROM rally.rides ORDER BY created_at DESC LIMIT 5;
SELECT COUNT(*) FROM rally.ride_samples;
```

Do not put `DATABASE_URL` in the Expo `.env`.
