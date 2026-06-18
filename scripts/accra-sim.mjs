// Headless drive of the Accra City Run: activates the track, then runs the same
// proportional bot the validator uses to confirm the loop completes and to read
// a lap time for medal calibration.
import { createVehicleState, updateVehicle } from "./vehicle.js";
import { setActiveTrack, getTrackLength, TRACK } from "./track.js";

setActiveTrack("accra-city");

const DT = 1 / 60;
const IDLE = { left: false, right: false, gas: false, brake: false, handbrake: false, boost: false };
const lapLen = getTrackLength();

const car = createVehicleState();
let frames = 0;
let railFrames = 0;
const lapTimes = [];
let lastLap = 0;
let maxAbsLateral = 0;

while (car.lap < TRACK.laps && frames < 60 * 900) {
  const target = -0.08 * car.lateral;
  const u = car.headingError - target;
  updateVehicle(car, { ...IDLE, gas: true, left: u > 0.04, right: u < -0.04 }, DT);
  frames += 1;
  if (car.railContact) railFrames += 1;
  maxAbsLateral = Math.max(maxAbsLateral, Math.abs(car.lateral));
  if (car.lap > lastLap) {
    lapTimes.push(Math.round(car.timeMs));
    lastLap = car.lap;
  }
}

const finished = car.lap >= TRACK.laps;
console.log(JSON.stringify({
  track: TRACK.name,
  lapLengthM: Math.round(lapLen),
  laps: TRACK.laps,
  finished,
  totalTimeS: (car.timeMs / 1000).toFixed(1),
  perLapS: lapTimes.map((t, i) => ((t - (lapTimes[i - 1] || 0)) / 1000).toFixed(1)),
  railContactPct: ((railFrames / frames) * 100).toFixed(1) + "%",
  maxAbsLateral: maxAbsLateral.toFixed(2),
  coins: car.coins.size,
  endKmh: Math.round(car.forwardSpeed * 3.6),
}, null, 2));
process.exit(finished ? 0 : 1);
