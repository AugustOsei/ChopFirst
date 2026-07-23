// Ananse AI driver — lookahead racing line controller.
// Call createAiInput(car, personality) each frame to get a synthetic input
// object compatible with updateVehicle(). The personality object tunes
// aggression so future opponents can feel distinct without changing this file.

import { getTrackFrame, pointAt, wrapDistance } from "./track.js";

// Default personality: Ananse. Tricky — runs a tight line, brakes late,
// occasionally boosts. Slightly over-confident in fast corners.
//
// Steering model: pure-pursuit toward an aim point on the racing line ahead.
// We sample the line a speed-scaled distance in front of the car, take the
// bearing from the car to that point, and steer to null the bearing error.
// This looks far enough ahead to load a corner early yet aims at an actual
// point (not just a tangent), so it holds the line instead of understeering
// wide into the outside rail — the failure the tangent-blend version had.
export const ANANSE_PERSONALITY = {
  aimBase: 12,          // metres of lookahead at a standstill
  aimPerSpeed: 0.42,    // extra lookahead metres per m/s of speed
  aimMin: 10,           // never aim closer than this
  aimMax: 40,           // …nor farther than this
  targetLateral: 0,     // preferred lateral offset from centre (0 = centre line)
  steerDeadzone: 0.02,  // bearing error (rad) below which we hold straight
  curveThreshold: 0.05, // curvature at/under which a corner imposes no speed cap
  cornerSpeed: 46,      // safe speed (m/s) for a corner right at the threshold
  brakeSlope: 42,       // m/s shed per unit of curvature above the threshold
  brakeDecel: 34,       // m/s² the planner assumes it can brake at (≈ real rate)
  scanRange: 120,       // metres of track ahead scanned for corners
  scanStep: 4,          // sample spacing for that scan
  boostCurveCap: 0.03,  // only boost when the road just ahead is near-straight
};

function normalizeAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

// Safe speed for a given track curvature: sweepers keep most speed, tight
// hairpins get crawled. Curvature at/under the threshold imposes no limit.
function cornerSpeedFor(curvature, personality) {
  if (curvature <= personality.curveThreshold) return Infinity;
  return Math.max(8, personality.cornerSpeed - (curvature - personality.curveThreshold) * personality.brakeSlope);
}

// The heart of the throttle controller: look ahead point by point, and for each
// corner work out whether — at the car's braking rate — we must start shedding
// speed *now* to arrive at that corner's safe speed. Returns the target speed
// the car should hold this instant (the min over all points that are already
// within braking distance), or Infinity if the road ahead is clear.
// Physics: to slow from v to vSafe over distance s needs v² - vSafe² ≤ 2·a·s,
// so a corner at distance s only constrains us once v² > vSafe² + 2·a·s.
function targetSpeedAhead(car, personality, brakeDecel) {
  const { scanRange, scanStep } = personality;
  let target = Infinity;
  for (let d = personality.aimMin * 0.4; d <= scanRange; d += scanStep) {
    const c = Math.abs(getTrackFrame(wrapDistance(car.distance + d)).curvature);
    const vSafe = cornerSpeedFor(c, personality);
    if (vSafe === Infinity) continue;
    // Distance we'd still be travelling before reaching the corner mouth.
    const s = Math.max(0, d - personality.aimMin * 0.4);
    // Highest speed from which we could still brake down to vSafe over s metres.
    const reachable = Math.sqrt(vSafe * vSafe + 2 * brakeDecel * s);
    if (reachable < target) target = reachable;
  }
  return target;
}

export function createAiInput(car, personality = ANANSE_PERSONALITY) {
  const {
    aimBase,
    aimPerSpeed,
    aimMin,
    aimMax,
    targetLateral,
    steerDeadzone,
    boostCurveCap,
  } = personality;

  const speed = car.forwardSpeed;

  // --- Steering: pure pursuit toward an aim point on the racing line.
  // The aim distance grows with speed so fast sections steer smoothly and slow
  // hairpins aim close enough to actually rotate through the corner.
  const aimDist = Math.min(aimMax, Math.max(aimMin, aimBase + Math.max(0, speed) * aimPerSpeed));
  const aim = pointAt(wrapDistance(car.distance + aimDist), targetLateral);

  // Bearing from the car to the aim point, compared to where the nose points.
  const toAim = Math.atan2(aim.x - car.position.x, aim.z - car.position.z);
  const bearingError = normalizeAngle(toAim - car.yaw);

  // Rail recovery: if we're jammed against a wall with the nose pointing into
  // it, pure pursuit alone can stall (the aim point sits behind the wall). Force
  // a hard steer away from the rail so the escape assist in updateVehicle fires.
  // That assist only kicks in when steer * railSide > 0 (see vehicle.js): +steer
  // (a LEFT input) pushes the car toward -lateral, so to peel off the +lateral
  // wall (railSide > 0) we must steer LEFT. railSide < 0 is the mirror.
  const pinned = car.railSide !== 0 && Math.abs(car.lateral) > 3;

  // Steering with hysteresis so it doesn't hunt. A binary L/R input around a
  // tight deadzone snaps back and forth every frame near straight — the "zig
  // zag". We keep steering the same way until the error clearly crosses to the
  // other side (outer band), and only centre inside the tighter inner band.
  // ai.steerDir persists on the car between frames.
  const ai = car.ai || (car.ai = { steerDir: 0 });
  let left, right;
  if (pinned) {
    left = car.railSide > 0;
    right = car.railSide < 0;
    ai.steerDir = left ? 1 : -1;
  } else {
    const outer = steerDeadzone * 3;   // must exceed this to *start*/flip a turn
    const inner = steerDeadzone;       // fall inside this to straighten up
    if (bearingError > outer) ai.steerDir = 1;
    else if (bearingError < -outer) ai.steerDir = -1;
    else if (Math.abs(bearingError) < inner) ai.steerDir = 0;
    // else: hold the previous steerDir (the dead band)
    left = ai.steerDir > 0;
    right = ai.steerDir < 0;
  }

  // --- Throttle / brake: hold the speed the road ahead can take, with a coast
  // band so we don't flicker gas↔brake at the threshold (the stop-and-go feel).
  // targetSpeedAhead folds in braking distance, so we only brake for a corner
  // once it's close enough to need it — straights stay flat-out.
  // Hysteresis: start braking only when clearly over target, keep braking until
  // back under it; between the two, coast (no gas, no brake).
  const targetSpeed = targetSpeedAhead(car, personality, personality.brakeDecel);
  const over = speed - targetSpeed;
  if (pinned) ai.braking = false;
  else if (over > 2.5) ai.braking = true;
  else if (over < 0.5) ai.braking = false;
  const brake = !!ai.braking && !pinned;
  // Gas whenever not braking and still below the corner's ceiling — only a
  // narrow coast band right at target keeps gas and brake from fighting. This
  // keeps the straights flat-out instead of dawdling below the safe speed.
  const gas = pinned || (!brake && over < -0.3 && speed < 60);

  // --- Boost: only when the road right ahead is genuinely open, at speed.
  const nearCurve = Math.abs(getTrackFrame(wrapDistance(car.distance + 8)).curvature);
  const boost = !pinned
    && car.boostCharges > 0
    && car.boostCooldown <= 0
    && nearCurve < boostCurveCap
    && targetSpeed > 45
    && speed > 30;

  return { left, right, gas, brake, boost, handbrake: false, autoGas: false };
}

// Compute Ananse's race quip based on the gap between AI and player.
// gapMetres > 0 means Ananse is ahead; < 0 means player is ahead.
const WINNING_LINES = [
  "Ei, are you even trying? My grandmother drives faster!",
  "The spider always catches his prey — but you already caught nothing.",
  "I am not driving. I am dancing. You are… struggling.",
  "You cannot beat Ananse. I wrote the road.",
  "Ha! Keep chasing. The view from behind is educational.",
];
const LOSING_LINES = [
  "Hmm. I am… warming up. Don't laugh.",
  "This is tactics. I am letting you feel comfortable. Big mistake.",
  "I tripped on a corner. It won't happen twice. Or three times.",
  "Okay okay okay. Ananse does not panic. Watch.",
  "Enjoy it now. The web closes at the finish line.",
];
const FINAL_LAP_LINES = [
  "Last lap. This is where the story ends — your story.",
  "Final lap! The spider springs the trap.",
  "One lap left. Time to show what Ananse is really made of.",
];
const OVERTAKE_LINES = [
  "Ei! You got lucky. Very lucky.",
  "Was that… a pass? On ME? Unacceptable.",
  "Fine. You have speed. I have cunning. We will see.",
];
const TAKEN_OVERTAKE_LINES = [
  "Back where I belong. Did you miss me?",
  "That's it. That's the line. Thank you for holding it warm.",
  "And just like that — Ananse is home.",
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Call this from the game loop when notable events happen.
// Returns a quip string or null if nothing to say right now.
export function getAnanseLine(event) {
  switch (event) {
    case "winning":       return pickRandom(WINNING_LINES);
    case "losing":        return pickRandom(LOSING_LINES);
    case "final_lap":     return pickRandom(FINAL_LAP_LINES);
    case "overtaken":     return pickRandom(OVERTAKE_LINES);
    case "overtook":      return pickRandom(TAKEN_OVERTAKE_LINES);
    default:              return null;
  }
}
