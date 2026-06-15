# Touge Racer Rebuild Handoff

## Product Goal

Build a browser-based stylized touge / arcade racing game with:

- Third-person chase camera behind the car.
- Convincing speed and road motion.
- Curving mountain road from real track data/spline geometry.
- Guard rails and roadside scenery following the course.
- Arcade handling with drift tendency.
- Coins/pickups as a secondary arcade layer.
- Timer, challenge links, ghost/leaderboard features preserved where sensible.

## Current Stack

- Next.js App Router.
- React.
- Three.js via `@react-three/fiber`.
- `@react-three/drei` for sky/environment helpers.
- Native API routes under `app/api/challenges`.
- Local JSON challenge persistence under `data/challenges.json`.

This is now a Three.js/R3F 3D game layer inside a Next.js shell, not a 2D canvas game.

## Important Files

- `app/page.js`: Product shell, driver onboarding, challenge loading, finish/results flow.
- `components/RaceGame.jsx`: R3F canvas, scene setup, camera, track world, car mesh, pickups, ghosts, touch/keyboard controls.
- `components/RaceHud.jsx`: Lap/time/speed/coins/drift/progress HUD.
- `game/track.js`: Track spline, road mesh, shoulder geometry, strip geometry, pickup placement, nearest-track projection.
- `game/vehicle.js`: Current world-space vehicle controller.
- `app/styles.css`: HUD, overlays, touch controls, page styling.
- `lib/challenges.js`: Challenge read/write helpers.
- `app/api/challenges/*`: Challenge and run endpoints.

## Rebuild Progress So Far

### Phase 1: Replace Fake 2D Runtime

Status: mostly complete.

- Replaced the old fake/flat road presentation with a Three.js/R3F scene.
- Added road mesh from a Catmull-Rom spline.
- Added shoulders, rails, scenery, curve markers, pickup coins, car mesh, chase camera, HUD.
- Preserved challenge/timer/finish flow.

### Phase 2: Track Redesign

Status: partially complete.

- Reworked the track multiple times to remove self-intersections and avoid road/grass appearing over the car.
- Added `projectPointToTrack(...)` in `game/track.js`.
- Moved start line to a straighter segment.
- Current route is usable as a prototype, but still needs a deliberate track-design pass.

Known issue:

- Track readability and flow are still not professionally tuned. It has straights and turns, but the course layout should be rebuilt from named sections, not just spline points.

### Phase 3: Vehicle Model

Status: in progress and unstable.

The original model was road-relative:

- `distance` along track was the source of truth.
- `lateral` offset changed side-to-side.
- Position was computed as `trackCenter + normal * lateral`.

That caused the major user complaint: pressing forward let the road carry the car through turns.

The current model is now world-space:

- `car.position` and `car.yaw` are the source of truth.
- Movement uses the car's forward vector.
- Track projection is used for rail bounds, lap progress, and pickups.

Known issues:

- Steering/collision still feel rough.
- Rail contact can still feel sticky/snappy.
- Reverse has been added but needs manual feel testing.
- The current model is a custom kinematic arcade controller, not a full rigid-body physics model.

### Phase 4: Reverse / Recovery

Status: newly added, needs testing.

- Brake now becomes reverse once the car is stopped or nearly stopped.
- Speed is signed and clamped to forward/reverse limits.
- HUD shows `Reverse` instead of negative speed.
- Touch control button now says `Reverse`.
- Rail collision treats reverse as an escape action.

## Current Vehicle Diagnosis

The current vehicle implementation is closer to the right architecture than before, but still not polished.

What is better:

- The car is no longer fundamentally glued to the road spline.
- Forward-only movement should no longer automatically complete turns.
- Reverse exists.
- Rails are physical boundaries in the game logic.

What is still flawed:

- Collision response is hand-authored and brittle.
- Rail recovery is based on clamping/nudging, not contact normals and velocity resolution.
- Steering is still being tuned by constants instead of a clean arcade car model.
- There is no separate velocity vector; movement is still speed along yaw.
- No tire grip model, no slip ratio, no stable drift state machine.
- No automated browser driving test exists.

## Recommended Next Build Strategy

Do not start another visual rebuild first. Fix the driving core in a controlled phase.

### Phase A: Stabilize Kinematic Arcade Vehicle

Testable result:

- Player can accelerate, steer left/right predictably, brake, reverse, and recover from rail contact without refresh.
- Holding only gas on a bend causes the car to hit or scrape the rail, not drive the course cleanly.
- Steering away from a rail reliably frees the car.

Recommended implementation:

- Keep `position`, `yaw`, `speed`.
- Add explicit `velocity` or at least a `forwardSpeed` + `sideSpeed`.
- Compute road projection once per frame.
- Resolve rails using:
  - nearest track center,
  - signed lateral,
  - rail limit,
  - inward normal,
  - velocity component removal into the wall,
  - small inward positional correction.
- Do not snap yaw to road tangent on collision.
- Add reverse steering convention intentionally: reverse should feel like backing a car, not forward steering.

### Phase B: Create Vehicle Debug Overlay

Testable result:

- Debug panel can show `speed`, `yaw`, `lateral`, `headingError`, `railSide`, `projectionDistance`.
- Debug mode can be toggled off for normal play.

Purpose:

- Avoid tuning by feel alone.
- Make sign bugs obvious.

### Phase C: Manual Driving QA Script

Testable result:

- Checklist for:
  - gas only,
  - left turn,
  - right turn,
  - brake to stop,
  - reverse from stop,
  - hit left rail and recover,
  - hit right rail and recover,
  - collect coin,
  - finish partial lap.

Automate what is possible with browser controls later, but start with repeatable manual checks.

### Phase D: Track Pass

Testable result:

- Named course sections:
  - start straight,
  - easy right,
  - medium left,
  - straight,
  - hard hairpin,
  - S-bend/chicane,
  - recovery straight,
  - final corner.
- No self-intersections.
- Rails/scenery/pickups follow the road.

### Phase E: Visual Polish

Testable result:

- Improved race car model/proportions.
- Better road material and lane/edge markings.
- Stronger speed sensation.
- HUD/control layout cleaned up.

Do this after the car is fun to drive.

## What To Salvage

- Next.js shell and challenge flow.
- API routes and local challenge persistence.
- Three.js/R3F scene structure.
- Track mesh generation functions.
- Pickup system concept.
- HUD concept.
- Basic car mesh as placeholder only.
- Curve markers and rails as gameplay readability aids.

## What To Rework

- `game/vehicle.js`: keep world-space source of truth, but rewrite collision/velocity resolution more cleanly.
- `game/track.js`: keep projection and mesh system, but redesign control points as named sections.
- `components/RaceGame.jsx`: keep scene structure, but add debug overlay and simplify camera tuning.
- Touch controls: keep layout, but test labels/sizes after reverse was added.

## What To Postpone

- Ghost playback polish.
- Leaderboard polish.
- Detailed car model.
- Advanced drift scoring.
- Sound effects.
- Airborne/floating-road environment ideas.
- Full rigid-body physics unless the kinematic arcade controller cannot be stabilized.

## Suggested Decision For Next Session

Start with `game/vehicle.js`, not scenery or UI.

The next session should implement Phase A only:

1. Add a clean vehicle dynamics model with `position`, `yaw`, `speed`, and `sideSpeed`.
2. Add robust rail collision resolution.
3. Keep reverse.
4. Add minimal debug readout.
5. Verify with manual and scripted checks before changing track or visuals.

## Current Verification

Last successful command:

```bash
npm run build
```

Result: production build passed.

Known browser warning:

- `THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.`
- This appears to come from the Three/R3F stack and has not been tied to app failure.

---

## 2026-06-10 MVP Rebuild (supersedes Phases A–E above)

### Vehicle model (`game/vehicle.js`) — rewritten

- World-space `position`, `yaw`, and an explicit `velocity` Vector3 are the source of truth.
- Kinematic bicycle steering: `yawRate = forwardSpeed / wheelbase * tan(steerLock)`. Steer lock shrinks with speed. Because forward speed is signed, reverse steering behaves like backing a real car (tail swings toward the steered side) with no special casing — the old yaw-snap-to-tangent on reverse was removed.
- Lateral slip = velocity re-decomposed after each yaw step; damped by a grip rate (8.4/s normal, 2.8/s drifting, extra grip below 9 m/s so low-speed handling is crisp).
- Drift state machine with hysteresis: handbrake above 7 m/s, or full lock near top speed. Drift relaxes grip and boosts yaw 1.3x.
- Rails: projection-based detection; collisions remove wall-normal velocity (slight restitution), deflect part of it along the rail, and apply impact-scaled friction. Yaw is never snapped. A 0.35s low-grip "scrape" window after contact prevents the rail from gluing the car. A steer-away yaw assist guarantees escape even from a dead stop.
- Boost is a 1.5s timed state (extra accel + higher cap) with a 2.2s cooldown, 3 charges.

### Presentation

- `RaceCar` is a low-poly red coupe: sloped nose, glass cabin, wing, spinning/steering wheels, headlights, brake/reverse tail-light glow, additive boost flame cones + point light, body roll/pitch.
- Particle pools (instanced): tire smoke, rail sparks, fading skid quads.
- Environment: dashed center line, white edge lines, alternating red/white curbs, continuous rail ribbons + instanced posts/delineators, instanced forest/rocks, fog-faded mountain ring (clearance-checked), camera FOV kick + impact shake, CSS speed-line/vignette overlays.
- HUD: lap/time/coins/drift chips, circular speedometer with R/N/D gear tag, boost pips with cooldown bar, GO! flash, debug panel behind F3, touch controls hidden on fine-pointer devices.

### Repeatable QA

`./scripts/qa-sim.sh` runs the real vehicle/track modules headlessly through: gas-only rail hit, steer-away recovery, proportional-driver recovery, mirrored reverse steering, braking, boost, handbrake drift, low-speed turning, and a full bang-bang-keyboard lap (completes ~54s, 5% rail contact, 0% accidental drift).

### Remaining limitations

- Head-on rail hits at speed shed most velocity by design; escape assist + reverse handles recovery.
- Skid marks are short-lived quads, not persistent trails.

### 2026-06-10 round 2 (same day, later session)

- Steering chirality bug fixed: the right key had mapped to +yaw, which is screen-LEFT
  for the chase camera. Input mapping flipped; headless sims check sign symmetry only,
  so visual direction must be verified in-browser (right key must increase `car.lateral`).
- Track rebuilt from named sections (`game/track.js`): start straight, easy right,
  medium left, approach straight, summit hairpin (~9 m radius, intentional), S-chicane,
  recovery straight, final sweeper. ~1330 m, zero self-intersections, bot laps in 44 s.
- Added: live SVG minimap, wrong-way warning, challenge expiry countdown, post-race
  message prompt chips, ghost car shells (tinted car mesh), road-message popups with
  author photos, driver HUD chip, paint picker, localStorage driver persistence,
  synthesized WebAudio (engine/drift/boost/coin/impact) with mute, pause menu,
  guide modal, AI key-art onboarding backdrop (`public/cover.jpg`), clouds,
  car detail pass (stripes/mirrors/fastback/grille/arches).
- Storage adapter in `lib/challenges.js`: Upstash/Vercel KV REST env vars in
  production, local file otherwise.
- Repo public at https://github.com/AugustOsei/ChopFirst.

### 2026-06-11 — challenge loop, presentation, feedback

- Onboarding split into an animated title screen + separate driver-setup panel
  (Enter/Space starts; PB pill; challenge pill with live countdown).
- Chop verdict on the finish panel (CHOPPED / NOT CHOPPED vs the challenge
  leader) and localStorage personal-best tracking with NEW PERSONAL BEST callout.
- Challenge loop closed: runs auto-save the moment a race finishes (message is
  optional and posted after), share text adapts to chopped/missed, title-screen
  challenge inbox tracks up to 8 followed challenges with new-run badges, and a
  global all-time leaderboard (best run per anonymous device id) sits behind a
  title-screen modal at `/api/leaderboard`.
- `/api/health` storage diagnostics added, and real save errors surface in the
  finish panel instead of failing silently.
- Race-day presentation: start gantry with light tree, grandstand, HUD numerals.
- In-game feedback: bug/idea modal (title screen + results screen) posting to
  `/api/feedback`, stored in the shared store capped at 200 entries. Owner reads
  it with `?key=` matching `FEEDBACK_ADMIN_KEY`; the same key now gates full
  `/api/health` diagnostics (public response is a bare `{ ok: true }`).
- Home buttons added to the finish and results panels.
- Security pass: no secrets in working tree or git history; `data/` (player
  photos/messages) and `.env*` gitignored and never committed; npm audit shows
  2 moderate advisories (postcss via next, build-time only — do not run
  `npm audit fix --force`, it downgrades next to 9.x).

### 2026-06-11 round 2 — PB ghost, anti-cheat, funnel metrics

- Personal-best ghost: the PB ghost trace is stored in localStorage with the PB
  time and raced as a gold ghost on every run. All ghosts are now synced to
  `car.timeMs` (launch at GO, park at the finish) instead of free-looping on
  scene time.
- Ghost bug fixes found along the way: `slice(0, 500)` truncated traces to the
  first ~45 s of a run — replaced with even decimation across the whole run
  (`decimateGhost` in RaceGame, mirrored in validate-sim); ghost shells at 0.32
  opacity were near-invisible in the bright scene — now 0.55 opacity with an
  emissive glow (this also makes the existing challenge ghosts actually visible).
- Anti-cheat: `validateRun` in `lib/challenges.js` (imports real track data)
  rejects runs whose ghost trace is missing, time-inconsistent, speed-impossible
  (vehicle hard cap is 64 m/s; validator allows 70), or doesn't cover the full
  course, plus impossible coin/boost counts. Wired into challenge create and
  run submit (HTTP 422). `scripts/validate-sim.sh` is the repeatable QA:
  a bot races a real 129 s 3-lap run (accepted) and six forgery styles are
  rejected.
- Funnel metrics: POST `/api/track` (allowlisted events, fire-and-forget,
  always 204) increments per-day counters — Redis HINCRBY per-day hash in
  production, `data/metrics.json` locally. Owner reads 14 days via
  `/api/metrics?key=FEEDBACK_ADMIN_KEY`. Client events: link_opened,
  race_started, race_finished, run_saved, share_whatsapp/sms/copy,
  feedback_sent (`lib/log-event.js`, keepalive fetch).
- Caveat: ghost `d` is absolute spline distance (start line is at d=50), and
  samples are nearest-matched in time — synthetic traces for testing must
  start at d=50 and sample densely (~real traces: one sample per 90 ms,
  decimated to ≤500).

### 2026-06-11 round 3 — mobile controls rework

- iPhone tap problems diagnosed as three compounding issues: no viewport lock
  (double-tap zoom hijacked rapid taps), selectable button text (long-press
  triggered the iOS magnifier loupe), and the GAS button requiring a 2-minute
  hold (guaranteed long-press misfires + thumb fatigue).
- Fixes: `viewport` export in app/layout.js (maximum-scale=1, user-scalable=no,
  viewport-fit=cover); global CSS `user-select: none` + `-webkit-touch-callout:
  none` on body with inputs/textareas re-enabled, `-webkit-tap-highlight-color:
  transparent`, `touch-action: manipulation` on all buttons; `preventDefault()`
  on pointerdown + onContextMenu suppression in TouchControls.
- Auto-throttle on touch devices: `inputRef.current.autoGas` set from the
  inverse of the same media query that shows touch controls
  (`(hover: hover) and (pointer: fine)`); applied in the RaceScene frame loop —
  gas forced on unless brake is held (brake/reverse still work). Keyboard play
  is unchanged.
- Touch layout is now 2+3: steer ‹ › left; BOOST, DRIFT, BRAKE right, with
  BRAKE the big rightmost button (`.gas` CSS removed, `.brake` promoted).
  Guide modal + README updated.
- Verified in preview: viewport meta present, body user-select none (inputs
  still selectable), new button set renders, auto-gas drives the car from GO
  with zero input (spoofed matchMedia), holding brake reverses (−2.5 m/s) and
  releasing resumes auto-throttle.

### 2026-06-11 round 4 — coin runs + boost economy

- PICKUPS rebuilt as Sonic-style patterns via coinLine/coinArc generators in
  game/track.js: 41 coins per lap — lines on straights, arcs sweeping corners
  toward the racing line, two risky off-line clusters (lateral ±2.7).
- Coins respawn every lap: collected keys in car.coins are lap-scoped
  (lap * 1000 + index) in both vehicle pickup checks and the Pickups renderer.
- Economy: every 15 coins banks +1 boost charge, capped at 5 stocked
  (COINS_PER_BOOST / MAX_BOOST_CHARGES exported from game/vehicle.js).
  car.boostsEarned tracks thresholds; HUD shows 5 pips; "+1 BOOST" reuses the
  lap-banner slot; coin chime fires automatically (audio keys off coins.size).
- Validator: coins ≤ PICKUPS.length × laps (123); boostUses ≤ 3 + floor(coins/15).
  Both sims green — the center-line bot now collects 66 coins per race.
- Tuning note: if 15 feels too generous (bot banks 4 bonus boosts driving the
  center line), raise COINS_PER_BOOST — the validator follows automatically.

### 2026-06-11 round 5 — versioning + changelog

- Player-facing release notes live in `lib/changelog.js`; the top entry IS the
  current version (CURRENT_VERSION derives from it). To ship a release: add an
  entry there (player language, not commit messages) and keep package.json
  version roughly in sync.
- Title footer shows a `v1.0` chip; a pulsing gold dot appears for anyone whose
  localStorage `chopfirst.seenVersion` doesn't match, and clicking opens a
  ChangelogModal (guide-card style) and marks the version seen.
- Pause overlay now shows touch hints (auto-throttle/BRAKE/DRIFT/BOOST) on
  touch devices instead of keyboard shortcuts.

---

## Post-MVP release log (1.1 → 1.7)

The MVP rounds above land at v1.0. Subsequent player-facing releases are
documented for players in `lib/changelog.js`; this section keeps the engineering
notes alongside. The data model also went track-aware along the way: every run,
challenge, and global-board entry carries a `trackId` so a second course can be
added without migrating stored data (a short-lived AI-rivals experiment was added
and reverted — current builds have no AI cars).

- **1.1 — touch controls reworked** (`components/RaceGame.jsx`, `app/styles.css`):
  steering moved to the bottom corners (one thumb per direction, fading 4-chevron
  arrows), DRIFT above both arrows, BOOST a center tank showing charges, BRAKE a
  wide bottom bar that reverses when held. Thumbs can slide between controls.
- **1.2 — chase the gap**: live PB gap timer (green up / red down), ghost name
  tags with times (toggle in pause), ghosts fade as you close and show brake
  lights, bronze/silver/gold medal thresholds, instant restart (`R`).
- **1.3 — durable challenges** (`lib/challenges.js`): every new run resets the
  24-hour clock; any run revives a dormant challenge; the challenges inbox flags
  who chopped you and nudges quiet ones.
- **1.4 — times of day**: Day/Dusk/Night picker in driver setup; Night adds real
  headlights, emissive tail lights, and a starfield. Choice persists in
  localStorage and drives scene lighting/`theme.headlights`.
- **1.5 — more character**: roadside braking-countdown boards into the sharp
  corners, richer/varied forest, side mirrors and finer car detailing.
- **1.6 — new front door**: scrollable marketing landing page, redesigned driver
  setup (time-of-day pick inline, glossier paint chips), button/polish pass.
  Intro scrim classes renamed to `intro-scrim--{variant}` to stop colliding with
  the `.panel` utility class.
- **1.7 — handling + mobile setup polish**:
  - Steering onset softened in `game/vehicle.js`: steer wind-on rate 6.5 → 5,
    yaw-velocity response 9.5 → 8. `MAX_STEER_LOCK`, the speed-sensitive lock,
    and `MAX_YAW_RATE` are unchanged, so corner capability is identical — a tap
    just eases in instead of snapping. Re-verified with `qa-sim.sh`
    (lap completes, low-speed turn + mirrored reverse intact) and
    `validate-sim.sh` (all anti-cheat checks pass, ghost format unchanged).
  - Driver-setup card no longer clips on small/landscape phones: the centered,
    self-scrolling rules moved from a `max-width: 720px`-only block into a
    combined `@media (hover: none), (max-width: 720px)` query in `app/styles.css`
    so they cover every touch device, not just narrow portrait ones.

