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

