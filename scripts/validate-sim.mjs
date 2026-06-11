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

const cases = {
  // expect: accepted (null)
  legitBotRun: { expect: null, got: validateRun(run) },
  // expect: rejected — the classic curl cheat, a bare time with no trace
  bareTimePost: { expect: "reject", got: validateRun({ timeMs: 65000, name: "hacker" }) },
  // expect: rejected — real ghost, fraudulently lowered time
  loweredTime: { expect: "reject", got: validateRun({ ...run, timeMs: Math.round(run.timeMs * 0.5) }) },
  // expect: rejected — ghost timestamps compressed to match a fast fake time
  compressedGhost: {
    expect: "reject",
    got: validateRun({
      ...run,
      timeMs: Math.round(run.timeMs * 0.45),
      ghost: run.ghost.map((s) => ({ ...s, t: Math.round(s.t * 0.45) })),
    }),
  },
  // expect: rejected — trace stops partway through the race
  truncatedGhost: { expect: "reject", got: validateRun({ ...run, ghost: run.ghost.slice(0, 150) }) },
  // expect: rejected — impossible pickup count
  coinFlood: { expect: "reject", got: validateRun({ ...run, coins: 999 }) },
};

let failed = false;
for (const [name, { expect, got }] of Object.entries(cases)) {
  const pass = expect === null ? got === null : got !== null;
  if (!pass) failed = true;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}: ${got === null ? "accepted" : `rejected (${got})`}`);
}
console.log(`\nbot race: ${(run.timeMs / 1000).toFixed(1)}s, ${run.ghost.length} ghost samples, ${run.coins} coins`);
process.exit(failed ? 1 : 0);
