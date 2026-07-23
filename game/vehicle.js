import * as THREE from "three";
import { BOOST_PICKUPS, getTrackFrame, getTrackLength, HAZARDS, PICKUPS, TRACK, pointAt, projectPointToTrack, wrapDistance } from "./track.js";

// All speeds in m/s, all angles in radians.
// Yaw convention: forward = (sin(yaw), 0, cos(yaw)); +yaw rotates the nose toward +X.
// For the chase camera (looking along +forward, +Y up) screen-right is -X, so the
// RIGHT key must map to NEGATIVE steer. steer > 0 therefore means "turn screen-left";
// all downstream signs (assist, visuals) follow this convention consistently.
// --- Per-vehicle handling. Everything that defines how a car *feels* lives in a
// tuning table keyed by vehicle id; createVehicleState attaches the chosen set to
// car.tuning and updateVehicle reads from it. The "street" coupe keeps the exact
// numbers the game shipped with, so its medal calibration and ghosts are untouched.
// Field notes:
//   GRIP                lateral-slip damping per second with full traction
//   LOW_SPEED_GRIP_BONUS extra grip below ~9 m/s so the car never ice-skates at parking speed
//   RIDE_HEIGHT         chassis origin above the road (raised for the floating bike)
const STREET_TUNING = {
  MAX_SPEED: 52,
  BOOST_MAX_SPEED: 64,
  MAX_REVERSE_SPEED: 11,
  ENGINE_ACCEL: 27,
  BOOST_ACCEL: 24,
  BRAKE_DECEL: 44,
  REVERSE_ACCEL: 13,
  ROLLING_DRAG: 1.5,
  QUAD_DRAG: 0.0085,
  WHEELBASE: 2.6,
  MAX_STEER_LOCK: 0.62,
  MAX_YAW_RATE: 2.6,
  GRIP: 8.4,
  DRIFT_GRIP: 2.8,
  LOW_SPEED_GRIP_BONUS: 6,
  RIDE_HEIGHT: 0.82,
};

// Ghana taxi: a touch slower than the coupe but eager to rotate and very planted —
// short wheelbase, extra lock, high grip. Rewards tidy, momentum-keeping lines.
const TAXI_TUNING = {
  ...STREET_TUNING,
  MAX_SPEED: 46,
  BOOST_MAX_SPEED: 57,
  ENGINE_ACCEL: 25,
  BRAKE_DECEL: 42,
  WHEELBASE: 2.45,
  MAX_STEER_LOCK: 0.66,
  MAX_YAW_RATE: 2.75,
  GRIP: 9.0,
  DRIFT_GRIP: 3.0,
};

// Trotro: a heavy minibus. Slow to wind up, slow to stop, long wheelbase and a
// capped yaw rate so it understeers and wallows. The handful that masters it earns it.
const TROTRO_TUNING = {
  ...STREET_TUNING,
  MAX_SPEED: 40,
  BOOST_MAX_SPEED: 50,
  MAX_REVERSE_SPEED: 9,
  ENGINE_ACCEL: 18,
  BOOST_ACCEL: 18,
  BRAKE_DECEL: 36,
  REVERSE_ACCEL: 10,
  ROLLING_DRAG: 2.0,
  QUAD_DRAG: 0.011,
  WHEELBASE: 3.25,
  MAX_STEER_LOCK: 0.54,
  MAX_YAW_RATE: 2.1,
  GRIP: 7.2,
  DRIFT_GRIP: 2.4,
};

// Hover bike: fastest and twitchiest. No tyres, so it floats high and turns on a
// dime — high lock and yaw rate, glued lateral grip, light drag. Easy to overcook.
const HOVERBIKE_TUNING = {
  ...STREET_TUNING,
  MAX_SPEED: 58,
  BOOST_MAX_SPEED: 72,
  ENGINE_ACCEL: 31,
  BOOST_ACCEL: 27,
  BRAKE_DECEL: 46,
  ROLLING_DRAG: 1.2,
  QUAD_DRAG: 0.0075,
  WHEELBASE: 2.2,
  MAX_STEER_LOCK: 0.7,
  MAX_YAW_RATE: 3.0,
  GRIP: 9.6,
  DRIFT_GRIP: 3.2,
  RIDE_HEIGHT: 1.3,
};

// Registry: single source of truth shared by the picker UI (listVehicles) and the
// physics (VEHICLE_TUNING). Mirrors the TRACK_DEFS pattern in track.js.
export const VEHICLES = [
  { id: "street", name: "Street Coupe", klass: "All-rounder", blurb: "Balanced all-rounder — the original.", tuning: STREET_TUNING },
  { id: "taxi", name: "Ghana Taxi", klass: "Nimble", blurb: "Nimble and planted, loves tidy lines.", tuning: TAXI_TUNING },
  { id: "trotro", name: "Trotro", klass: "Heavyweight", blurb: "Heavy minibus — slow but unstoppable.", tuning: TROTRO_TUNING },
  { id: "hoverbike", name: "Hover Bike", klass: "Hyperspeed", blurb: "Fastest and twitchiest — floats on blue flame.", tuning: HOVERBIKE_TUNING },
];
export const DEFAULT_VEHICLE = "street";
const VEHICLE_TUNING = Object.fromEntries(VEHICLES.map((v) => [v.id, v.tuning]));

export function listVehicles() {
  return VEHICLES.map(({ id, name, klass, blurb }) => ({ id, name, klass, blurb }));
}

// Display specs for the garage UI, derived from the real tuning so they never drift.
// Each bar is 0–100, normalized across the roster with a floor so even the slowest
// car shows a readable bar; topSpeedKmh is the headline number (m/s → km/h).
function bar(value, min, max, floor = 28) {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return Math.round(floor + t * (100 - floor));
}
export function vehicleStats(id) {
  const v = VEHICLES.find((x) => x.id === id) || VEHICLES[0];
  const t = v.tuning;
  return {
    id: v.id,
    name: v.name,
    klass: v.klass,
    blurb: v.blurb,
    topSpeedKmh: Math.round(t.BOOST_MAX_SPEED * 3.6),
    bars: {
      speed: bar(t.MAX_SPEED, 38, 58),
      accel: bar(t.ENGINE_ACCEL, 16, 31),
      grip: bar(t.GRIP, 7, 9.6),
      agility: bar(t.MAX_YAW_RATE, 2.0, 3.0),
    },
  };
}

const BOOST_DURATION = 1.5;
const BOOST_COOLDOWN = 2.2;
// Coin economy: coins respawn every lap; every COINS_PER_BOOST collected banks
// an extra boost charge, up to MAX_BOOST_CHARGES stocked at once.
export const COINS_PER_BOOST = 15;
export const MAX_BOOST_CHARGES = 5;
const RAIL_RESTITUTION = 0.14;
// Soft cushion: a band this many metres inside the rail where a spring eases the
// car back toward the road, growing with how deep it is, so contact gently returns
// the car instead of pinning it. The spring sets the inward (track-normal) speed
// directly each frame so grip can't bleed it away; it ramps from 0 at the band's
// inner edge to RAIL_CUSHION_SPRING * RAIL_CUSHION_MARGIN at the rail itself.
// Margin is kept modest so a deliberate rail-hugging line still works.
const RAIL_CUSHION_MARGIN = 1.0;
const RAIL_CUSHION_SPRING = 4.0;
const CAR_HALF_WIDTH = 1.1;
const RAIL_LIMIT = TRACK.railOffset - CAR_HALF_WIDTH - 0.2;
// Laser cannon (tracks with hazards only). Hitscan: the beam is instant, with
// a forgiving half-width so aiming is about lane choice at 180 km/h, not
// pixel-hunting. The cooldown keeps firing a rhythm (aim–fire–aim), not a hose.
const LASER_RANGE = 85;
const LASER_COOLDOWN = 0.28;
const LASER_HALF_WIDTH = 1.4;
// Ramming an asteroid shatters it but scrubs most of the car's speed — a
// harsher version of a head-on rail hit, since you had a gun to prevent it.
const HAZARD_CRASH_SPEED_KEEP = 0.45;

export function createVehicleState(vehicleId = DEFAULT_VEHICLE) {
  const tuning = VEHICLE_TUNING[vehicleId] || VEHICLE_TUNING[DEFAULT_VEHICLE];
  const startDistance = wrapDistance(TRACK.startDistance - 10);
  const startFrame = getTrackFrame(startDistance);
  const position = pointAt(startDistance, 0);
  position.y += tuning.RIDE_HEIGHT;
  return {
    tuning,
    vehicle: vehicleId in VEHICLE_TUNING ? vehicleId : DEFAULT_VEHICLE,
    position,
    yaw: Math.atan2(startFrame.tangent.x, startFrame.tangent.z),
    velocity: new THREE.Vector3(),
    forwardSpeed: 0,
    sideSpeed: 0,
    speed: 0, // mirror of forwardSpeed kept for HUD/camera consumers
    yawVelocity: 0,
    steer: 0,
    throttle: 0,
    brake: 0,
    reversing: false,
    drifting: false,
    distance: startDistance,
    lateral: 0,
    headingError: 0,
    projectionDistance: 0,
    lap: 0,
    startGatePassed: false,
    boostCharges: 3,
    boostTimer: 0,
    boostCooldown: 0,
    boostUses: 0,
    boostsEarned: 0,
    driftScore: 0,
    coins: new Set(),
    stars: new Set(),
    starsHit: 0,
    timeMs: 0,
    ghost: [],
    lastGhostMs: 0,
    impact: 0,
    railSide: 0,
    railContact: 0,
    scrapeTimer: 0,
    // laser cannon / asteroid hazards (lap-scoped keys, like coins)
    blasted: new Set(),
    blasts: 0,
    asteroidHits: 0,
    shots: 0,
    laserCooldown: 0,
    laserBeam: null, // { from:{x,y,z}, to:{x,y,z}, ttl } for the renderer
    lastBlast: null, // { x, y, z, crash } — one FX event per blastEvents bump
    blastEvents: 0,
  };
}

export function updateVehicle(car, input, dt) {
  const trackLength = getTrackLength();
  const {
    MAX_SPEED,
    BOOST_MAX_SPEED,
    MAX_REVERSE_SPEED,
    ENGINE_ACCEL,
    BOOST_ACCEL,
    BRAKE_DECEL,
    REVERSE_ACCEL,
    ROLLING_DRAG,
    QUAD_DRAG,
    WHEELBASE,
    MAX_STEER_LOCK,
    MAX_YAW_RATE,
    GRIP,
    DRIFT_GRIP,
    LOW_SPEED_GRIP_BONUS,
    RIDE_HEIGHT,
  } = car.tuning || VEHICLE_TUNING[DEFAULT_VEHICLE];

  // Per-track handling assist. The orbital layout sustains near-top speed,
  // where the default slow wind-on plus the speed-shrunk lock leaves keyboard
  // corrections landing a beat late — press, nothing, then too much. Tracks
  // built for those speeds declare faster turn-in (in-fiction: the guideway's
  // magnetic assist). Absent the field, every number matches the shipped feel,
  // so Akina/Accra medals and ghosts stay valid.
  const handling = TRACK.handling || {};

  // left = +steer (+yaw, toward +X); right = -steer. See yaw convention above.
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  // Center faster than we wind on, so releasing the stick straightens promptly.
  // Wind-on is deliberately gentle so a tap eases into the turn instead of
  // snapping the wheels over; the max lock below is unchanged, so tight corners
  // are just as takeable — they just take a beat longer to load up.
  const steerRate = steerTarget === 0 ? 10 : handling.steerWindOn ?? 3.3;
  car.steer += (steerTarget - car.steer) * (1 - Math.exp(-dt * steerRate));
  car.throttle += ((input.gas ? 1 : 0) - car.throttle) * (1 - Math.exp(-dt * 8));
  car.brake += ((input.brake ? 1 : 0) - car.brake) * (1 - Math.exp(-dt * 18));
  const handbrake = input.handbrake ? 1 : 0;

  if (input.boost && car.boostCharges > 0 && car.boostCooldown <= 0 && car.forwardSpeed > 5) {
    car.boostCharges -= 1;
    car.boostUses += 1;
    car.boostTimer = BOOST_DURATION;
    car.boostCooldown = BOOST_COOLDOWN;
  }
  car.boostTimer = Math.max(0, car.boostTimer - dt);
  car.boostCooldown = Math.max(0, car.boostCooldown - dt);
  const boosting = car.boostTimer > 0;

  let forward = forwardFromYaw(car.yaw);
  let right = rightFromYaw(car.yaw);
  let fwd = car.velocity.dot(forward);
  let side = car.velocity.dot(right);

  // --- Steering: kinematic bicycle. yawRate = v / L * tan(lock).
  // Signed v makes reverse steer like backing a real car (tail swings toward
  // the steered side) with no special casing — do NOT damp this to the road tangent.
  const absFwd = Math.abs(fwd);
  // less lock at speed = wider arcs; assisted tracks shrink it more slowly
  const lock = MAX_STEER_LOCK / (1 + absFwd * (handling.lockFalloff ?? 0.095));
  let targetYawRate = (fwd / WHEELBASE) * Math.tan(car.steer * lock);
  if (car.drifting) targetYawRate *= 1.3;
  // Rail-escape assist: +steer moves the car toward -lateral, so steer * railSide > 0
  // means "steering away from the wall". The scrape can scrub speed to near zero
  // where the bicycle model alone can't rotate the nose out.
  if (car.railSide !== 0 && car.steer * car.railSide > 0.15) {
    targetYawRate += car.steer * 1.4;
  }
  targetYawRate = THREE.MathUtils.clamp(targetYawRate, -MAX_YAW_RATE, MAX_YAW_RATE);
  car.yawVelocity += (targetYawRate - car.yawVelocity) * (1 - Math.exp(-dt * 8));
  car.yaw += car.yawVelocity * dt;

  // Re-decompose the carried velocity in the new heading; the lateral residue is slip.
  forward = forwardFromYaw(car.yaw);
  right = rightFromYaw(car.yaw);
  fwd = car.velocity.dot(forward);
  side = car.velocity.dot(right);

  // --- Longitudinal forces.
  const topSpeed = boosting ? BOOST_MAX_SPEED : MAX_SPEED;
  if (car.throttle > 0.02) {
    if (fwd < -0.3) {
      fwd += car.throttle * BRAKE_DECEL * dt; // gas while rolling backwards brakes first
    } else {
      const headroom = Math.max(0, 1 - fwd / topSpeed);
      fwd += car.throttle * ENGINE_ACCEL * (0.4 + 0.6 * headroom) * dt;
      if (boosting) fwd += BOOST_ACCEL * dt;
    }
  }
  if (car.brake > 0.02) {
    if (fwd > 0.4) {
      fwd -= car.brake * BRAKE_DECEL * dt;
    } else {
      // Below walking pace the brake input becomes reverse throttle.
      const headroom = Math.max(0.3, 1 + fwd / MAX_REVERSE_SPEED);
      fwd -= car.brake * REVERSE_ACCEL * headroom * dt;
    }
  }
  if (handbrake && Math.abs(fwd) > 0.3) fwd -= Math.sign(fwd) * 14 * dt;

  const overSpeed = !boosting && fwd > MAX_SPEED ? (fwd - MAX_SPEED) * 2.2 : 0;
  const drag = ROLLING_DRAG + QUAD_DRAG * fwd * fwd + overSpeed;
  fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd) / Math.max(dt, 1e-4), drag) * dt;
  fwd = THREE.MathUtils.clamp(fwd, -MAX_REVERSE_SPEED, BOOST_MAX_SPEED);

  // --- Drift state with hysteresis so it doesn't flicker.
  // Keyboard steer is binary, so full lock alone must not trigger drift at
  // cruising speed — only handbrake or near-top-speed hard cornering does.
  if (!car.drifting) {
    if ((handbrake && absFwd > 7) || (Math.abs(car.steer) > 0.85 && fwd > 40 && Math.abs(car.yawVelocity) > 1.55)) {
      car.drifting = true;
    }
  } else if (Math.abs(fwd) < 6 || (!handbrake && Math.abs(side) < 1 && Math.abs(car.steer) < 0.4)) {
    car.drifting = false;
  }

  let grip = car.drifting ? DRIFT_GRIP : GRIP;
  grip += Math.max(0, 1 - Math.abs(fwd) / 9) * LOW_SPEED_GRIP_BONUS;
  // Just after rail contact the velocity runs along the wall while the nose
  // points into it; full grip would erase that slide and glue the car to the
  // rail, so let it scrape instead.
  car.scrapeTimer = Math.max(0, car.scrapeTimer - dt);
  if (car.scrapeTimer > 0) grip = Math.min(grip, 2.4);
  side *= Math.exp(-grip * dt);

  car.velocity.copy(forward).multiplyScalar(fwd).addScaledVector(right, side);

  const previousProgress = progressFromStart(car.distance, trackLength);
  car.position.addScaledVector(car.velocity, dt);

  // --- Track projection: used only for rails, lap progress, height, and pickups.
  const projection = projectPointToTrack(car.position, car.distance, 120, 64);
  car.distance = projection.distance;
  car.lateral = projection.lateral;
  car.projectionDistance = projection.projectionDistance;
  const roadYaw = Math.atan2(projection.frame.tangent.x, projection.frame.tangent.z);
  car.headingError = normalizeAngle(roadYaw - car.yaw);
  car.railSide = 0;
  car.railContact = 0;

  const cushionLimit = RAIL_LIMIT - RAIL_CUSHION_MARGIN;
  if (Math.abs(car.lateral) > cushionLimit) {
    const side2 = Math.sign(car.lateral);
    const outward = projection.frame.normal.clone().multiplyScalar(side2);

    // Hard backstop: a fast hit still punches through the cushion to the rail.
    // Bounce off the wall normal, glance part of it along the rail, and scrape
    // speed by how head-on it was — only here do we register a contact for FX.
    if (Math.abs(car.lateral) > RAIL_LIMIT) {
      const intoWall = car.velocity.dot(outward);
      if (intoWall > 0) {
        car.velocity.addScaledVector(outward, -intoWall * (1 + RAIL_RESTITUTION));
        const alongRail = projection.frame.tangent.clone();
        if (alongRail.dot(forward) < 0) alongRail.negate(); // deflect with travel
        car.velocity.addScaledVector(alongRail, intoWall * 0.35);
        car.velocity.multiplyScalar(Math.max(0.62, 1 - intoWall * 0.025));
        car.impact = Math.max(car.impact, Math.min(1, intoWall / 14));
      }
      car.lateral = side2 * (RAIL_LIMIT - 0.02);
      car.position.copy(projection.frame.position).addScaledVector(projection.frame.normal, car.lateral);
      car.railContact = 1;
      car.scrapeTimer = 0.2;
    }

    // Soft cushion spring: ease the car back toward the road, growing with depth,
    // so it peels off the wall to the band's inner edge instead of riding it. We
    // set the inward (track-normal) speed directly each frame — re-asserted past
    // grip's damping — and only when the car isn't already heading in faster.
    const penetration = Math.abs(car.lateral) - cushionLimit;
    const push = RAIL_CUSHION_SPRING * penetration;
    const vOut = car.velocity.dot(outward);
    if (vOut > -push) car.velocity.addScaledVector(outward, -push - vOut);

    car.railSide = side2; // feeds the steer-away assist
    fwd = car.velocity.dot(forward);
    side = car.velocity.dot(right);
  }
  car.position.y = projection.frame.position.y + RIDE_HEIGHT;
  car.impact = Math.max(0, car.impact - dt * 2.4);

  car.forwardSpeed = fwd;
  car.sideSpeed = side;
  car.speed = fwd;
  car.reversing = fwd < -0.25;

  const nextProgress = progressFromStart(car.distance, trackLength);
  if (previousProgress - nextProgress > trackLength * 0.5 && fwd > 1) {
    if (car.startGatePassed) car.lap += 1;
    car.startGatePassed = true;
  }

  // --- Asteroid hazards + laser cannon (only on tracks that define hazards).
  // Rocks respawn per lap with lap-scoped keys, exactly like coins, so every
  // run faces the same deterministic field and times stay comparable.
  if (HAZARDS.length > 0) {
    car.laserCooldown = Math.max(0, car.laserCooldown - dt);

    // Crash test: an unblasted rock inside the car's footprint shatters
    // against the chassis and scrubs most of the speed.
    HAZARDS.forEach((rock, index) => {
      const key = car.lap * 1000 + index;
      if (car.blasted.has(key)) return;
      const along = Math.abs(shortDistance(car.distance, rock.distance, trackLength));
      if (along > rock.radius + 1.9) return;
      if (Math.abs(car.lateral - rock.lateral) > rock.radius + CAR_HALF_WIDTH * 0.8) return;
      car.blasted.add(key);
      car.asteroidHits += 1;
      car.velocity.multiplyScalar(HAZARD_CRASH_SPEED_KEEP);
      fwd = car.velocity.dot(forward);
      side = car.velocity.dot(right);
      car.forwardSpeed = fwd;
      car.sideSpeed = side;
      car.speed = fwd;
      car.impact = 1;
      const pos = pointAt(rock.distance, rock.lateral);
      car.lastBlast = { x: pos.x, y: pos.y + rock.scale * 0.8, z: pos.z, crash: true };
      car.blastEvents += 1;
    });

    if (input.fire && car.laserCooldown <= 0) {
      car.laserCooldown = LASER_COOLDOWN;
      car.shots += 1;
      // hitscan straight along the nose: nearest rock inside the beam wins
      let best = null;
      HAZARDS.forEach((rock, index) => {
        const key = car.lap * 1000 + index;
        if (car.blasted.has(key)) return;
        const pos = pointAt(rock.distance, rock.lateral);
        const relX = pos.x - car.position.x;
        const relZ = pos.z - car.position.z;
        const along = relX * forward.x + relZ * forward.z;
        if (along < 2 || along > LASER_RANGE) return;
        const perp = Math.abs(relX * right.x + relZ * right.z);
        if (perp > rock.radius + LASER_HALF_WIDTH) return;
        if (!best || along < best.along) best = { key, pos, along, scale: rock.scale };
      });
      const originY = car.position.y + 0.55;
      const reach = best ? best.along : LASER_RANGE;
      car.laserBeam = {
        from: { x: car.position.x, y: originY, z: car.position.z },
        to: { x: car.position.x + forward.x * reach, y: originY, z: car.position.z + forward.z * reach },
        ttl: 0.12,
      };
      if (best) {
        car.blasted.add(best.key);
        car.blasts += 1;
        car.lastBlast = { x: best.pos.x, y: best.pos.y + best.scale * 0.8, z: best.pos.z, crash: false };
        car.blastEvents += 1;
      }
    }
    if (car.laserBeam) {
      car.laserBeam.ttl -= dt;
      if (car.laserBeam.ttl <= 0) car.laserBeam = null;
    }
  }

  // coins respawn each lap: collected keys are lap-scoped
  PICKUPS.forEach((pickup, index) => {
    const key = car.lap * 1000 + index;
    if (car.coins.has(key)) return;
    const delta = Math.abs(shortDistance(car.distance, pickup.distance, trackLength));
    if (delta < 4.2 && Math.abs(car.lateral - pickup.lateral) < 1.35) {
      car.coins.add(key);
    }
  });

  const earnedBoosts = Math.floor(car.coins.size / COINS_PER_BOOST);
  if (earnedBoosts > car.boostsEarned) {
    car.boostCharges = Math.min(MAX_BOOST_CHARGES, car.boostCharges + (earnedBoosts - car.boostsEarned));
    car.boostsEarned = earnedBoosts;
  }

  // Boost stars respawn each lap like coins, but each one instantly refills boost
  // to full. Wider grab window than a coin — they're rare and worth lining up for.
  BOOST_PICKUPS.forEach((star, index) => {
    const key = car.lap * 1000 + index;
    if (car.stars.has(key)) return;
    const delta = Math.abs(shortDistance(car.distance, star.distance, trackLength));
    if (delta < 5 && Math.abs(car.lateral - star.lateral) < 1.7) {
      car.stars.add(key);
      car.boostCharges = MAX_BOOST_CHARGES;
      car.starsHit += 1;
    }
  });

  if (car.drifting && Math.abs(fwd) > 12) {
    car.driftScore += Math.round((Math.abs(side) * 1.7 + Math.abs(car.yawVelocity) * 6) * dt * 10) / 10;
  }

  car.timeMs += dt * 1000;
  if (car.timeMs - car.lastGhostMs > 90) {
    car.ghost.push({
      t: Math.round(car.timeMs),
      d: Number((car.lap * trackLength + car.distance).toFixed(2)),
      l: Number(car.lateral.toFixed(3)),
      h: Number(car.headingError.toFixed(3)),
    });
    car.lastGhostMs = car.timeMs;
  }
}

export function getVehicleTransform(car) {
  const frame = getTrackFrame(car.distance);
  return { position: car.position, yaw: car.yaw, frame };
}

// Car-to-car collision: OBB overlap test + separation impulse.
// Call once per frame after both cars have been updated by updateVehicle.
// CAR_HALF_LENGTH and CAR_HALF_WIDTH define each car's collision box.
const CAR_HALF_LENGTH = 2.2;
const CAR_HALF_WIDTH_COLL = CAR_HALF_WIDTH; // reuse the existing constant (1.1)

export function resolveCarCollision(carA, carB) {
  const dx = carB.position.x - carA.position.x;
  const dz = carB.position.z - carA.position.z;
  const distSq = dx * dx + dz * dz;
  // Quick radius pre-check: max diagonal of each box is ~2.5m so 25m² is safe.
  if (distSq > 25) return false;

  // Project separation vector into each car's local axes to find OBB overlap.
  const fwdA = forwardFromYaw(carA.yaw);
  const rtA  = rightFromYaw(carA.yaw);
  const fwdB = forwardFromYaw(carB.yaw);
  const rtB  = rightFromYaw(carB.yaw);

  // Separating axis theorem on 4 axes (2 per car).
  // For each axis compute how much the boxes overlap; if any axis separates, no collision.
  function overlapOnAxis(ax, az) {
    // Project box A extent onto axis
    const extA = Math.abs(fwdA.x * ax + fwdA.z * az) * CAR_HALF_LENGTH
                + Math.abs(rtA.x  * ax + rtA.z  * az) * CAR_HALF_WIDTH_COLL;
    // Project box B extent onto axis
    const extB = Math.abs(fwdB.x * ax + fwdB.z * az) * CAR_HALF_LENGTH
                + Math.abs(rtB.x  * ax + rtB.z  * az) * CAR_HALF_WIDTH_COLL;
    // Distance between centres along axis
    const dist = Math.abs(dx * ax + dz * az);
    return extA + extB - dist; // positive = overlap, negative = gap
  }

  const axes = [
    [fwdA.x, fwdA.z],
    [rtA.x,  rtA.z],
    [fwdB.x, fwdB.z],
    [rtB.x,  rtB.z],
  ];

  let minOverlap = Infinity;
  let sepX = 0, sepZ = 0;

  for (const [ax, az] of axes) {
    const overlap = overlapOnAxis(ax, az);
    if (overlap <= 0) return false; // separating axis found — no collision
    if (overlap < minOverlap) {
      minOverlap = overlap;
      // Separation axis points from A toward B
      const sign = (dx * ax + dz * az) >= 0 ? 1 : -1;
      sepX = ax * sign;
      sepZ = az * sign;
    }
  }

  // Push cars apart so they no longer overlap.
  const half = minOverlap * 0.5;
  carA.position.x -= sepX * half;
  carA.position.z -= sepZ * half;
  carB.position.x += sepX * half;
  carB.position.z += sepZ * half;

  // Exchange velocity components along the separation axis (elastic-ish impulse).
  // We use a restitution of 0.35 — enough to feel like a bump, not a billiard shot.
  const RESTITUTION = 0.35;
  const vAlong_A = carA.velocity.x * sepX + carA.velocity.z * sepZ;
  const vAlong_B = carB.velocity.x * sepX + carB.velocity.z * sepZ;

  // Only resolve if cars are closing (vA > vB along sep axis means A is chasing B)
  if (vAlong_A <= vAlong_B) return true;

  const impulse = (vAlong_A - vAlong_B) * (1 + RESTITUTION) * 0.5;
  carA.velocity.x -= impulse * sepX;
  carA.velocity.z -= impulse * sepZ;
  carB.velocity.x += impulse * sepX;
  carB.velocity.z += impulse * sepZ;

  // Register a light impact on both cars so the camera shake fires.
  carA.impact = Math.max(carA.impact, Math.min(0.6, Math.abs(impulse) / 12));
  carB.impact = Math.max(carB.impact, Math.min(0.6, Math.abs(impulse) / 12));

  return true;
}

function forwardFromYaw(yaw) {
  return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
}

function rightFromYaw(yaw) {
  return new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
}

function shortDistance(a, b, length) {
  const raw = a - b;
  return ((raw + length / 2) % length) - length / 2;
}

function progressFromStart(distance, length) {
  return (distance - TRACK.startDistance + length) % length;
}

function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
