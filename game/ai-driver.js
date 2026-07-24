// Ananse AI driver — lookahead racing line controller.
// Call createAiInput(car, personality, rival) each frame to get a synthetic
// input object compatible with updateVehicle(). Pass the player's car as
// `rival` to enable rubber-banding; the personality object tunes aggression so
// future opponents can feel distinct without changing this file.

import { getTrackFrame, getTrackLength, pointAt, TRACK, wrapDistance } from "./track.js";

// Default personality: Ananse. Tricky — runs a tight line, brakes late,
// occasionally boosts. Slightly over-confident in fast corners.
//
// Steering model: pure-pursuit toward an aim point on the racing line ahead.
// We sample the line a speed-scaled distance in front of the car, take the
// bearing from the car to that point, and steer to null the bearing error.
// This looks far enough ahead to load a corner early yet aims at an actual
// point (not just a tangent), so it holds the line instead of understeering
// wide into the outside rail — the failure the tangent-blend version had.
//
// Pace: rubber-banded off the live gap to the player so the race stays close
// for slow and fast drivers alike. The corner planner keeps him safe whatever
// the pace; the cruise band only caps how hard he runs the open road.
//   close race  → raceCruise (~41 s laps on Akina)
//   far behind  → up to maxCruise + real boost bursts (sub-38 s laps)
//   far ahead   → eases toward minCruise (~45 s laps) so the player stays in it
// Getting rammed hard flips him into a few seconds of push mode (max pace +
// boost when the road opens) — the crash costs him, then he bites back.
export const ANANSE_PERSONALITY = {
  aimBase: 12,             // metres of lookahead at a standstill
  aimPerSpeed: 0.42,       // extra lookahead metres per m/s of speed
  aimMin: 10,              // never aim closer than this
  aimMax: 40,              // …nor farther than this
  targetLateral: 0,        // preferred lateral offset from centre (0 = centre line)
  steerDeadzone: 0.02,     // bearing error (rad) below which we hold straight
  cornerConfidence: 0.85,  // fraction of the physically holdable corner speed he dares
  minCornerSpeed: 10,      // m/s floor so hairpins are driven, not crawled
  brakeDecel: 34,          // m/s² the planner assumes it can brake at (≈ real rate)
  scanRange: 120,          // metres of track ahead scanned for corners
  scanStep: 4,             // sample spacing for that scan
  raceCruise: 36,          // m/s pace when the race is close (gap ≈ 0)
  rubberBandGain: 0.15,    // m/s of pace shed/gained per metre ahead/behind
  minCruise: 31,           // race-pace floor while the player is in touch
  maxCruise: 46,           // flat-out ceiling when chasing (car top speed is 52)
  pushGap: -12,            // more than this many metres behind → boost to catch up
  crashPushMs: 3000,       // push-mode duration after taking a hard hit
  mercyGap: 150,           // lead (m) beyond which he eases below minCruise…
  mercyRate: 0.03,         // …shedding this much extra m/s per metre of lead
  mercyMaxShed: 9,         // …down to at most minCruise−9 (≈ bronze pace)
  boostMaxCurvature: 0.004, // only boost when the road ahead is straighter than R=250m
};

// Difficulty presets: same driver brain, different appetite. Only pace fields
// change — steering and the corner planner stay identical, so every level
// drives smoothly and the differences read as confidence, not competence.
//   easy   ≈ bronze pace: hangs with new players, almost never boosts
//   medium ≈ silver pace: the shipped default — honest fight, keeps it close
//   hard   ≈ gold+ pace : barely any mercy, boosts on sight, brakes later
export const ANANSE_DIFFICULTIES = {
  easy: {
    ...ANANSE_PERSONALITY,
    raceCruise: 30,
    rubberBandGain: 0.18,
    minCruise: 25,
    maxCruise: 36,
    pushGap: -60,
    mercyGap: 90,
    mercyMaxShed: 8,
    cornerConfidence: 0.8,
  },
  medium: ANANSE_PERSONALITY,
  hard: {
    ...ANANSE_PERSONALITY,
    raceCruise: 42,
    rubberBandGain: 0.12,
    minCruise: 38,
    maxCruise: 50,
    pushGap: -8,
    mercyGap: 350,
    mercyMaxShed: 4,
    cornerConfidence: 0.92,
    brakeDecel: 36,
  },
};

function normalizeAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

// Continuous race progress in metres, comparable between cars. Measured from
// the start gate (not the spline origin) and bumped by startGatePassed so the
// value is continuous at BOTH discontinuities: the spline wrap (distance→0,
// ~60 m before the gate) and the gate itself (where lap increments).
function raceProgress(car) {
  const L = getTrackLength();
  const fromGate = (car.distance - TRACK.startDistance + L) % L;
  return (car.lap + (car.startGatePassed ? 1 : 0)) * L + fromGate;
}

// Real road curvature (1/metres) at a track distance, from the heading change
// between two tangents a known arc length apart. The frame's `curvature` field
// is NOT usable here: it's a render-tuned scalar (sin of the heading swing over
// ~0.6% of the lap, ×9) whose magnitude depends on lap length — on Akina it
// runs 0–6.5, two orders of magnitude off a true 1/R.
function trackCurvature(distance, ds = 4) {
  const a = getTrackFrame(wrapDistance(distance)).tangent;
  const b = getTrackFrame(wrapDistance(distance + ds)).tangent;
  const cross = a.x * b.z - a.z * b.x;
  const dot = a.x * b.x + a.z * b.z;
  return Math.abs(Math.atan2(cross, dot)) / ds;
}

// Max speed the bicycle model can physically hold through a corner of curvature
// k, from the car's own tuning: steering lock shrinks with speed
// (lock = MAX_STEER_LOCK / (1 + v·falloff)), and yaw rate is capped. Solve
// tan(lock(v))·v/L = k·v for the lock limit and yawRate/v = k for the cap, take
// the lower, and scale by how much of that limit this personality dares to use.
function cornerSpeedFor(k, car, personality) {
  if (k < 1e-4) return Infinity;
  const t = car.tuning;
  const falloff = TRACK.handling?.lockFalloff ?? 0.095;
  const lockNeeded = Math.atan(k * t.WHEELBASE);
  if (lockNeeded >= t.MAX_STEER_LOCK) return personality.minCornerSpeed;
  const vLock = (t.MAX_STEER_LOCK / lockNeeded - 1) / falloff;
  const vYaw = t.MAX_YAW_RATE / k;
  return Math.max(personality.minCornerSpeed, personality.cornerConfidence * Math.min(vLock, vYaw));
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
    const k = trackCurvature(car.distance + d, scanStep);
    const vSafe = cornerSpeedFor(k, car, personality);
    if (vSafe === Infinity) continue;
    // Distance we'd still be travelling before reaching the corner mouth.
    const s = Math.max(0, d - personality.aimMin * 0.4);
    // Highest speed from which we could still brake down to vSafe over s metres.
    const reachable = Math.sqrt(vSafe * vSafe + 2 * brakeDecel * s);
    if (reachable < target) target = reachable;
  }
  return target;
}

export function createAiInput(car, personality = ANANSE_PERSONALITY, rival = null) {
  const {
    aimBase,
    aimPerSpeed,
    aimMin,
    aimMax,
    targetLateral,
    steerDeadzone,
    boostMaxCurvature,
  } = personality;

  const speed = car.forwardSpeed;
  const ai = car.ai || (car.ai = { pwm: 0, pushUntil: 0 });

  // --- Rubber band: pace off the live gap to the rival (in metres of total
  // race distance; positive = we're ahead). A hard hit (car.impact is set by
  // car-to-car collisions and heavy rail strikes) triggers push mode: a few
  // seconds at max pace with boost, so ramming Ananse costs him the moment but
  // provokes a counterattack instead of leaving him crippled.
  // NOTE: lap*L + distance is NOT continuous — lap increments at the start
  // gate while distance wraps at the spline origin ~60 m earlier (the same
  // boundary dip the PB delta timer works around). raceProgress() is gate-
  // aligned and continuous, so the gap never misreads by a lap length.
  const gap = rival ? raceProgress(car) - raceProgress(rival) : 0;
  if (car.impact > 0.25 && rival) ai.pushUntil = car.timeMs + personality.crashPushMs;
  const pushing = ai.pushUntil > car.timeMs;
  // Mercy band: once the lead passes mercyGap he keeps easing below minCruise
  // (bounded by mercyMaxShed) so even bronze-pace players keep him in sight.
  // Skilled players never open that lead at raceCruise, so they never see it.
  const mercy = Math.min(
    personality.mercyMaxShed,
    Math.max(0, (gap - personality.mercyGap) * personality.mercyRate),
  );
  const cruise = pushing
    ? personality.maxCruise
    : Math.min(
        personality.maxCruise,
        Math.max(personality.minCruise, personality.raceCruise - gap * personality.rubberBandGain),
      ) - mercy;

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
  // ONLY at crawl speed: at race speed the cushion + pursuit recover on their
  // own, and forcing full lock here turned every wall kiss into a full-lock
  // ping-pong between the two rails (the mid-straight zig-zag).
  const pinned = car.railSide !== 0 && Math.abs(car.lateral) > 3 && speed < 10;

  // Steering: the input is a binary key, but holding it means FULL lock — at
  // speed that constantly trips the drift state and saws the car left-right
  // (the visible zig-zag). Instead, compute the *fraction* of available lock
  // pure pursuit actually needs (its curvature is 2·sin(bearing)/aimDist) and
  // duty-cycle the key so the smoothed steer input averages that fraction.
  // The duty is boosted to compensate for steer centring (10/s) being faster
  // than wind-on (3.3/s) in updateVehicle. ai.pwm carries the duty remainder
  // across frames.
  let left = false;
  let right = false;
  if (pinned) {
    left = car.railSide > 0;
    right = car.railSide < 0;
    ai.pwm = 0;
  } else if (Math.abs(bearingError) > steerDeadzone) {
    const t = car.tuning;
    const falloff = TRACK.handling?.lockFalloff ?? 0.095;
    const lockAvail = t.MAX_STEER_LOCK / (1 + Math.abs(speed) * falloff);
    const kPursuit = (2 * Math.sin(bearingError)) / aimDist;
    // Yaw-rate damping: kPursuit alone is a pure P-controller and rings after
    // a big disturbance (a shove from the player, a wall kiss) — the car snaps
    // past centre and corrects the other way, over and over. Trim the demanded
    // curvature by the EXCESS yaw rate over what this curvature needs; in a
    // steady corner (yawVel == v·k) the term vanishes, so clean cornering is
    // untouched while post-impact swings settle in one cycle.
    const vc = Math.max(8, Math.abs(speed));
    const excessYaw = car.yawVelocity - speed * kPursuit;
    const kCmd = kPursuit - excessYaw / vc;
    const frac = Math.max(-1, Math.min(1, Math.atan(kCmd * t.WHEELBASE) / lockAvail));
    const windOn = TRACK.handling?.steerWindOn ?? 3.3;
    const m = Math.abs(frac);
    const duty = (10 * m) / (windOn + (10 - windOn) * m);
    ai.pwm += duty;
    if (ai.pwm >= 1) {
      ai.pwm -= 1;
      left = frac > 0;
      right = frac < 0;
    }
  } else {
    ai.pwm = 0;
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
  // Gas whenever not braking and below both the corner ceiling and the cruise
  // band from the rubber band above. While a boost is burning (boostTimer set
  // by updateVehicle) the cap lifts, otherwise the throttle cutoff would waste
  // the charge — flames with no acceleration. Brakes stay planner-only: pace is
  // shed by coasting, never by brake lights on an empty straight.
  const boosting = car.boostTimer > 0;
  const cruiseCap = boosting ? cruise + 12 : cruise;
  const gas = pinned || (!brake && over < -0.3 && speed < cruiseCap);

  // --- Boost: only when chasing (well behind, or biting back after a hit) and
  // the road right ahead is genuinely open — never to pad a lead.
  const nearK = trackCurvature(car.distance + 8, 6);
  const boost = !pinned
    && (pushing || gap < personality.pushGap)
    && car.boostCharges > 0
    && car.boostCooldown <= 0
    && nearK < boostMaxCurvature
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
  "Chale, I can see you in my mirror. Small small, you'll get there.",
  "I've counted the coins on this road twice already. Still waiting for you.",
  "Is your gas pedal shy? Press it. Press it hard.",
  "Even the mountain is bored of watching you chase me.",
  "Take your time o. The finish line and I are old friends.",
];
const LOSING_LINES = [
  "Hmm. I am… warming up. Don't laugh.",
  "This is tactics. I am letting you feel comfortable. Big mistake.",
  "I tripped on a corner. It won't happen twice. Or three times.",
  "Okay okay okay. Ananse does not panic. Watch.",
  "Enjoy it now. The web closes at the finish line.",
  "Herh! Who taught you to drive like that?!",
  "I let you lead. Stories need suspense. Ask anyone.",
  "The road is lying to you. It loves me more.",
  "Small mistake. Even spiders slip on their own web. Once.",
  "Enjoy the front. I'm back here studying your weaknesses.",
];
const FINAL_LAP_LINES = [
  "Last lap. This is where the story ends — your story.",
  "Final lap! The spider springs the trap.",
  "One lap left. Time to show what Ananse is really made of.",
  "One more lap. The web is already spun.",
  "Final lap, chale. This is where legends are made — by me.",
  "Last lap! I hope you saved nothing, because I saved everything.",
];
const OVERTAKE_LINES = [
  "Ei! You got lucky. Very lucky.",
  "Was that… a pass? On ME? Unacceptable.",
  "Fine. You have speed. I have cunning. We will see.",
  "Herh! Did you just—? Okay. OKAY.",
  "Enjoy that one. Frame it. It won't happen again.",
  "Even the referee didn't see that coming. Impressive. Annoying.",
  "Bold. Very bold. The spider remembers everything.",
];
const TAKEN_OVERTAKE_LINES = [
  "Back where I belong. Did you miss me?",
  "That's it. That's the line. Thank you for holding it warm.",
  "And just like that — Ananse is home.",
  "Excuse me — coming through. Official business.",
  "You held that position well. For a while.",
  "See how smooth? Not even the wind noticed me pass.",
  "That's the difference between driving and Ananse driving.",
];

// Ananse has crossed the finish line first and parked at the line while the
// player is still out on track — one last word, then he goes quiet.
const FINISHED_LINES = [
  "Chale, I'm parked already. Take your time — I'll wait.",
  "Finished. First. As always. I'll keep the engine warm for your excuses.",
  "The web closed at the line. I'm on the other side of it. Waiting.",
  "Done o. Now I get to watch YOU finish. Very educational.",
  "Ananse has crossed. The rest of the road can fight for second.",
  "I'll be right here at the line — chopping first, resting easy.",
];

// Finish-screen verdicts. {m} in a defeat line is replaced with the winning
// margin in metres when we have one.
const DEFEAT_LINES = [ // the player beat him
  "Ei! {m} metres?! Lucky. Very lucky. Rematch — right now.",
  "Fine. FINE. You won. The road was slippery. My shoe was loose. Rematch.",
  "You beat the spider… today. Tomorrow the web is tighter.",
  "Chale… okay. That was real driving. Don't let it enter your head.",
  "I demand a recount. And a rematch. Mostly a rematch.",
  "You chopped first. But the pot is still full — run it back.",
  "Impressive. I taught you well. Yes — I am taking the credit.",
];
const VICTORY_LINES = [ // Ananse took the win
  "I told you — I wrote the road. Run it back if you dare.",
  "The web closed at the finish line. Just as I said it would.",
  "Don't be sad. Losing to Ananse is a rite of passage.",
  "You drove well! I drove like Ananse. There is no shame… okay, small shame.",
  "The mountain has spoken, and it said my name.",
  "One more? I'll even pretend to be worried this time.",
  "Delete this race from your memory. I'll keep it in mine forever.",
];

// Shuffle-bag picker: deals every line in a pool in random order before any
// repeats, and remembers across races in the session — so back-to-back
// rematches hear fresh material instead of the same three favourites.
const decks = new Map();
function pickFresh(key, pool) {
  let deck = decks.get(key);
  if (!deck || deck.length === 0) {
    deck = [...pool];
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    decks.set(key, deck);
  }
  return deck.pop();
}

// Call this from the game loop when notable events happen.
// Returns a quip string or null if nothing to say right now.
export function getAnanseLine(event) {
  switch (event) {
    case "winning":       return pickFresh("winning", WINNING_LINES);
    case "losing":        return pickFresh("losing", LOSING_LINES);
    case "final_lap":     return pickFresh("final_lap", FINAL_LAP_LINES);
    case "overtaken":     return pickFresh("overtaken", OVERTAKE_LINES);
    case "overtook":      return pickFresh("overtook", TAKEN_OVERTAKE_LINES);
    case "finished":      return pickFresh("finished", FINISHED_LINES);
    default:              return null;
  }
}

// Finish-screen line: playerWon is from the player's perspective;
// marginMeters is how far short of the finish Ananse was when the player won.
export function getAnanseFinishLine(playerWon, marginMeters = 0) {
  const line = playerWon ? pickFresh("defeat", DEFEAT_LINES) : pickFresh("victory", VICTORY_LINES);
  // photo finishes still deserve a number to complain about
  return line.replace("{m}", String(Math.max(1, Math.round(marginMeters))));
}
