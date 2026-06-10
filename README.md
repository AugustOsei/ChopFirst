# CHOP FIRST 🏁

A browser-based arcade touge racer with a 24-hour challenge twist: race three laps down a
mountain sprint, set your time, then send the link to friends — they have **24 hours to chop it**.

Built with Next.js, React Three Fiber, and a hand-rolled arcade vehicle model.
Every visual is procedural Three.js geometry and every sound is synthesized
with WebAudio — there are no game assets to download.

**Play it, then leave a road message** — your note (and photo) pops up mid-race
for the next drivers on your challenge link.

## Features

- **Arcade handling** — kinematic bicycle model with signed reverse, controllable
  handbrake drifts, rail scrapes with sparks, and forgiving recovery.
- **Boost** — three charges per run with flames, FOV kick, and screen streaks.
- **24-hour challenges** — shareable links, leaderboard, ghost cars replaying rivals' runs.
- **Road messages** — notes from other players appear during your race.
- **Custom driver** — name, profile photo, and six paint colors, remembered between visits.
- **Synthesized audio** — engine, drift screech, boost whoosh, coin chime (mutable).
- **Touch controls** — fully playable on phones; steering pads appear automatically.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Accelerate | `W` / `↑` | GAS |
| Brake / reverse | `S` / `↓` | REV |
| Steer | `A` `D` / `←` `→` | ‹ › |
| Drift (handbrake) | `Shift` | DRIFT |
| Boost | `Space` | BOOST |
| Pause | `Esc` / `P` | ❚❚ |
| Debug overlay | `F3` | — |

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

## Project structure

```
app/            Next.js app router — shell, styles, challenge API routes
components/     RaceGame (R3F scene, car, FX), RaceHud, GuideModal
game/           vehicle.js (arcade physics), track.js (spline/geometry), audio.js
lib/            challenge persistence (Redis or file)
scripts/        qa-sim — headless driving test of the real vehicle model
```

### Headless driving QA

```bash
./scripts/qa-sim.sh
```

Runs the actual vehicle/track modules through scripted scenarios (rail hits,
recovery, mirrored reverse steering, braking, boost, drift, and a full
keyboard-style lap). Run it after touching `game/vehicle.js`.

## Credits

Created by [Augustine Osei](https://www.linkedin.com/in/augustineosei/) · [augustwheel.com](https://www.augustwheel.com)

## License

[MIT](LICENSE)
