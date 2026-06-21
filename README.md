# CHOP FIRST 🏁

A browser-based arcade touge racer with a 24-hour challenge twist: race three laps down a
mountain sprint, set your time, then send the link to friends — they have **24 hours to chop it**.

Built with Next.js, React Three Fiber, and a hand-rolled arcade vehicle model.
The world and effects are procedural Three.js geometry, the cars are lightweight
glTF models, and every sound is synthesized with WebAudio.

**Play it, then leave a road message** — your note (and photo) pops up mid-race
for the next drivers on your challenge link.

## Features

- **Arcade handling** — kinematic bicycle model with signed reverse, controllable
  handbrake drifts, rail scrapes with sparks, and forgiving recovery. Steering eases
  into the turn so a tap nudges rather than snaps, while full-lock corners stay sharp.
- **Four cars, four feels** — Street Coupe, a nimble Ghana Taxi, a heavy slogan-board
  Trotro, and a fast, twitchy blue-flamed Hover Bike; pick yours in driver setup.
- **Times of day** — race the mountain in bright Day, golden Dusk, or moonlit Night;
  Night lights the road with real headlights, glowing tail lights, and a starfield.
- **Braking boards** — roadside countdown boards mark the brake points into the
  sharpest corners, so you can learn the line and carry more speed.
- **Boost** — three charges per run with flames, FOV kick, and screen streaks.
- **Coin runs** — Sonic-style coin lines and arcs trace the racing line and respawn
  every lap; every 15 coins banks an extra boost charge (max 5 stocked).
- **24-hour challenges** — shareable links, leaderboard, ghost cars replaying rivals' runs.
- **Personal-best ghost** — a gold ghost replays your fastest run on every race, synced to the start.
- **Verified times** — runs are validated server-side against their ghost trace, so leaderboard times can't be forged with a curl one-liner.
- **Road messages** — notes from other players appear during your race.
- **Custom driver** — name, profile photo, car choice, six paint colors, and your
  time-of-day pick, remembered between visits.
- **Synthesized audio** — engine, drift screech, boost whoosh, coin chime (mutable).
- **Touch controls** — fully playable on phones; steering pads appear automatically,
  and the driver-setup card centers and scrolls on any screen size.
- **In-game feedback** — players can report bugs or suggest features from the title
  and results screens; submissions are stored server-side for the owner to review.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Accelerate | `W` / `↑` | automatic |
| Brake / reverse | `S` / `↓` | BRAKE |
| Steer | `A` `D` / `←` `→` | ‹ › |
| Drift (handbrake) | `Shift` | DRIFT |
| Boost | `Space` | BOOST |
| Pause | `Esc` / `P` | ❚❚ |
| Debug overlay | `F3` | — |

On touch devices the throttle is automatic — the car launches at GO and the
player steers, brakes, drifts, and boosts. Keyboard play keeps manual throttle.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Deploying to Vercel

The game itself is stateless and deploys as-is:

1. Push this repo to GitHub.
2. [Import it on Vercel](https://vercel.com/new) — no build configuration needed.

**Challenge persistence** (leaderboards, ghosts, road messages) needs a small
key-value store in production. Locally it uses `data/challenges.json`; on Vercel
the filesystem is ephemeral, so without a store challenge links stop working
whenever a serverless instance recycles.

Hook up [Upstash Redis](https://upstash.com) (free tier is plenty) or Vercel KV by
setting two environment variables in the Vercel project:

```
UPSTASH_REDIS_REST_URL=...     # or KV_REST_API_URL
UPSTASH_REDIS_REST_TOKEN=...   # or KV_REST_API_TOKEN
```

No code changes required — `lib/challenges.js` detects them automatically.

**Player feedback → your inbox.** Bug reports and feature ideas are emailed to
you via [Resend](https://resend.com) (free tier is plenty) the moment a player
hits send — no store to poll. Set:

```
RESEND_API_KEY=re_...                                          # from resend.com
FEEDBACK_EMAIL_TO=you@example.com                              # where feedback lands
FEEDBACK_EMAIL_FROM=ChopFirst Feedback <onboarding@resend.dev> # optional
```

`onboarding@resend.dev` works out of the box but only delivers to the address on
your Resend account; verify a domain (e.g. augustwheel.com) to send freely and
stay out of spam. If a player leaves an email as their contact, it's set as the
reply-to so you can answer directly. Without `RESEND_API_KEY` + `FEEDBACK_EMAIL_TO`
(e.g. local dev) feedback falls back to the same data store as challenges, so
nothing is lost.

**Owner diagnostics.** Set a private key to read funnel metrics and storage health:

```
FEEDBACK_ADMIN_KEY=<any random string you keep private>
```

- `/api/metrics?key=<your key>` — daily funnel counters for the last 14 days
  (links opened, races started/finished, runs saved, shares, feedback).
- `/api/health?key=<your key>` — storage backend diagnostics (read/write checks).
  Without the key, `/api/health` only returns `{ "ok": true }`.

## Project structure

```
app/            Next.js app router — shell, styles, API routes
                (challenges, leaderboard, feedback, health)
components/     RaceGame (R3F scene, car, FX), RaceHud, GuideModal, FeedbackModal
game/           vehicle.js (arcade physics), track.js (spline/geometry), audio.js
lib/            persistence — challenges, global board, feedback (Redis or file)
scripts/        qa-sim — headless driving test of the real vehicle model
```

### Headless driving QA

```bash
./scripts/qa-sim.sh        # vehicle handling scenarios
./scripts/validate-sim.sh  # anti-cheat: bot race accepted, forged runs rejected
```

`qa-sim` runs the actual vehicle/track modules through scripted scenarios (rail
hits, recovery, mirrored reverse steering, braking, boost, drift, and a full
keyboard-style lap) — run it after touching `game/vehicle.js`. `validate-sim`
drives a bot through a full race and checks that `validateRun` accepts the
legitimate result while rejecting forged times, compressed or truncated ghost
traces, and impossible pickup counts — run it after touching the validator,
the ghost recording, or vehicle speed limits.

## Credits

Created by [Augustine Osei](https://www.linkedin.com/in/augustineosei/) · [augustwheel.com](https://www.augustwheel.com)

### Built with

- **[Next.js](https://nextjs.org)** — app router and API routes.
- **[React Three Fiber](https://r3f.docs.pmnd.rs)** / **[Three.js](https://threejs.org)** + **[drei](https://github.com/pmndrs/drei)** — the 3D scene.
- **[Blender](https://www.blender.org)** — cleaning up and exporting the vehicle models to glTF.
- **[Higgsfield](https://higgsfield.ai)** — AI-generated landing and promo imagery (`public/`, `promo/`).
- **[Upstash Redis](https://upstash.com)** / Vercel KV — challenge, leaderboard, and metrics storage.
- **[Resend](https://resend.com)** — feedback email.
- **[Vercel](https://vercel.com)** — hosting.

### Map data

One of the tracks is built from a real Accra street route, generated with
**[OSRM](https://project-osrm.org)** over **OpenStreetMap** data and projected to a
local metric spline (`.ghana-route/`). Map data © **[OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors**, available under the
[Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/).

### 3D vehicle models

The Ghana taxi, trotro, and hover speeder use glTF models from Sketchfab
(`public/models/`), each under a Creative Commons licence requiring attribution:

- **Street Coupe** — "Low-poly sports car" by **Juff22** — CC BY — https://sketchfab.com/models/23dfdeb55dc24970b36065afaab7a8a5
- **Ghana Taxi** — "Low Poly Hong Kong Taxi" by **Han66st** — CC BY — https://sketchfab.com/models/52f3e00f0f2a4c4a894c3082639d4431
- **Trotro** — "1999 Toyota Hi Ace Commuter" by **Yoru_Murcielago** — CC BY — https://sketchfab.com/models/285ec1a2870046ed8a85c7dee2b712af
- **Hover speeder** — "LS-340: Land Speeder" by **MRowa** — CC BY-SA — https://sketchfab.com/models/b147d3485e6d47bbbc1cb704fccbe27b

> Note: the speeder is **CC BY-SA** (ShareAlike). To avoid carrying that
> obligation, swap it for a CC-BY or CC0 speeder model.

## License

[MIT](LICENSE)
