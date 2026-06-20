// Headless anti-cheat QA: drives the real vehicle through a full race with the
// bang-bang bot from qa-sim, then checks that validateRun accepts the
// legitimate run and rejects forged ones.
import { createVehicleState, updateVehicle } from "./game/vehicle.js";
import { TRACK } from "./game/track.js";
import { validateRun } from "./lib/challenges.js";

const DT = 1 / 60;
const IDLE = { left: false, right: false, gas: false, brake: false, handbrake: false, boost: false };

const car = createVehicleState();
let frames = 0;
while (car.lap < TRACK.laps && frames < 60 * 600) {
  const target = -0.08 * car.lateral;
  const u = car.headingError - target;
  updateVehicle(car, { ...IDLE, gas: true, left: u > 0.04, right: u < -0.04 }, DT);
  frames += 1;
}
if (car.lap < TRACK.laps) {
  console.error("bot failed to finish the race");
  process.exit(1);
}

// mirror the client's decimation in components/RaceGame.jsx
function decimateGhost(samples, max) {
  if (samples.length <= max) return samples;
  const out = [];
  const step = (samples.length - 1) / (max - 1);
  for (let i = 0; i < max; i += 1) out.push(samples[Math.round(i * step)]);
  return out;
}

const run = {
  timeMs: Math.round(car.timeMs),
  coins: car.coins.size,
  driftScore: Math.round(car.driftScore),
  boostUses: car.boostUses,
  ghost: decimateGhost(car.ghost, 500),
};

// Inject frame-hitch projection snaps: bump cumulative distance at scattered
// samples. The lenient policy accepts these — they were never a forgery.
function withGlitches(ghost, count) {
  const out = ghost.map((s) => ({ ...s }));
  const step = Math.floor(out.length / (count + 1));
  for (let k = 1; k <= count; k += 1) out[k * step].d += 40;
  return out;
}

// LENIENT-POLICY contract: reject ONLY blatant non-runs (no/incomplete race
// data, or a physically-impossible time). Everything a real run could ever
// produce — including odd boost/coin counts, glitchy traces, and merely-fast
// (but possible) times — is accepted. Sharing must never be blocked for them.
const cases = {
  // expect: accepted (null)
  legitBotRun: { expect: null, got: validateRun(run) },
  // expect: rejected — the classic curl cheat, a bare time with no trace
  bareTimePost: { expect: "reject", got: validateRun({ timeMs: 65000, name: "hacker" }) },
  // expect: rejected — too few samples to be a real race
  shortGhost: { expect: "reject", got: validateRun({ ...run, ghost: run.ghost.slice(0, 20) }) },
  // expect: rejected — trace never reaches the finish line (incomplete race data)
  truncatedGhost: { expect: "reject", got: validateRun({ ...run, ghost: run.ghost.slice(0, 150) }) },
  // expect: rejected — a time physically faster than the car can cross the course
  impossiblyFastTime: { expect: "reject", got: validateRun({ ...run, timeMs: 5000 }) },
  // expect: ACCEPTED — fast but still physically possible; leniency lets it through
  fastButPossibleTime: { expect: null, got: validateRun({ ...run, timeMs: Math.round(run.timeMs * 0.85) }) },
  // expect: ACCEPTED — boost/coin counts no longer gate a run (they false-rejected legit play)
  boostFlood: { expect: null, got: validateRun({ ...run, boostUses: 999 }) },
  coinFlood: { expect: null, got: validateRun({ ...run, coins: 999 }) },
  // expect: ACCEPTED — a handful of frame-hitch distance snaps (the city-circuit bug)
  frameHitchGlitches: { expect: null, got: validateRun({ ...run, ghost: withGlitches(run.ghost, 8) }) },
  // expect: accepted — run explicitly tagged with the current track
  explicitTrack: { expect: null, got: validateRun({ ...run, trackId: TRACK.id }) },
  // expect: accepted — legacy client payload with no trackId resolves to the default track
  legacyNoTrack: { expect: null, got: validateRun({ ...run, trackId: undefined }) },
  // expect: rejected — a track this server doesn't know
  unknownTrack: { expect: "reject", got: validateRun({ ...run, trackId: "midnight-bay" }) },
};

let failed = false;
for (const [name, { expect, got }] of Object.entries(cases)) {
  const pass = expect === null ? got === null : got !== null;
  if (!pass) failed = true;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}: ${got === null ? "accepted" : `rejected (${got})`}`);
}
console.log(`\nbot race: ${(run.timeMs / 1000).toFixed(1)}s, ${run.ghost.length} ghost samples, ${run.coins} coins`);
process.exit(failed ? 1 : 0);
