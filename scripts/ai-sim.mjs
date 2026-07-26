// Headless QA for the Ananse AI driver: runs the real ai-driver/vehicle/track
// modules on Akina Ridge through six scenarios and reports pace, smoothness,
// rubber-band behaviour, overtaking and crash recovery. Run after any
// ai-driver or handling change; every scenario must end healthy: true.
//
// Healthy numbers (2026-07-23 rubber-band tuning):
//   solo        ~44s laps, rail 0%, drift 0%, flips/s < 0.5
//   vsGold      lap-matched to a 43.2 s/lap rival, |gap| mean < 40 m
//   vsSlow      mercy band caps the runaway gap under ~450 m
//   crashed     spun/rammed every 10 s → always recovers, no stall > 5 s
// Added 2026-07-26 with the difficulty pace lift:
//   pace        full 3-lap solo finish per tier, strictly ordered easy →
//               legend; hard < 108 s, legend < 102 s, no rail contact anywhere
//   blocking    catching a slower car must not turn into a bumper queue —
//               he has to pass it, not push it (contact under 10% of frames)
import { createVehicleState, updateVehicle, resolveCarCollision } from "./vehicle.js";
import { createAiInput, ANANSE_PERSONALITY, ANANSE_DIFFICULTIES } from "./ai-driver.js";
import { setActiveTrack, getTrackLength, TRACK } from "./track.js";

setActiveTrack("akina-ridge");
const DT = 1 / 60;
const L = getTrackLength();

function progress(c) {
  return (c.lap + (c.startGatePassed ? 1 : 0)) * L + ((c.distance - TRACK.startDistance + L) % L);
}

function runRace({ seconds, rivalLapSeconds = null, shoveEveryS = 0 }) {
  const car = createVehicleState("street");
  car.distance -= 7; // Ananse spawns 7 m behind the player
  const rival = rivalLapSeconds ? { lap: 0, distance: 50, startGatePassed: false } : null;
  const rate = rivalLapSeconds ? L / rivalLapSeconds : 0;

  let flips = 0, lastSteer = 0, rail = 0, drift = 0;
  let minV = Infinity, maxLat = 0, yawJerk = 0, prevYawVel = 0;
  const laps = [];
  let lastLap = 0, lapStart = 0;
  const gaps = [];
  let stallsOver1s = 0, worstStall = 0, stallStart = null, shoves = 0;
  const steps = Math.round(seconds / DT);

  for (let i = 0; i < steps; i += 1) {
    const t = i * DT;
    if (rival) {
      const prev = rival.distance;
      let d = prev + rate * DT;
      if (d >= L) d -= L;
      if (prev < TRACK.startDistance && d >= TRACK.startDistance) {
        if (rival.startGatePassed) rival.lap += 1;
        rival.startGatePassed = true;
      }
      rival.distance = d;
    }
    // simulate the player ramming/spinning the AI — harsher than in-game
    // collisions, which never rotate the car
    if (shoveEveryS && t > 10 && Math.floor(t / shoveEveryS) !== Math.floor((t - DT) / shoveEveryS)) {
      shoves += 1;
      car.yaw += (shoves % 2 ? 1 : -1) * (0.8 + (shoves % 3) * 0.5);
      car.velocity.multiplyScalar(0.25);
      car.impact = 0.5;
    }
    const input = createAiInput(car, ANANSE_PERSONALITY, rival);
    const s = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    if (s !== 0 && lastSteer !== 0 && s !== lastSteer) flips += 1;
    if (s !== 0) lastSteer = s;
    updateVehicle(car, input, DT);
    if (car.railContact) rail += 1;
    if (car.drifting) drift += 1;
    if (i > 200) {
      minV = Math.min(minV, car.forwardSpeed);
      maxLat = Math.max(maxLat, Math.abs(car.lateral));
      yawJerk += Math.abs(car.yawVelocity - prevYawVel);
      if (car.forwardSpeed < 5) {
        if (stallStart === null) stallStart = t;
      } else if (stallStart !== null) {
        const len = t - stallStart;
        if (len > 1) stallsOver1s += 1;
        worstStall = Math.max(worstStall, len);
        stallStart = null;
      }
    }
    prevYawVel = car.yawVelocity;
    if (rival && i % 60 === 0) gaps.push(progress(car) - progress(rival));
    if (car.lap > lastLap) {
      laps.push(Number((t - lapStart).toFixed(1)));
      lapStart = t;
      lastLap = car.lap;
    }
  }
  const gAbs = gaps.map(Math.abs);
  return {
    laps,
    minKmh: Math.round(minV * 3.6),
    maxAbsLateral: Number(maxLat.toFixed(2)),
    flipsPerSec: Number((flips / seconds).toFixed(2)),
    railPct: Number(((rail / steps) * 100).toFixed(1)),
    driftPct: Number(((drift / steps) * 100).toFixed(1)),
    yawJerkPerSec: Number((yawJerk / (seconds - 3.3)).toFixed(2)),
    boostsUsed: car.boostUses,
    gapMeanAbs: gaps.length ? Math.round(gAbs.reduce((a, b) => a + b) / gAbs.length) : null,
    gapMax: gaps.length ? Math.round(Math.max(...gaps)) : null,
    stallsOver1s,
    worstStallS: Number(worstStall.toFixed(1)),
    shoves,
  };
}

const results = {};

results.solo = runRace({ seconds: 200 });
results.solo.healthy =
  results.solo.laps.length >= 4 &&
  Math.max(...results.solo.laps) < 47 &&
  results.solo.railPct === 0 &&
  results.solo.flipsPerSec < 0.5 &&
  results.solo.minKmh > 20;

results.vsGold = runRace({ seconds: 180, rivalLapSeconds: 43.2 });
results.vsGold.healthy =
  results.vsGold.gapMeanAbs < 40 &&
  results.vsGold.railPct === 0 &&
  Math.max(...results.vsGold.laps) < 46;

results.vsSlow = runRace({ seconds: 180, rivalLapSeconds: 55 });
results.vsSlow.healthy = results.vsSlow.gapMax < 450 && results.vsSlow.railPct === 0;

results.crashed = runRace({ seconds: 180, rivalLapSeconds: 45, shoveEveryS: 10 });
results.crashed.healthy =
  results.crashed.laps.length >= 2 && results.crashed.worstStallS < 5;

// --- pace: what does each difficulty actually run over a full race? The race
// ends on the third gate crossing (see RaceGame's `car.lap >= TRACK.laps`), so
// measure that, not a rolling lap average.
function soloFinish(personality, maxSeconds = 300) {
  const car = createVehicleState("street");
  car.distance -= 7;
  const laps = [];
  let lapStart = 0, lastLap = 0, rail = 0;
  for (let i = 0; i < Math.round(maxSeconds / DT); i += 1) {
    const t = i * DT;
    updateVehicle(car, createAiInput(car, personality, null), DT);
    if (car.railContact) rail += 1;
    if (car.lap > lastLap) { laps.push(Number((t - lapStart).toFixed(2))); lapStart = t; lastLap = car.lap; }
    if (car.lap >= TRACK.laps) {
      return { finishS: Number(t.toFixed(2)), laps, railFrames: rail, boosts: car.boostUses };
    }
  }
  return { finishS: null, laps, railFrames: rail, boosts: car.boostUses };
}

results.pace = Object.fromEntries(
  Object.entries(ANANSE_DIFFICULTIES).map(([id, p]) => [id, soloFinish(p)]),
);
results.pace.healthy =
  results.pace.easy.finishS > results.pace.medium.finishS &&
  results.pace.medium.finishS > results.pace.hard.finishS &&
  results.pace.hard.finishS < 108 &&
  results.pace.legend.finishS < 102 &&
  ["easy", "medium", "hard", "legend"].every((id) => results.pace[id].railFrames === 0);

// --- blocking: put a slower car on the racing line in front of him. Aiming at
// the centre line means aiming at exactly where it is, so without the overtake
// step-out he simply queues on its bumper for the rest of the race.
function runBlocking() {
  const ai = createVehicleState("street");
  ai.distance -= 7;
  const slow = createVehicleState("street");
  // a deliberately steady, centre-line car: same brain, fixed modest pace
  const slowBrain = {
    ...ANANSE_PERSONALITY,
    raceCruise: 30, minCruise: 30, maxCruise: 30,
    rubberBandGain: 0, mercyGap: Infinity, pushGap: -Infinity, overtakeOffset: 0,
  };
  let contact = 0, frames = 0, passedAt = null, aiFinish = null;
  for (let i = 0; i < Math.round(300 / DT); i += 1) {
    const t = i * DT;
    updateVehicle(ai, createAiInput(ai, ANANSE_DIFFICULTIES.hard, slow), DT);
    updateVehicle(slow, createAiInput(slow, slowBrain, null), DT);
    if (resolveCarCollision(slow, ai)) contact += 1;
    frames += 1;
    if (passedAt === null && progress(ai) - progress(slow) > 25) passedAt = Number(t.toFixed(1));
    if (ai.lap >= TRACK.laps) { aiFinish = Number(t.toFixed(2)); break; }
  }
  return { contactPct: Number(((contact / frames) * 100).toFixed(1)), passedAtS: passedAt, aiFinish };
}
results.blocking = runBlocking();
results.blocking.healthy =
  results.blocking.passedAtS !== null &&
  results.blocking.contactPct < 10 &&
  results.blocking.aiFinish !== null;

results.allHealthy = Object.values(results).every((r) => r.healthy !== false);
console.log(JSON.stringify(results, null, 2));
