# R-ALLY

**Your ALLY for the Ride.**

R-ALLY (spoken “rally”) is the ride companion for motorcycle convoys and club runs — an **ally** for the group, not a stage-rally organiser. The marshal plans a destination and pit stops. Riders join with a short code. Everyone sees the same route, the same people, and why someone stopped — without sharing a Google account or keeping a laptop open at the roadside.

This document is the fallback for what we have built, what we intend, and how the product stays online. It is also the outline we can show a club, OEM, or tour operator.

---

## Brand (frozen)

| | |
|---|---|
| Name | **R-ALLY** |
| Motto | **Your ALLY for the Ride** |
| Spoken | “Rally” / “R-ALLY — the crew app” |
| Store title (when listed) | R-ALLY |
| Store subtitle | Your ALLY for the Ride |
| GitHub | https://github.com/Grawitty4/R-ALLY |
| Android / iOS ids | `app.rally.convoy` (internal; not customer-facing) |
| Expo slug | `r-ally` |

Do **not** market the app as RideAlly / Rideally — that name is already used in India by a cab and bikepool company.

---

## The problem

Google Maps is excellent for one rider. It is a poor radio for a group.

On a real ride the questions are: who is still with us, who is at the pump, are we stretching out, where is the next halt, and what happened on this run. WhatsApp pins and “where are you?” calls do not scale past a handful of people. R-ALLY treats the convoy as the product: one live map, named roles, a planned route, and a story of the ride when it ends.

---

## What to expect today (in the app)

These flows work on phones running the current Expo build (Expo Go while we develop; a standalone install after EAS).

**Start a ride.** Enter your name. Open the ride planner. Type a few letters of the destination (and optional pit stops) and pick from suggestions — you do not have to type the exact place name. R-ALLY draws a driving route from your GPS through those stops.

**Join a ride.** Enter the 6-character code the marshal shares. Location is used only while a trip is on. Friends do not log into the marshal’s Expo or Google account.

**On the map.**

- Teardrop **pins** for start (`S`), destination (`D`), and numbered pit stops
- **Colour dots** for people (same colour as the crew rail)
- Your own dot has a gold ring
- Orange line for the planned road
- **Fit** (square button, right side) frames the crew plus the next stretch of route, like Google Maps’ overview

**Roles.** The person who creates the ride is **admin** and **head marshal**. Joiners are **riders**. The head marshal can set someone to **Marshal** or **Rider** from that person’s card. Marshal tools (route edits, pings, holds) are not enabled yet; the role list is built so those privileges can be added without redesigning the trip.

**A rider card.** Distance from you, ahead/behind, status (moving / stopped / refuelling in demo), Directions into the phone’s maps app, Call if a number exists.

**Demo.** Code `PITSTP` (or the Watch a demo button) shows a fake Pune → Lonavala convoy, including a rider stopped at a fuel station.

**What is not in this build yet:** end-of-ride recap stats, bike profiles, falling-behind alerts, popular destinations on the home map, login accounts, App Store / Play Store listing.

---

## Product direction (what we are building next)

Aimed at clubs and tour groups, not a generic tracker.

| Area | Intent |
|---|---|
| Ride recap | After End: time taken, moving vs stopped, distance, average speed, average pit-stop break, top group speed, top individual speed |
| Fun story | Overtakes inside the group, light “aggressive rider” / lantern-rouge style tags — a campfire recap, not a police report |
| Bikes | Name, make, model, CC, nickname, tied to a rider and snapped onto that ride |
| Safety | Distance-based alerts when someone is losing the group (marshal-facing first) |
| Discovery | Home map of popular ride destinations near you, from past R-ALLY rides (not from scraping Google) |
| Distribution | Installable Android app (then iOS) so a ride does not depend on anyone’s laptop |

---

## How R-ALLY stays online (EAS vs GitHub vs your laptop)

Three different things get mixed up here. Only one of them is “the app running in someone’s pocket.”

### 1. The app on the phone — EAS Build

When we run an [EAS](https://docs.expo.dev/build/introduction/) build, Expo **uploads a snapshot of this project** (the screens, map, planner, Firebase client, later the Railway URL) and compiles an APK (Android) or IPA (iOS).

That binary **contains the logic we wrote**. After a rider installs it:

- They do **not** need your laptop
- They do **not** need GitHub
- They do **not** need `expo start`
- EAS is **not** a live copy of your hard disk. It does not “fall back” to the code you are editing in Cursor. A new feature exists for riders only after the next **build** (or later, an [EAS Update](https://docs.expo.dev/eas-update/introduction/))

**Runtime data** (live GPS, join codes) does not live inside EAS. The installed app calls **Firebase** (and later the **Railway API**) over the internet. Those services are already “always on.”

So: **base code on the phone = last EAS snapshot. Live convoy = Firebase. Ride history = Postgres (planned).**

### 2. Git / GitHub — source of truth, not the host

GitHub does not make R-ALLY live. It keeps the **source** somewhere that is not one laptop.

- Source of truth: [github.com/Grawitty4/R-ALLY](https://github.com/Grawitty4/R-ALLY)
- If the laptop dies, we can still rebuild from GitHub
- Railway typically **deploys the API from GitHub**
- EAS can also build **from a GitHub push**, so you do not even need the laptop for the next APK

Never commit `.env`. Pushing `main` is the pipeline. The host for riders is the **store or APK**; the host for history is **Railway**.

### 3. Today’s Expo Go QR — development only

`npx expo start --tunnel` streams JavaScript from your machine. Close the lid, the QR dies. Fine for us. Wrong for a Sunday ride.

**Path to “laptop independent”**

1. GitHub backup of this repo (`Grawitty4/R-ALLY`)  
2. EAS preview APK shared with the club  
3. Railway API + Postgres for create/end/recap  
4. Tighten Firebase so a trip is not world-readable  
5. Play Store / TestFlight when the product is ready to sell  

---

## Architecture (target)

```
Phones (R-ALLY APK)
  ├─ Firebase Realtime Database     live members, GPS, roles, route  (during the ride)
  └─ Railway API → PostgreSQL schema `rally`   plan, bikes, samples, recap
```

Firebase is the walkie-talkie. Postgres is the logbook. We keep both.

Current Firebase project is enough **for live tracking at club scale**. It is **not** enough as the system of record: rules are still open, there is no durable history, and “popular near me” is a Postgres job.

---

## Data we will store

SQL: [`server/schema.sql`](server/schema.sql) (Postgres schema `rally` on Railway). How live GPS vs recap (including overtakes) flows: [`server/README.md`](server/README.md).

- **riders** / **bikes** — person and machine (name, CC, nickname)
- **rides** — code, destination, start/end, then recap (elapsed vs moving time, distance, speeds, elevation, pit breaks, group spread)
- **ride_waypoints** — start, pits, destination
- **ride_members** — roles, which bike, per-person stats, finish order, overtakes
- **ride_samples** — GPS trace used to *compute* stats (not the live map)
- **ride_stops** / **ride_overtakes** — breaks and passes
- **ride_photos** — optional recap photos on the map
- **story_tags** — fun recap labels

Roles stay a catalog (`rider`, `marshal`, `head_marshal`, `admin`) so marshal privileges can grow without a new product.

---

## Local development (contributors)

Expo SDK 57. Firebase keys in `.env` (see `.env.example`). Never commit secrets.

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # if Node is not on PATH
npm install
npx expo start --tunnel
```

Open in Expo Go. Live trips need Realtime Database. Demo code `PITSTP` works without it.

---

## Positioning for clubs and partners

**For a riding club:** one code, one map, named marshals, a recap they can share in the group chat.

**For a tour operator:** the same loop, plus (later) who fell behind, how long the coffee stop actually was, and a repeatable route library.

**For an OEM / accessory brand:** group telemetry and a branded recap; not a replacement for navigation turn-by-turn.

R-ALLY does not replace Google Maps navigation. It sits **beside** it: the group layer Maps never shipped.

---

## Status

| | |
|---|---|
| Stage | Working prototype (Expo) |
| Live tracking | Firebase |
| History / recap / bikes | Designed, not implemented |
| Public install | Not yet (EAS preview is the next distribution step) |
| Name | **R-ALLY** — frozen. Motto: Your ALLY for the Ride |
