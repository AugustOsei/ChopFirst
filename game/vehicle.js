import * as THREE from "three";
import { getTrackFrame, getTrackLength, PICKUPS, TRACK, pointAt, projectPointToTrack, wrapDistance } from "./track.js";

// All speeds in m/s, all angles in radians.
// Yaw convention: forward = (sin(yaw), 0, cos(yaw)); +yaw rotates the nose toward +X.
// For the chase camera (looking along +forward, +Y up) screen-right is -X, so the
// RIGHT key must map to NEGATIVE steer. steer > 0 therefore means "turn screen-left";
// all downstream signs (assist, visuals) follow this convention consistently.
const MAX_SPEED = 52;
const BOOST_MAX_SPEED = 64;
const MAX_REVERSE_SPEED = 11;
const ENGINE_ACCEL = 27;
const BOOST_ACCEL = 24;
const BRAKE_DECEL = 44;
const REVERSE_ACCEL = 13;
const ROLLING_DRAG = 1.5;
const QUAD_DRAG = 0.0085;
const WHEELBASE = 2.6;
const MAX_STEER_LOCK = 0.62;
const MAX_YAW_RATE = 2.6;
const GRIP = 8.4; // lateral-slip damping per second with full traction
const DRIFT_GRIP = 2.8;
const LOW_SPEED_GRIP_BONUS = 6; // extra grip below ~9 m/s so the car never ice-skates at parking speed
const BOOST_DURATION = 1.5;
const BOOST_COOLDOWN = 2.2;
// Coin economy: coins respawn every lap; every COINS_PER_BOOST collected banks
// an extra boost charge, up to MAX_BOOST_CHARGES stocked at once.
export const COINS_PER_BOOST = 15;
export const MAX_BOOST_CHARGES = 5;
const RAIL_RESTITUTION = 0.14;
const CAR_HALF_WIDTH = 1.1;
const RAIL_LIMIT = TRACK.railOffset - CAR_HALF_WIDTH - 0.2;
const RIDE_HEIGHT = 0.82;

export function createVehicleState() {
  const startDistance = wrapDistance(TRACK.startDistance - 10);
  const startFrame = getTrackFrame(startDistance);
  const position = pointAt(startDistance, 0);
  position.y += RIDE_HEIGHT;
  return {
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
    timeMs: 0,
    ghost: [],
    lastGhostMs: 0,
    impact: 0,
    railSide: 0,
    railContact: 0,
    scrapeTimer: 0,
  };
}

export function updateVehicle(car, input, dt) {
  const trackLength = getTrackLength();

  // left = +steer (+yaw, toward +X); right = -steer. See yaw convention above.
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  // Center faster than we wind on, so releasing the stick straightens promptly.
  // Wind-on is deliberately gentle so a tap eases into the turn instead of
  // snapping the wheels over; the max lock below is unchanged, so tight corners
  // are just as takeable — they just take a beat longer to load up.
  const steerRate = steerTarget === 0 ? 10 : 5;
  car.steer += (steerTarget - car.steer) * (1 - Math.exp(-dt * steerRate));
  car.throttle += ((input.gas ? 1 : 0) - car.throttle) * (1 - Math.exp(-dt * 8));
  car.brake += ((input.brake ? 1 : 0) - car.brake) * (1 - Math.exp(-dt * 10));
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
  const lock = MAX_STEER_LOCK / (1 + absFwd * 0.095); // less lock at speed = wider arcs
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

  if (Math.abs(car.lateral) > RAIL_LIMIT) {
    const side2 = Math.sign(car.lateral);
    const outward = projection.frame.normal.clone().multiplyScalar(side2);
    const intoWall = car.velocity.dot(outward);
    if (intoWall > 0) {
      // Remove the wall-normal velocity (tiny bounce back), then convert part of
      // it into motion along the rail so hits glance instead of dead-stopping.
      car.velocity.addScaledVector(outward, -intoWall * (1 + RAIL_RESTITUTION));
      const alongRail = projection.frame.tangent.clone();
      if (alongRail.dot(forward) < 0) alongRail.negate(); // deflect with the direction of travel
      car.velocity.addScaledVector(alongRail, intoWall * 0.35);
      // Scrape friction scales with how head-on the hit was.
      car.velocity.multiplyScalar(Math.max(0.62, 1 - intoWall * 0.025));
      car.impact = Math.max(car.impact, Math.min(1, intoWall / 14));
    }
    car.lateral = side2 * (RAIL_LIMIT - 0.02);
    car.position.copy(projection.frame.position).addScaledVector(projection.frame.normal, car.lateral);
    car.railSide = side2;
    car.railContact = 1;
    car.scrapeTimer = 0.35;
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
