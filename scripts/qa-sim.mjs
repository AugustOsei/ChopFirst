import { createVehicleState, updateVehicle, listVehicles } from "./vehicle.js";

const DT = 1 / 60;
const IDLE = { left: false, right: false, gas: false, brake: false, handbrake: false, boost: false };

function run(car, input, seconds, onTick) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i += 1) {
    updateVehicle(car, { ...IDLE, ...input }, DT);
    if (onTick) onTick(car, i * DT);
  }
}

function fresh(vehicle) {
  return createVehicleState(vehicle);
}

const results = {};

// 1. Gas only: must build speed and eventually hit a rail on a bend, keeping scrape motion.
{
  const car = fresh();
  let maxSpeed = 0;
  let firstHit = null;
  const scrapeSpeeds = [];
  run(car, { gas: true }, 12, (c, t) => {
    maxSpeed = Math.max(maxSpeed, c.forwardSpeed);
    if (c.railSide !== 0 && !firstHit) firstHit = { t: t.toFixed(2), speed: c.forwardSpeed.toFixed(1) };
    if (firstHit && c.railContact) scrapeSpeeds.push(c.forwardSpeed);
  });
  results.gasOnly = {
    maxKmh: Math.round(maxSpeed * 3.6),
    firstHit,
    scrapeAvgSpeed: scrapeSpeeds.length ? (scrapeSpeeds.reduce((a, b) => a + b) / scrapeSpeeds.length).toFixed(1) : null,
    speedAfter12s: car.forwardSpeed.toFixed(1),
    lateral: car.lateral.toFixed(2),
    pinned: car.railSide,
  };

  // 2. Recovery: keep gas, steer away from the rail until back inside the road.
  const steerAway = car.railSide > 0 ? { left: true } : { right: true };
  let freedAt = null;
  let t = 0;
  for (let i = 0; i < 240; i += 1) {
    updateVehicle(car, { ...IDLE, gas: true, ...(Math.abs(car.lateral) > 2.5 ? steerAway : {}) }, DT);
    t += DT;
    if (freedAt === null && Math.abs(car.lateral) < 4.0) freedAt = t;
  }
  results.recovery = {
    freedAfterSeconds: freedAt?.toFixed(2) ?? "never",
    lateralAfter: car.lateral.toFixed(2),
    speedAfter: Math.round(car.forwardSpeed * 3.6) + " km/h",
    backOnRoad: Math.abs(car.lateral) < 4.2,
  };
}

// 2b. Recovery with a simple proportional driver: pin the car, then let a basic
// "player" (aim heading at a lane-centering target) drive for 6s on gas.
{
  const car = fresh();
  run(car, { gas: true }, 12); // ends pinned on a rail per scenario 1
  let minSpeedAfterEscape = Infinity;
  let maxAbsLateral = 0;
  let freed = false;
  for (let i = 0; i < 360; i += 1) {
    // headingError = roadYaw - yaw; steering right lowers it. Aim for the
    // heading that drains lateral offset back to center.
    const target = -0.08 * car.lateral;
    const u = car.headingError - target;
    const input = { gas: true, left: u > 0.03, right: u < -0.03 };
    updateVehicle(car, { ...IDLE, ...input }, DT);
    if (!freed && Math.abs(car.lateral) < 3.8) freed = true;
    if (freed && i > 120) {
      minSpeedAfterEscape = Math.min(minSpeedAfterEscape, car.forwardSpeed);
      maxAbsLateral = Math.max(maxAbsLateral, Math.abs(car.lateral));
    }
  }
  results.recoveryDriver = {
    freed,
    endKmh: Math.round(car.forwardSpeed * 3.6),
    minKmhAfterEscape: Math.round(minSpeedAfterEscape * 3.6),
    maxAbsLateralAfter: maxAbsLateral.toFixed(2),
    staysOnRoad: maxAbsLateral < 4.45,
  };
}

// 3. Reverse from rest: hold brake, then steer each way.
{
  const car = fresh();
  run(car, { brake: true }, 1.5);
  const yaw0 = car.yaw;
  const revSpeed = car.forwardSpeed;
  run(car, { brake: true, left: true }, 1.5);
  const dYawLeft = car.yaw - yaw0;
  const carR = fresh();
  run(carR, { brake: true }, 1.5);
  const yawR0 = carR.yaw;
  run(carR, { brake: true, right: true }, 1.5);
  const dYawRight = carR.yaw - yawR0;
  results.reverse = {
    reverseSpeed: revSpeed.toFixed(1),
    dYawLeft: dYawLeft.toFixed(3),
    dYawRight: dYawRight.toFixed(3),
    mirrored: Math.sign(dYawLeft) !== Math.sign(dYawRight) && Math.abs(dYawLeft) > 0.25 && Math.abs(dYawRight) > 0.25,
  };
}

// 4. Brake to stop from speed.
{
  const car = fresh();
  run(car, { gas: true }, 3);
  const speedBefore = car.forwardSpeed;
  let stopTime = null;
  run(car, { brake: true }, 4, (c, t) => {
    if (stopTime === null && Math.abs(c.forwardSpeed) < 0.5) stopTime = t;
  });
  results.braking = { fromKmh: Math.round(speedBefore * 3.6), stopsInSeconds: stopTime?.toFixed(2) ?? ">4 (still moving or reversed)" };
}

// 5. Boost: charge consumed, speed exceeds normal cap, timer decays.
{
  const car = fresh();
  run(car, { gas: true }, 2.6);
  const speedBefore = car.forwardSpeed;
  let maxBoost = 0;
  run(car, { gas: true, boost: true }, 2, (c) => {
    maxBoost = Math.max(maxBoost, c.forwardSpeed);
  });
  results.boost = {
    beforeKmh: Math.round(speedBefore * 3.6),
    peakKmh: Math.round(maxBoost * 3.6),
    chargesLeft: car.boostCharges,
    gained: maxBoost > speedBefore + 2,
  };
}

// 6. Handbrake drift: slide builds and recovers.
{
  const car = fresh();
  run(car, { gas: true }, 2.6);
  let maxSlip = 0;
  let drifted = false;
  run(car, { gas: true, left: true, handbrake: true }, 1.2, (c) => {
    maxSlip = Math.max(maxSlip, Math.abs(c.sideSpeed));
    drifted = drifted || c.drifting;
  });
  run(car, { gas: true }, 2);
  results.drift = { drifted, maxSlip: maxSlip.toFixed(1), slipAfterRecovery: Math.abs(car.sideSpeed).toFixed(2), driftScore: Math.round(car.driftScore) };
}

// 7. Low-speed maneuvering: from rest, gas + full steer for 1s should rotate visibly.
{
  const car = fresh();
  const yaw0 = car.yaw;
  run(car, { gas: true, right: true }, 1);
  results.lowSpeedTurn = { dYaw: (car.yaw - yaw0).toFixed(3), turns: Math.abs(car.yaw - yaw0) > 0.25 };
}

// 8. Full lap with a bang-bang "keyboard player": binary steer keys at 60Hz.
// The car must lap the course without getting stuck on a rail.
{
  const car = fresh();
  let railFrames = 0;
  let driftFrames = 0;
  let frames = 0;
  let lapTime = null;
  for (let i = 0; i < 60 * 90 && lapTime === null; i += 1) {
    const target = -0.08 * car.lateral;
    const u = car.headingError - target;
    const input = { gas: true, left: u > 0.04, right: u < -0.04 };
    updateVehicle(car, { ...IDLE, ...input }, DT);
    frames += 1;
    if (car.railContact) railFrames += 1;
    if (car.drifting) driftFrames += 1;
    if (car.lap >= 1) lapTime = (frames * DT).toFixed(1);
  }
  results.fullLap = {
    lapCompleted: lapTime !== null,
    lapTimeSeconds: lapTime ?? "did not finish in 90s",
    railContactPct: ((railFrames / frames) * 100).toFixed(1) + "%",
    driftPct: ((driftFrames / frames) * 100).toFixed(1) + "%",
    endKmh: Math.round(car.forwardSpeed * 3.6),
  };
}

// 9. Per-vehicle sanity: every selectable car must build speed, turn at low speed,
// stop, boost above its cruise cap, and complete a lap with the bang-bang driver.
// Numbers here are the calibration reference for per-car medal targets.
{
  results.perVehicle = {};
  for (const { id, name } of listVehicles()) {
    // top speed (flat-out until it would hit a bend)
    const sp = fresh(id);
    let maxSpeed = 0;
    run(sp, { gas: true }, 6, (c) => {
      maxSpeed = Math.max(maxSpeed, c.forwardSpeed);
    });
    // boost peak measured before the first bend so it reads true overdrive gain
    const bp = fresh(id);
    run(bp, { gas: true }, 2.6);
    const preBoost = bp.forwardSpeed;
    let boostPeak = 0;
    run(bp, { gas: true, boost: true }, 2, (c) => {
      boostPeak = Math.max(boostPeak, c.forwardSpeed);
    });

    // low-speed rotation from rest
    const lt = fresh(id);
    const yaw0 = lt.yaw;
    run(lt, { gas: true, right: true }, 1);

    // braking distance from ~3s of gas
    const bk = fresh(id);
    run(bk, { gas: true }, 3);
    let stopTime = null;
    run(bk, { brake: true }, 5, (c, t) => {
      if (stopTime === null && Math.abs(c.forwardSpeed) < 0.5) stopTime = t;
    });

    // full lap with the bang-bang keyboard player
    const car = fresh(id);
    let railFrames = 0;
    let frames = 0;
    let lapTime = null;
    for (let i = 0; i < 60 * 120 && lapTime === null; i += 1) {
      const target = -0.08 * car.lateral;
      const u = car.headingError - target;
      updateVehicle(car, { ...IDLE, gas: true, left: u > 0.04, right: u < -0.04 }, DT);
      frames += 1;
      if (car.railContact) railFrames += 1;
      if (car.lap >= 1) lapTime = (frames * DT).toFixed(1);
    }

    results.perVehicle[id] = {
      name,
      cruiseKmh: Math.round(maxSpeed * 3.6),
      boostPeakKmh: Math.round(boostPeak * 3.6),
      boostGain: boostPeak > preBoost + 2,
      lowSpeedTurns: Math.abs(lt.yaw - yaw0) > 0.25,
      stopsInSeconds: stopTime?.toFixed(2) ?? ">5",
      lapCompleted: lapTime !== null,
      lapTimeSeconds: lapTime ?? "did not finish in 120s",
      railContactPct: ((railFrames / frames) * 100).toFixed(1) + "%",
    };
  }
}

console.log(JSON.stringify(results, null, 2));
