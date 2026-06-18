"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, Sky, Stars, Text } from "@react-three/drei";
import { GLBVehicle } from "./CarBodies";
import { forwardRef, Suspense, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import RaceHud from "./RaceHud";
import GuideModal from "./GuideModal";
import {
  createDashedStripGeometry,
  createRailGeometry,
  createRoadGeometry,
  createShoulderGeometry,
  createStripGeometry,
  getTrackFrame,
  getTrackLength,
  isPointClearOfRoad,
  MINIMAP,
  PICKUPS,
  pointAt,
  projectPointToTrack,
  setActiveTrack,
  TRACK,
} from "../game/track";
import { createVehicleState, getVehicleTransform, MAX_BOOST_CHARGES, updateVehicle } from "../game/vehicle";
import { createGameAudio } from "../game/audio";

const INITIAL_RACE = {
  lap: 0,
  timeMs: 0,
  speed: 0,
  coins: 0,
  driftScore: 0,
  boosts: 3,
  boostTimer: 0,
  boostCooldown: 0,
  drifting: false,
  reversing: false,
  progress: 0,
  countdown: 3,
  delta: null,
  banner: null,
  roadMessage: null,
  wrongWay: false,
  mapPos: null,
  debug: null,
};

// Time-of-day presets. Most of the scene is MeshStandardMaterial, so changing
// the lights + atmosphere re-skins the whole world for free; the bright road
// markings are MeshBasic and stay legible at night like reflective paint.
export const TIME_THEMES = {
  day: {
    label: "Day",
    background: "#a8ddff",
    // fog matches the sky so the horizon blends into the same blue instead of
    // fading to grey; no atmospheric Sky shader (its sun-glow gradient made the
    // sky shift blue->grey as you turned). Flat, consistent low-poly sky.
    fog: ["#a8ddff", 120, 660],
    hemisphere: ["#cfe9ff", "#3d5232", 0.55],
    ambient: 0.35,
    sun: { position: [40, 70, 25], color: "#fff4e0", intensity: 1.6 },
    sky: null,
    stars: false,
    headlights: false,
  },
  dusk: {
    label: "Dusk",
    background: "#e89a5c",
    fog: ["#d77f4e", 70, 470],
    hemisphere: ["#ffd6a0", "#241d2c", 0.4],
    ambient: 0.3,
    sun: { position: [-70, 16, -38], color: "#ff9442", intensity: 1.35 },
    sky: { sunPosition: [-28, 2.2, -100], turbidity: 12, rayleigh: 3.2, mieCoefficient: 0.02 },
    stars: false,
    headlights: false,
  },
  night: {
    label: "Night",
    background: "#070b16",
    fog: ["#070b18", 50, 360],
    hemisphere: ["#36477a", "#04060c", 0.28],
    ambient: 0.12,
    sun: { position: [-50, 64, 36], color: "#aebfee", intensity: 0.45 },
    sky: null,
    stars: true,
    headlights: true,
  },
};

export default function RaceGame({ driver, challenge, pbRun, timeOfDay = "day", trackId = "akina-ridge", onFinish, onQuit, onRestart, onReady }) {
  // Activate the chosen track before the scene geometry and vehicle are built
  // from it below (this component renders before its RaceScene child).
  setActiveTrack(trackId);
  const theme = TIME_THEMES[timeOfDay] || TIME_THEMES.day;
  const inputRef = useRef({ left: false, right: false, gas: false, brake: false, handbrake: false, boost: false });
  const [race, setRace] = useState(INITIAL_RACE);
  const [showDebug, setShowDebug] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [muted, setMuted] = useState(() => typeof window !== "undefined" && localStorage.getItem("chopfirst.muted") === "1");
  const [ghostLabels, setGhostLabels] = useState(() => typeof window === "undefined" || localStorage.getItem("chopfirst.ghostLabels") !== "0");
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const audio = useMemo(() => createGameAudio(), []);

  useKeyboard(inputRef, setShowDebug, setPaused, onRestart);

  useEffect(() => {
    // Touch players get automatic throttle (mirrors the media query that shows
    // the touch controls): holding a GAS button for a whole run was the main
    // source of iOS long-press misfires and thumb fatigue.
    inputRef.current.autoGas = !window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }, [inputRef]);

  useEffect(() => {
    audio.setMuted(muted);
    if (typeof window !== "undefined") localStorage.setItem("chopfirst.muted", muted ? "1" : "0");
  }, [audio, muted]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("chopfirst.ghostLabels", ghostLabels ? "1" : "0");
  }, [ghostLabels]);

  useEffect(() => {
    // browsers only allow audio after a user gesture
    const unlock = () => audio.resume();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      audio.dispose();
    };
  }, [audio]);

  return (
    <>
      <Canvas className="race-canvas" camera={{ position: [0, 8, 14], fov: 58, near: 0.1, far: 1100 }}>
        <color attach="background" args={[theme.background]} />
        <fog attach="fog" args={theme.fog} />
        <hemisphereLight args={theme.hemisphere} />
        <ambientLight intensity={theme.ambient} />
        <directionalLight position={theme.sun.position} intensity={theme.sun.intensity} color={theme.sun.color} />
        {theme.sky && <Sky {...theme.sky} />}
        {theme.stars && (
          <>
            <Stars radius={320} depth={80} count={1400} factor={6} saturation={0} fade speed={0.4} />
            <mesh position={[140, 150, -260]}>
              <sphereGeometry args={[16, 24, 24]} />
              <meshBasicMaterial color="#eaf0ff" />
            </mesh>
            <pointLight position={[140, 150, -260]} color="#cdd9ff" intensity={0.6} distance={0} />
          </>
        )}
        <RaceScene inputRef={inputRef} challenge={challenge} pbRun={pbRun} driver={driver} onFinish={onFinish} setRace={setRace} showDebug={showDebug} pausedRef={pausedRef} audio={audio} ghostLabels={ghostLabels} headlights={theme.headlights} onReady={onReady} />
      </Canvas>
      <RaceHud race={race} driver={driver} muted={muted} onToggleMute={() => setMuted((value) => !value)} onPause={() => setPaused(true)} />
      <TouchControls controlsRef={inputRef} boosts={race.boosts} />
      {paused && !showGuide && (
        <PauseOverlay
          onResume={() => setPaused(false)}
          onGuide={() => setShowGuide(true)}
          onQuit={onQuit}
          onRestart={onRestart}
          ghostLabels={ghostLabels}
          onToggleLabels={() => setGhostLabels((value) => !value)}
        />
      )}
      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
    </>
  );
}

function PauseOverlay({ onResume, onGuide, onQuit, onRestart, ghostLabels, onToggleLabels }) {
  const touch = typeof window !== "undefined" && !window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  return (
    <div className="pause-overlay">
      <div className="pause-card">
        <p className="eyebrow">Paused</p>
        <h2 className="pause-title">CHOP FIRST</h2>
        {touch ? (
          <ul className="pause-hints">
            <li>Auto-throttle — corners steer, one thumb each</li>
            <li>Hold <b>DRIFT</b> with your free thumb · tap the <b>tank</b> to boost · hold <b>BRAKE</b> to stop, keep holding to reverse</li>
          </ul>
        ) : (
          <ul className="pause-hints">
            <li><kbd>W</kbd>/<kbd>↑</kbd> gas · <kbd>S</kbd>/<kbd>↓</kbd> brake &amp; reverse</li>
            <li><kbd>Shift</kbd> drift · <kbd>Space</kbd> boost · <kbd>Esc</kbd> pause · <kbd>R</kbd> restart</li>
          </ul>
        )}
        <button className="primary" onClick={onResume}>Resume</button>
        <div className="pause-row">
          <button className="secondary" onClick={onRestart}>Restart run</button>
          <button className="secondary" onClick={onGuide}>How to play</button>
          <button className="secondary" onClick={onQuit}>Quit run</button>
        </div>
        <button className="ghost-toggle" onClick={onToggleLabels}>
          {ghostLabels ? "✓ Ghost name tags on" : "Ghost name tags off"}
        </button>
      </div>
    </div>
  );
}

function RaceScene({ inputRef, challenge, pbRun, driver, onFinish, setRace, showDebug, pausedRef, audio, ghostLabels, headlights, onReady }) {
  const car = useMemo(() => createVehicleState(driver?.vehicle), [driver?.vehicle]);
  const carRef = useRef(null);
  const roadMessages = useMemo(
    () => (challenge?.messages || []).filter((note) => note.message).slice(-8),
    [challenge],
  );
  const flowRef = useRef({ lastLap: 0, banner: null, msgIndex: 0, msg: null, wrongWayTime: 0, lastBoostsEarned: 0 });
  const smokeRef = useRef(null);
  const sparksRef = useRef(null);
  const skidRef = useRef(null);
  const fxClock = useRef({ smoke: 0, skid: 0, spark: 0 });
  const cameraRig = useRef({ position: new THREE.Vector3(), lookAt: new THREE.Vector3(), initialized: false });
  const finishedRef = useRef(false);
  const snapshotClock = useRef(0);
  const countdownRef = useRef(3);
  const readyRef = useRef(false);
  const deltaRef = useRef({ idx: 0, maxD: -Infinity, value: null });
  const { camera, scene } = useThree();
  const trackLength = getTrackLength();

  // Debug hooks for manual/scripted driving QA.
  useEffect(() => {
    window.__carState = car;
    window.__scene = scene;
    window.__camera = camera;
    return () => {
      if (window.__carState === car) delete window.__carState;
      if (window.__scene === scene) delete window.__scene;
      if (window.__camera === camera) delete window.__camera;
    };
  }, [car, scene, camera]);

  useFrame((_, delta) => {
    // first rendered frame = the scene is built and drawing; tell the shell to drop
    // the loading overlay (city geometry can take a beat to assemble on mount).
    if (!readyRef.current) {
      readyRef.current = true;
      if (onReady) onReady();
    }
    if (finishedRef.current || pausedRef.current) return;
    const dt = Math.min(0.033, delta);
    countdownRef.current = Math.max(-1, countdownRef.current - dt);
    if (countdownRef.current <= 0) {
      const input = inputRef.current;
      // auto-throttle yields to the brake so braking and reversing still work
      updateVehicle(car, input.autoGas && !input.brake ? { ...input, gas: true } : input, dt);
    }
    const transform = getVehicleTransform(car);

    const flow = flowRef.current;
    if (car.lap !== flow.lastLap && car.lap > 0 && car.lap < TRACK.laps) {
      flow.lastLap = car.lap;
      flow.banner = {
        id: car.lap,
        text: car.lap === TRACK.laps - 1 ? "FINAL LAP" : `LAP ${car.lap + 1} / ${TRACK.laps}`,
        until: car.timeMs + 2400,
      };
    }
    if (car.boostsEarned > flow.lastBoostsEarned) {
      flow.lastBoostsEarned = car.boostsEarned;
      flow.banner = { id: `boost-${car.boostsEarned}`, text: "+1 BOOST", until: car.timeMs + 1600 };
    }
    if (flow.msgIndex < roadMessages.length) {
      const total = Math.min(1, raceProgress(car, trackLength) / (TRACK.laps * trackLength));
      // spread rival notes evenly across the whole run, never right at the finish
      if (total >= ((flow.msgIndex + 1) / (roadMessages.length + 1)) * 0.94) {
        flow.msg = { id: flow.msgIndex, ...roadMessages[flow.msgIndex], until: car.timeMs + 5000 };
        flow.msgIndex += 1;
      }
    }
    // wrong-way: sustained driving against the road direction
    const wrongWay = Math.abs(car.headingError) > 2 && car.forwardSpeed > 3;
    flow.wrongWayTime = wrongWay ? flow.wrongWayTime + dt : 0;

    if (carRef.current) {
      carRef.current.position.copy(transform.position);
      carRef.current.rotation.set(0, transform.yaw, 0);
    }

    spawnDriveEffects(car, transform, fxClock.current, dt, smokeRef.current, sparksRef.current, skidRef.current);
    updateCamera(camera, cameraRig.current, transform, car, dt);
    audio?.update(car);

    snapshotClock.current += dt;
    if (snapshotClock.current > 0.08) {
      setRace({
        lap: Math.min(TRACK.laps - 1, car.lap),
        timeMs: car.timeMs,
        speed: car.forwardSpeed,
        coins: car.coins.size,
        driftScore: Math.round(car.driftScore),
        boosts: car.boostCharges,
        boostTimer: car.boostTimer,
        boostCooldown: car.boostCooldown,
        drifting: car.drifting,
        reversing: car.reversing,
        delta: pbRun?.ghost?.length > 1 ? pbDelta(pbRun.ghost, car, trackLength, deltaRef.current) : null,
        progress: Math.min(1, raceProgress(car, trackLength) / (TRACK.laps * trackLength)),
        countdown: countdownRef.current,
        banner: flow.banner && car.timeMs < flow.banner.until ? flow.banner : null,
        roadMessage: flow.msg && car.timeMs < flow.msg.until ? flow.msg : null,
        wrongWay: flow.wrongWayTime > 0.7,
        mapPos: MINIMAP.toMap(car.position.x, car.position.z),
        debug: showDebug
          ? {
              speed: car.forwardSpeed,
              sideSpeed: car.sideSpeed,
              yaw: car.yaw,
              lateral: car.lateral,
              headingError: car.headingError,
              railSide: car.railSide,
              projectionDistance: car.projectionDistance,
            }
          : null,
      });
      snapshotClock.current = 0;
    }

    if (car.lap >= TRACK.laps) {
      finishedRef.current = true;
      onFinish({
        name: driver.name || "Street Driver",
        photo: driver.photo,
        timeMs: car.timeMs,
        coins: car.coins.size,
        driftScore: Math.round(car.driftScore),
        boostUses: car.boostUses,
        ghost: decimateGhost(car.ghost, 500),
      });
    }
  });

  return (
    <group>
      <TrackWorld />
      <StartGantry countdownRef={countdownRef} />
      <Pickups collected={car.coins} lap={Math.min(TRACK.laps - 1, car.lap)} />
      <Ghosts challenge={challenge} pbRun={pbRun} car={car} showLabels={ghostLabels} />
      <RaceCar ref={carRef} carState={car} color={driver?.color} headlights={headlights} vehicle={driver?.vehicle || "street"} />
      <Particles ref={smokeRef} mode="smoke" count={70} />
      <Particles ref={sparksRef} mode="spark" count={60} />
      <Particles ref={skidRef} mode="skid" count={90} />
    </group>
  );
}

// Keep ghost traces under the wire-size cap by sampling evenly across the
// whole run (a plain slice would cut off everything after ~45s).
function decimateGhost(samples, max) {
  if (samples.length <= max) return samples;
  const out = [];
  const step = (samples.length - 1) / (max - 1);
  for (let i = 0; i < max; i += 1) out.push(samples[Math.round(i * step)]);
  return out;
}

function spawnDriveEffects(car, transform, fx, dt, smoke, sparks, skids) {
  fx.smoke -= dt;
  fx.skid -= dt;
  fx.spark -= dt;
  const forward = new THREE.Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw));
  const right = new THREE.Vector3(Math.cos(car.yaw), 0, -Math.sin(car.yaw));
  const sliding = car.drifting && Math.abs(car.forwardSpeed) > 8;

  if (sliding && smoke && fx.smoke <= 0) {
    fx.smoke = 0.025;
    for (const side of [-1, 1]) {
      const pos = car.position.clone().addScaledVector(forward, -1.35).addScaledVector(right, side * 0.85);
      pos.y -= 0.45;
      const vel = new THREE.Vector3((Math.random() - 0.5) * 1.6, 1.1 + Math.random() * 1.2, (Math.random() - 0.5) * 1.6).addScaledVector(car.velocity, 0.12);
      smoke.spawn(pos, vel, 0.8 + Math.random() * 0.7);
    }
  }
  if (sliding && skids && fx.skid <= 0) {
    fx.skid = 0.03;
    for (const side of [-1, 1]) {
      const pos = car.position.clone().addScaledVector(forward, -1.35).addScaledVector(right, side * 0.85);
      pos.y -= 0.74;
      skids.spawn(pos, ZERO_VELOCITY, 0.9 + Math.random() * 0.3);
    }
  }
  if (car.railContact && sparks && Math.abs(car.forwardSpeed) > 4 && fx.spark <= 0) {
    fx.spark = 0.02;
    const side = Math.sign(car.lateral) || 1;
    const pos = car.position.clone().addScaledVector(transform.frame.normal, side * 1.05);
    pos.y -= 0.25;
    for (let i = 0; i < 3; i += 1) {
      const vel = car.velocity
        .clone()
        .multiplyScalar(0.3)
        .add(new THREE.Vector3((Math.random() - 0.5) * 4, 1.5 + Math.random() * 3, (Math.random() - 0.5) * 4));
      sparks.spawn(pos, vel, 0.6 + Math.random() * 0.8);
    }
  }
}

const ZERO_VELOCITY = new THREE.Vector3();

function updateCamera(camera, rig, transform, car, dt) {
  const speed = car.forwardSpeed;
  const carForward = new THREE.Vector3(Math.sin(transform.yaw), 0, Math.cos(transform.yaw));
  const lookAheadFrame = getTrackFrame(car.distance + 22 + Math.max(0, speed) * 0.28);
  const chase = transform.position.clone().addScaledVector(carForward, -12.5 - Math.min(3.4, Math.max(0, speed) * 0.045));
  chase.y += 5.2 + Math.min(1.4, Math.max(0, speed) * 0.022);
  const carLook = transform.position.clone().addScaledVector(carForward, 10 + Math.max(0, speed) * 0.05);
  const trackLook = lookAheadFrame.position.clone();
  const lookAt = carLook.lerp(trackLook, 0.18);
  lookAt.y = transform.position.y + 1.7;
  if (!rig.initialized) {
    rig.position.copy(chase);
    rig.lookAt.copy(lookAt);
    rig.initialized = true;
  } else {
    rig.position.lerp(chase, 1 - Math.exp(-dt * 6.4));
    rig.lookAt.lerp(lookAt, 1 - Math.exp(-dt * 7.5));
  }
  camera.position.copy(rig.position);
  const boostK = car.boostTimer > 0 ? Math.min(1, car.boostTimer / 1.1) : 0;
  const shake = car.impact * 0.32 + boostK * 0.08;
  if (shake > 0.002) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
  }
  camera.lookAt(rig.lookAt);
  const targetFov = 56 + Math.min(10, Math.max(0, speed) * 0.13) + boostK * 9;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-dt * 4.5));
  camera.updateProjectionMatrix();
}

function progressFromStart(distance, trackLength) {
  return (distance - TRACK.startDistance + trackLength) % trackLength;
}

function raceProgress(car, trackLength) {
  if (!car.startGatePassed) return 0;
  return car.lap * trackLength + progressFromStart(car.distance, trackLength);
}

// Live gap to the PB ghost: PB's time at the player's current track distance
// vs the player's clock. Trace d (lap*L + distance) dips between the spline
// wrap and the start gate each lap, so the reading holds steady through the
// dip (a monotonic cursor on both sides) instead of spiking.
function pbDelta(pbGhost, car, trackLength, state) {
  const d = car.lap * trackLength + car.distance;
  if (d <= state.maxD) return state.value;
  state.maxD = d;
  let i = state.idx;
  while (i + 1 < pbGhost.length && pbGhost[i + 1].d <= d) i += 1;
  state.idx = i;
  if (i + 1 >= pbGhost.length || d < pbGhost[i].d) return state.value;
  const a = pbGhost[i];
  const b = pbGhost[i + 1];
  const pbTime = a.t + ((d - a.d) / (b.d - a.d || 1)) * (b.t - a.t);
  state.value = car.timeMs - pbTime;
  return state.value;
}

/* ---------------------------------- world ---------------------------------- */

function TrackWorld() {
  const roadGeometry = useMemo(() => createRoadGeometry(), []);
  const centerLine = useMemo(() => createDashedStripGeometry(0, 0.16, 2.6, 3, 0, 0.16), []);
  const leftEdge = useMemo(() => createStripGeometry(-TRACK.width / 2 + 0.22, 0.15), []);
  const rightEdge = useMemo(() => createStripGeometry(TRACK.width / 2 - 0.22, 0.15), []);
  const leftCurbRed = useMemo(() => createDashedStripGeometry(-TRACK.width / 2 - 0.32, 0.55, 2.2, 2.2, 0, 0.14), []);
  const leftCurbWhite = useMemo(() => createDashedStripGeometry(-TRACK.width / 2 - 0.32, 0.55, 2.2, 2.2, 2.2, 0.14), []);
  const rightCurbRed = useMemo(() => createDashedStripGeometry(TRACK.width / 2 + 0.32, 0.55, 2.2, 2.2, 0, 0.14), []);
  const rightCurbWhite = useMemo(() => createDashedStripGeometry(TRACK.width / 2 + 0.32, 0.55, 2.2, 2.2, 2.2, 0.14), []);
  const leftShoulder = useMemo(() => createShoulderGeometry(-1), []);
  const rightShoulder = useMemo(() => createShoulderGeometry(1), []);
  const leftRail = useMemo(() => createRailGeometry(-1), []);
  const rightRail = useMemo(() => createRailGeometry(1), []);
  const curveMarkers = useMemo(() => createCurveMarkers(), []);
  const brakeBoards = useMemo(() => createBrakeBoards(), []);
  const mountains = useMemo(() => createMountains(), []);
  const isCity = TRACK.environment === "city";
  const gateDistance = useMemo(() => (isCity ? longestStraightDistance() : 0), [isCity]);

  return (
    <group>
      <mesh receiveShadow geometry={roadGeometry}>
        <meshStandardMaterial color="#2d3134" roughness={0.94} metalness={0.02} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={centerLine}>
        <meshBasicMaterial color="#ffd45e" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={leftEdge}>
        <meshBasicMaterial color="#e9edef" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={rightEdge}>
        <meshBasicMaterial color="#e9edef" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={leftCurbRed}>
        <meshBasicMaterial color="#cf3a30" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={leftCurbWhite}>
        <meshBasicMaterial color="#eef1ef" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={rightCurbRed}>
        <meshBasicMaterial color="#cf3a30" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={rightCurbWhite}>
        <meshBasicMaterial color="#eef1ef" side={THREE.DoubleSide} />
      </mesh>
      <mesh receiveShadow geometry={leftShoulder}>
        <meshStandardMaterial color={isCity ? "#6f6960" : "#4f7a3c"} roughness={1} />
      </mesh>
      <mesh receiveShadow geometry={rightShoulder}>
        <meshStandardMaterial color={isCity ? "#766f64" : "#578643"} roughness={1} />
      </mesh>
      <mesh geometry={leftRail}>
        <meshStandardMaterial color="#cfd9dd" metalness={0.55} roughness={0.32} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={rightRail}>
        <meshStandardMaterial color="#cfd9dd" metalness={0.55} roughness={0.32} side={THREE.DoubleSide} />
      </mesh>
      <RailPosts />
      <Delineators />
      {isCity ? (
        <>
          <CityBuildings />
          <CityWalls />
          <CityTrees />
          <CityKiosks />
          <CityTrotros />
          <CityUmbrellas />
          <CityHawkers />
          <CityFlags />
          <CityBillboards />
          <BlackStarGate distance={gateDistance} />
          <CityLandmarks />
        </>
      ) : (
        <>
          <Forest />
          <Rocks />
        </>
      )}
      <Grandstand />
      {curveMarkers.map((marker) => (
        <CurveMarker key={marker.key} position={marker.position} yaw={marker.yaw} direction={marker.direction} />
      ))}
      {brakeBoards.map((board) => (
        <BrakeBoard key={board.key} position={board.position} yaw={board.yaw} count={board.count} />
      ))}
      {!isCity && mountains.map((mountain) => (
        <mesh key={mountain.key} position={mountain.position} scale={[mountain.scale * 1.5, mountain.scale, mountain.scale * 1.5]}>
          <coneGeometry args={[1, 1.6, 6]} />
          <meshStandardMaterial color={mountain.color} roughness={1} />
        </mesh>
      ))}
      <Clouds />
      <mesh receiveShadow position={[TRACK.center.x, isCity ? -0.05 : -26, TRACK.center.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1600, 1600, 1, 1]} />
        <meshStandardMaterial color={isCity ? "#8a8170" : "#558544"} roughness={1} />
      </mesh>
    </group>
  );
}

function Clouds() {
  const clouds = useMemo(() => {
    const items = [];
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2 + 0.4;
      const radius = 190 + ((i * 53) % 160);
      items.push({
        key: `cloud-${i}`,
        position: [TRACK.center.x + Math.cos(angle) * radius, 64 + ((i * 19) % 30), TRACK.center.z + Math.sin(angle) * radius],
        scale: [16 + ((i * 11) % 14), 3.4 + ((i * 7) % 4), 9 + ((i * 13) % 8)],
      });
    }
    return items;
  }, []);
  return clouds.map((cloud) => (
    <mesh key={cloud.key} position={cloud.position} scale={cloud.scale}>
      <sphereGeometry args={[1, 7, 5]} />
      <meshStandardMaterial color="#fbfdff" roughness={1} transparent opacity={0.88} />
    </mesh>
  ));
}

function Instances({ matrices, geometry, material, colors, castShadow = false }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    matrices.forEach((matrix, index) => ref.current.setMatrixAt(index, matrix));
    ref.current.instanceMatrix.needsUpdate = true;
    if (colors) {
      colors.forEach((color, index) => ref.current.setColorAt(index, color));
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    }
  }, [matrices, colors]);
  return <instancedMesh ref={ref} args={[geometry, material, matrices.length]} frustumCulled={false} castShadow={castShadow} />;
}

function composeMatrix(dummy, x, y, z, scale = 1, yaw = 0, scaleY = scale) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, yaw, 0);
  dummy.scale.set(scale, scaleY, scale);
  dummy.updateMatrix();
  return dummy.matrix.clone();
}

function RailPosts() {
  const { geometry, material, matrices } = useMemo(() => {
    const dummy = new THREE.Object3D();
    const matrices = [];
    const length = getTrackLength();
    for (let distance = 0; distance < length; distance += 8) {
      const frame = getTrackFrame(distance);
      for (const side of [-1, 1]) {
        const pos = frame.position.clone().addScaledVector(frame.normal, side * TRACK.railOffset);
        matrices.push(composeMatrix(dummy, pos.x, pos.y + 0.3, pos.z, 1));
      }
    }
    return {
      geometry: new THREE.BoxGeometry(0.14, 0.62, 0.14),
      material: new THREE.MeshStandardMaterial({ color: "#7f8b90", metalness: 0.3, roughness: 0.5 }),
      matrices,
    };
  }, []);
  return <Instances matrices={matrices} geometry={geometry} material={material} />;
}

function Delineators() {
  const data = useMemo(() => {
    const dummy = new THREE.Object3D();
    const posts = [];
    const caps = [];
    const length = getTrackLength();
    for (let distance = 0; distance < length; distance += 24) {
      const frame = getTrackFrame(distance);
      for (const side of [-1, 1]) {
        const pos = frame.position.clone().addScaledVector(frame.normal, side * (TRACK.railOffset + 1.2));
        posts.push(composeMatrix(dummy, pos.x, pos.y + 0.5, pos.z, 1));
        caps.push(composeMatrix(dummy, pos.x, pos.y + 1.02, pos.z, 1));
      }
    }
    return {
      posts,
      caps,
      postGeometry: new THREE.CylinderGeometry(0.05, 0.06, 1, 6),
      capGeometry: new THREE.BoxGeometry(0.16, 0.16, 0.06),
      postMaterial: new THREE.MeshStandardMaterial({ color: "#f2f5f2", roughness: 0.6 }),
      capMaterial: new THREE.MeshBasicMaterial({ color: "#ff4a3c" }),
    };
  }, []);
  return (
    <>
      <Instances matrices={data.posts} geometry={data.postGeometry} material={data.postMaterial} />
      <Instances matrices={data.caps} geometry={data.capGeometry} material={data.capMaterial} />
    </>
  );
}

const FOREST_GREENS = ["#21663c", "#2b7a48", "#185a33", "#357d4a", "#14502d"];
const FOREST_AUTUMN = ["#b5772a", "#c79438"];

function Forest() {
  const data = useMemo(() => {
    const dummy = new THREE.Object3D();
    const trunks = [];
    const canopies = [];
    const canopyColors = [];
    const length = getTrackLength();
    for (let i = 0; i < 170; i += 1) {
      const distance = (i / 170) * length;
      const frame = getTrackFrame(distance);
      const side = i % 2 ? 1 : -1;
      const offset = side * (TRACK.railOffset + 4.6 + ((i * 17) % 11));
      const pos = frame.position.clone().addScaledVector(frame.normal, offset);
      if (!isPointClearOfRoad(pos, TRACK.railOffset + 3)) continue;
      const scale = 0.85 + ((i * 13) % 9) * 0.13;
      // every fifth tree is a tall, slim pine; the rest keep the rounder shape
      const slim = i % 5 === 0;
      const vy = scale * (slim ? 1.75 : 1);
      const rad = slim ? scale * 0.7 : scale;
      trunks.push(composeMatrix(dummy, pos.x, pos.y + 0.75 * vy, pos.z, rad, 0, vy));
      canopies.push(composeMatrix(dummy, pos.x, pos.y + 2.3 * vy, pos.z, rad, (i * 0.7) % Math.PI, vy));
      // mostly greens with the occasional autumn tree for warmth
      const autumn = (i * 29) % 17 === 0;
      canopyColors.push(new THREE.Color(autumn ? FOREST_AUTUMN[i % 2] : FOREST_GREENS[(i * 7) % FOREST_GREENS.length]));
    }
    return {
      trunks,
      canopies,
      canopyColors,
      trunkGeometry: new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6),
      canopyGeometry: new THREE.ConeGeometry(1.15, 2.6, 7),
      trunkMaterial: new THREE.MeshStandardMaterial({ color: "#5b3d25", roughness: 1 }),
      // white base so per-instance colors show true
      canopyMaterial: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 }),
    };
  }, []);
  return (
    <>
      <Instances matrices={data.trunks} geometry={data.trunkGeometry} material={data.trunkMaterial} castShadow />
      <Instances matrices={data.canopies} colors={data.canopyColors} geometry={data.canopyGeometry} material={data.canopyMaterial} castShadow />
    </>
  );
}

function Rocks() {
  const data = useMemo(() => {
    const dummy = new THREE.Object3D();
    const matrices = [];
    const length = getTrackLength();
    for (let i = 0; i < 36; i += 1) {
      const distance = ((i + 0.5) / 36) * length;
      const frame = getTrackFrame(distance);
      const side = i % 3 ? 1 : -1;
      const pos = frame.position.clone().addScaledVector(frame.normal, side * (TRACK.railOffset + 3.4 + ((i * 7) % 6)));
      if (!isPointClearOfRoad(pos, TRACK.railOffset + 2.4)) continue;
      const scale = 0.6 + ((i * 11) % 7) * 0.22;
      matrices.push(composeMatrix(dummy, pos.x, pos.y + scale * 0.4, pos.z, scale, i * 1.3));
    }
    return {
      matrices,
      geometry: new THREE.DodecahedronGeometry(1, 0),
      material: new THREE.MeshStandardMaterial({ color: "#6a7476", roughness: 0.95 }),
    };
  }, []);
  return <Instances matrices={data.matrices} geometry={data.geometry} material={data.material} castShadow />;
}

function createMountains() {
  const items = [];
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2;
    const radius = 430 + ((i * 37) % 110);
    const scale = 42 + ((i * 23) % 48);
    const position = new THREE.Vector3(TRACK.center.x + Math.cos(angle) * radius, scale * 0.8 - 26, TRACK.center.z + Math.sin(angle) * radius);
    // keep the whole cone footprint (base radius = 1.5 * scale) away from the road
    if (!isPointClearOfRoad(position, scale * 1.5 + TRACK.railOffset + 20)) continue;
    items.push({
      key: `mountain-${i}`,
      scale,
      position: [position.x, position.y, position.z],
      color: i % 3 === 0 ? "#7c8f80" : i % 3 === 1 ? "#71857c" : "#86997f",
    });
  }
  return items;
}

// --- Accra city environment -------------------------------------------------
function composeMatrixBox(dummy, x, y, z, sx, sy, sz, yaw = 0) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, yaw, 0);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  return dummy.matrix.clone();
}

function makeSignTexture(lines, bg = "#0b3d2e", fg = "#f7f4ec", accent = null) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 128);
  if (accent) {
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 256, 12);
    ctx.fillRect(0, 116, 256, 12);
  }
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = lines.length > 1 ? 30 : 40;
  ctx.font = `bold ${size}px sans-serif`;
  const startY = 64 - ((lines.length - 1) * (size + 8)) / 2;
  lines.forEach((l, i) => ctx.fillText(l, 128, startY + i * (size + 8)));
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function drawStar(ctx, cx, cy, outer, inner, spikes = 5) {
  let rot = -Math.PI / 2;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer);
  for (let i = 0; i < spikes; i += 1) {
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer);
  }
  ctx.closePath();
  ctx.fill();
}

// The Ghana flag: red / gold / green bands with the lone black star.
function makeGhanaFlag() {
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 80;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ce1126";
  ctx.fillRect(0, 0, 120, 27);
  ctx.fillStyle = "#fcd116";
  ctx.fillRect(0, 27, 120, 26);
  ctx.fillStyle = "#006b3f";
  ctx.fillRect(0, 53, 120, 27);
  ctx.fillStyle = "#0a0a0a";
  drawStar(ctx, 60, 40, 13, 5.5);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Flat extruded 5-point star (the Black Star) for the gateway monument.
function makeStarGeometry(outer = 1, inner = 0.42, depth = 0.4) {
  const shape = new THREE.Shape();
  const spikes = 5;
  let rot = -Math.PI / 2;
  const step = Math.PI / spikes;
  shape.moveTo(Math.cos(rot) * outer, Math.sin(rot) * outer);
  for (let i = 0; i < spikes; i += 1) {
    rot += step;
    shape.lineTo(Math.cos(rot) * inner, Math.sin(rot) * inner);
    rot += step;
    shape.lineTo(Math.cos(rot) * outer, Math.sin(rot) * outer);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.center();
  return geo;
}

// --- Districts ---------------------------------------------------------------
// The loop is the real Osu -> 37 Military Hospital -> Cantonments -> Osu route.
// We bucket each point of the lap into the district it actually passes through
// and dress that stretch to match, so the city stops being one uniform texture:
//   - commercial  (Osu / Oxford St): dense saturated shopfronts, stacked signs,
//                  kiosks, hawkers, parked trotros, billboards. Loud and packed.
//   - residential (Cantonments): rendered villas set back behind compound walls
//                  and gates, leafy shade trees, the occasional embassy flag.
//   - institutional (37 Military Hospital / civic): big plain pale blocks,
//                  forecourts, far fewer street vendors.
// Anchors are the real landmark coordinates projected onto the simplified loop;
// every lap point takes the district of its nearest anchor (wrapped arc-length).
function buildDistricts() {
  const length = getTrackLength();
  const anchor = (x, z, kind) => ({
    d: projectPointToTrack(new THREE.Vector3(x, 0, z), 0, length / 2, 320).distance,
    kind,
  });
  const anchors = [
    anchor(-181, -1376, "commercial"), // Oxford Street, Osu
    anchor(-200, -831, "commercial"), // Danquah Circle
    anchor(-412, 619, "institutional"), // 37 Military Hospital
    anchor(366, -286, "residential"), // Cantonments
  ];
  return {
    length,
    at(distance) {
      let best = anchors[0];
      let bestGap = Infinity;
      for (const a of anchors) {
        const raw = (((distance - a.d) % length) + length) % length;
        const gap = Math.min(raw, length - raw);
        if (gap < bestGap) {
          bestGap = gap;
          best = a;
        }
      }
      return best.kind;
    },
  };
}

// --- Building facades --------------------------------------------------------
// Each archetype bakes its wall colour, window grid, and (for shops) a painted
// ground floor + signboard into one canvas texture. Buildings are then batched
// by archetype so a single instanced mesh shares the texture — cheap, and the
// windows/shopfronts are what stop the boxes reading as bare cardboard.
function makeFacadeTexture(spec) {
  const {
    wall, storeys = 3, cols = 4, glass = "#3c4e58", lit = "#f6e7b0",
    shopfront = null, shopSign = null, trim = null, modern = false,
  } = spec;
  const W = 256;
  const H = 256;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, H);
  // weathering: darker toward the base, faint sun-streaks down the render
  const grime = ctx.createLinearGradient(0, 0, 0, H);
  grime.addColorStop(0, "rgba(255,255,255,0.06)");
  grime.addColorStop(0.7, "rgba(0,0,0,0)");
  grime.addColorStop(1, "rgba(0,0,0,0.2)");
  ctx.fillStyle = grime;
  ctx.fillRect(0, 0, W, H);

  const groundH = shopfront ? 72 : 6;
  const top = 8;
  const upperH = H - groundH - top;
  const rowH = upperH / storeys;
  const cellW = W / cols;
  const winW = cellW * (modern ? 0.78 : 0.5);
  const winH = rowH * (modern ? 0.7 : 0.56);

  for (let r = 0; r < storeys; r += 1) {
    if (trim) {
      ctx.fillStyle = trim;
      ctx.fillRect(0, top + r * rowH - 2, W, 3); // floor slab band
    }
    const cy = top + r * rowH + (rowH - winH) / 2;
    for (let c = 0; c < cols; c += 1) {
      const cx = (c + 0.5) * cellW - winW / 2;
      ctx.fillStyle = "#1b1e21";
      ctx.fillRect(cx - 2, cy - 2, winW + 4, winH + 4); // frame
      ctx.fillStyle = (r * 7 + c * 3) % 5 === 0 ? lit : glass;
      ctx.fillRect(cx, cy, winW, winH);
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(cx + winW / 2 - 1, cy, 2, winH); // mullion
      if (!modern) ctx.fillRect(cx, cy + winH / 2 - 1, winW, 2);
    }
  }
  if (trim) {
    ctx.fillStyle = trim;
    ctx.fillRect(0, 0, W, 8); // parapet cap
  }
  if (shopfront) {
    const gy = H - groundH;
    ctx.fillStyle = shopfront;
    ctx.fillRect(0, gy, W, groundH);
    ctx.fillStyle = shopSign || "#0b3d2e"; // fascia signboard band
    ctx.fillRect(5, gy + 4, W - 10, 22);
    ctx.fillStyle = "#243036"; // shop glazing / doorway below the fascia
    for (let c = 0; c < cols; c += 1) {
      const cx = (c + 0.5) * cellW;
      ctx.fillRect(cx - winW * 0.55, gy + 32, winW * 1.1, groundH - 40);
    }
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const FACADE_SPECS = [
  // 0-3 commercial (Osu / Oxford St): bright telecom-branded shopfronts
  { wall: "#e7dcc4", storeys: 3, cols: 4, shopfront: "#0a7cc1", shopSign: "#ffcb05", trim: "#cdbf9f" },
  { wall: "#d8a98c", storeys: 2, cols: 4, shopfront: "#e30613", shopSign: "#ffffff", trim: "#c08c70" },
  { wall: "#efe9dd", storeys: 4, cols: 5, shopfront: "#13a05a", shopSign: "#ffffff", glass: "#2f4a55" },
  { wall: "#d8c79a", storeys: 2, cols: 4, shopfront: "#f47b20", shopSign: "#1a1a1a", trim: "#bfa978" },
  // 4-6 residential (Cantonments): calm rendered villas, no shopfront
  { wall: "#f1efe6", storeys: 2, cols: 3, glass: "#4a5b63", trim: "#ddd8c8" },
  { wall: "#e3dcc7", storeys: 2, cols: 3, glass: "#43545c" },
  { wall: "#cfd4d6", storeys: 3, cols: 4, glass: "#36505c", modern: true, trim: "#b9c0c2" },
  // 7-8 institutional / civic (37 Military Hospital): plain pale slabs
  { wall: "#eef0ea", storeys: 3, cols: 5, glass: "#41545c", trim: "#dfe2da" },
  { wall: "#e7e3d6", storeys: 4, cols: 5, glass: "#3c4d54" },
  // 9 distant skyline: glassy tower
  { wall: "#b9c4cb", storeys: 7, cols: 5, glass: "#33505f", modern: true, trim: "#9fb0b8" },
];
const DISTRICT_FACADES = {
  commercial: [0, 1, 2, 3],
  residential: [4, 5, 6],
  institutional: [7, 8],
};
// terracotta / rusted-zinc / dark roofing for pitched residential roofs
const PITCHED_COLORS = ["#8a4b3a", "#7d5a4a", "#6f7d86", "#9a5a44", "#55606a"];

function CityBuildings() {
  const data = useMemo(() => {
    const dummy = new THREE.Object3D();
    const districts = buildDistricts();
    const facadeTex = FACADE_SPECS.map(makeFacadeTexture);
    const buckets = facadeTex.map(() => []); // matrices per facade archetype
    const flatRoofs = [];
    const stairwells = [];
    const pitched = [];
    const pitchedColors = [];
    const tanks = [];
    const length = getTrackLength();
    const plan = buildLandmarkPlan();
    const pitchPalette = PITCHED_COLORS.map((c) => new THREE.Color(c));

    const addBuilding = (pos, w, h, d, yaw, district, band) => {
      const hash = Math.abs(Math.round(pos.x * 3.1 + pos.z * 7.3 + w * 11 + d * 5));
      const choices = DISTRICT_FACADES[district] || DISTRICT_FACADES.institutional;
      const fi = choices[hash % choices.length];
      buckets[fi].push(composeMatrixBox(dummy, pos.x, pos.y + h / 2, pos.z, w, h, d, yaw));
      // local axes for placing rooftop clutter inside the footprint
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      if (district === "residential" && band === 0) {
        // low villa: hip roof in zinc / terracotta (cone is rotated 45° so its
        // eaves line up with the walls), no rooftop tanks on show
        pitched.push(composeMatrixBox(dummy, pos.x, pos.y + h + 0.95, pos.z, w * 0.8, 2.0, d * 0.8, yaw + Math.PI / 4));
        pitchedColors.push(pitchPalette[hash % pitchPalette.length]);
      } else {
        flatRoofs.push(composeMatrixBox(dummy, pos.x, pos.y + h + 0.1, pos.z, w + 0.4, 0.35, d + 0.4, yaw));
        if (hash % 4 !== 0) {
          // rooftop stairwell / penthouse box for silhouette
          stairwells.push(composeMatrixBox(dummy, pos.x + rx * w * 0.18, pos.y + h + 0.9, pos.z + rz * w * 0.18, w * 0.3, 1.4, d * 0.3, yaw));
        }
        if (hash % 3 !== 0) {
          // black poly water tank(s) — the signature Accra rooftop element
          const n = hash % 5 === 0 ? 2 : 1;
          for (let k = 0; k < n; k += 1) {
            const ox = rx * (w * (0.22 - k * 0.18)) + Math.sin(yaw) * (d * 0.2);
            const oz = rz * (w * (0.22 - k * 0.18)) + Math.cos(yaw) * (d * 0.2);
            tanks.push(composeMatrixBox(dummy, pos.x - ox, pos.y + h + 0.85, pos.z - oz, 1, 1, 1, 0));
          }
        }
      }
    };

    // two depth bands of roadside blocks either side of the street
    for (let distance = 0; distance < length; distance += 11) {
      if (!clearOfLandmarks(distance, plan, length)) continue; // leave room for set-pieces
      const frame = getTrackFrame(distance);
      const yawBase = Math.atan2(frame.tangent.x, frame.tangent.z);
      const district = districts.at(distance);
      const residential = district === "residential";
      let i = Math.round(distance);
      for (const side of [-1, 1]) {
        for (const band of [0, 1]) {
          i += 7;
          if (i % 8 === 0) continue; // alleys / forecourts / driveways
          let w = 5 + ((i * 5) % 6);
          let d = 5 + ((i * 3) % 7);
          let h = 3 + ((i * 13) % 9) * 0.95 + band * 1.6;
          if (residential) {
            h = 4 + ((i * 5) % 4) * 0.9; // low villas, fairly uniform
          } else if (district === "commercial") {
            h += 1.4; // taller shop blocks crowding the street
          }
          // villas sit further back behind their compound walls
          const setback = residential ? 11 : 8;
          const off = side * (TRACK.railOffset + setback + band * 15 + ((i * 7) % 6));
          const pos = frame.position.clone().addScaledVector(frame.normal, off);
          // clear by the building's own half-extent so corners never poke into
          // the road, even on the inside of tight bends (very fine sampling: at
          // the default 220 samples the ~23 m gaps let blocks slip onto the road)
          if (!isPointClearOfRoad(pos, TRACK.railOffset + Math.max(w, d) / 2 + 2, 1600)) continue;
          const yaw = yawBase + (((i * 17) % 7) - 3) * 0.04;
          addBuilding(pos, w, h, d, yaw, district, band);
        }
      }
    }

    // distant skyline ring (always the glassy tower archetype)
    for (let k = 0; k < 80; k += 1) {
      const angle = (k / 80) * Math.PI * 2 + 0.3;
      const radius = 175 + ((k * 47) % 190);
      const pos = new THREE.Vector3(TRACK.center.x + Math.cos(angle) * radius, 0, TRACK.center.z + Math.sin(angle) * radius);
      if (!isPointClearOfRoad(pos, TRACK.railOffset + 40)) continue;
      const w = 8 + ((k * 5) % 10);
      const d = 8 + ((k * 7) % 10);
      const h = 9 + ((k * 13) % 22);
      const yaw = (k * 0.5) % Math.PI;
      buckets[9].push(composeMatrixBox(dummy, pos.x, h / 2, pos.z, w, h, d, yaw));
      flatRoofs.push(composeMatrixBox(dummy, pos.x, h + 0.2, pos.z, w + 0.4, 0.4, d + 0.4, yaw));
    }

    return {
      facadeTex,
      buckets,
      flatRoofs,
      stairwells,
      pitched,
      pitchedColors,
      tanks,
      boxGeometry: new THREE.BoxGeometry(1, 1, 1),
      facadeMaterials: facadeTex.map((map) => new THREE.MeshStandardMaterial({ map, roughness: 0.88 })),
      flatRoofMaterial: new THREE.MeshStandardMaterial({ color: "#5c5650", roughness: 0.95 }),
      stairwellMaterial: new THREE.MeshStandardMaterial({ color: "#7a7269", roughness: 0.9 }),
      // 4-sided cone = hip roof at low poly
      pitchedGeometry: new THREE.ConeGeometry(0.72, 1, 4),
      pitchedMaterial: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 }),
      tankGeometry: new THREE.CylinderGeometry(0.55, 0.55, 1.1, 10),
      tankMaterial: new THREE.MeshStandardMaterial({ color: "#1c1c1e", roughness: 0.7 }),
    };
  }, []);
  return (
    <>
      {data.buckets.map((matrices, idx) => (
        matrices.length ? (
          <Instances key={idx} matrices={matrices} geometry={data.boxGeometry} material={data.facadeMaterials[idx]} castShadow />
        ) : null
      ))}
      <Instances matrices={data.flatRoofs} geometry={data.boxGeometry} material={data.flatRoofMaterial} />
      <Instances matrices={data.stairwells} geometry={data.boxGeometry} material={data.stairwellMaterial} castShadow />
      <Instances matrices={data.pitched} colors={data.pitchedColors} geometry={data.pitchedGeometry} material={data.pitchedMaterial} castShadow />
      <Instances matrices={data.tanks} geometry={data.tankGeometry} material={data.tankMaterial} castShadow />
    </>
  );
}

// Vegetation by district: leafy shade trees fill the green Cantonments avenues,
// street palms punctuate the commercial/civic stretches.
function CityTrees() {
  const data = useMemo(() => {
    const dummy = new THREE.Object3D();
    const districts = buildDistricts();
    const palmTrunks = [];
    const palmCrowns = [];
    const treeTrunks = [];
    const treeCanopies = [];
    const treeColors = [];
    const greens = ["#2f7d3f", "#266b36", "#3a8a49", "#1f5e2f"].map((c) => new THREE.Color(c));
    const length = getTrackLength();
    for (let i = 0; i < 200; i += 1) {
      const distance = (i / 200) * length;
      const frame = getTrackFrame(distance);
      const district = districts.at(distance);
      const side = i % 2 ? 1 : -1;
      const off = side * (TRACK.railOffset + 3.4 + ((i * 11) % 4));
      const pos = frame.position.clone().addScaledVector(frame.normal, off);
      // keep the whole canopy off the road, not just the trunk
      if (!isPointClearOfRoad(pos, TRACK.railOffset + 3.4, 1600)) continue;
      if (district === "residential") {
        // dense, rounded shade trees
        const h = 4.5 + ((i * 7) % 6) * 0.55;
        const r = 2.6 + ((i * 5) % 4) * 0.4;
        treeTrunks.push(composeMatrixBox(dummy, pos.x, pos.y + h / 2, pos.z, 0.9, h, 0.9, (i * 0.6) % Math.PI));
        treeCanopies.push(composeMatrixBox(dummy, pos.x, pos.y + h + r * 0.5, pos.z, r, r * 0.95, r, (i * 1.3) % Math.PI));
        treeColors.push(greens[i % greens.length]);
      } else if (i % 3 === 0) {
        // sparser street palms elsewhere
        const h = 3.6 + ((i * 7) % 6) * 0.5;
        palmTrunks.push(composeMatrixBox(dummy, pos.x, pos.y + h / 2, pos.z, 0.6, h, 0.6, (i * 0.6) % Math.PI));
        palmCrowns.push(composeMatrixBox(dummy, pos.x, pos.y + h + 0.2, pos.z, 1, 1, 1, (i * 1.1) % Math.PI));
      }
    }
    return {
      palmTrunks, palmCrowns, treeTrunks, treeCanopies, treeColors,
      palmTrunkGeometry: new THREE.CylinderGeometry(0.18, 0.32, 1, 6),
      palmCrownGeometry: new THREE.ConeGeometry(2.6, 1.5, 6),
      palmTrunkMaterial: new THREE.MeshStandardMaterial({ color: "#9c7c4d", roughness: 1 }),
      palmCrownMaterial: new THREE.MeshStandardMaterial({ color: "#3f7d39", roughness: 0.85 }),
      treeTrunkGeometry: new THREE.CylinderGeometry(0.22, 0.34, 1, 6),
      treeCanopyGeometry: new THREE.IcosahedronGeometry(1, 0),
      treeTrunkMaterial: new THREE.MeshStandardMaterial({ color: "#6a4a2c", roughness: 1 }),
      treeCanopyMaterial: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 }),
    };
  }, []);
  return (
    <>
      <Instances matrices={data.palmTrunks} geometry={data.palmTrunkGeometry} material={data.palmTrunkMaterial} castShadow />
      <Instances matrices={data.palmCrowns} geometry={data.palmCrownGeometry} material={data.palmCrownMaterial} castShadow />
      <Instances matrices={data.treeTrunks} geometry={data.treeTrunkGeometry} material={data.treeTrunkMaterial} castShadow />
      <Instances matrices={data.treeCanopies} colors={data.treeColors} geometry={data.treeCanopyGeometry} material={data.treeCanopyMaterial} castShadow />
    </>
  );
}

// Cantonments compound walls: a low rendered boundary wall hugging the road on
// residential stretches, broken by gate piers — what you actually see driving
// past the embassies and villas.
function CityWalls() {
  const data = useMemo(() => {
    const dummy = new THREE.Object3D();
    const districts = buildDistricts();
    const walls = [];
    const piers = [];
    const length = getTrackLength();
    const step = 6;
    let i = 0;
    for (let distance = 0; distance < length; distance += step) {
      if (districts.at(distance) !== "residential") continue;
      const frame = getTrackFrame(distance);
      const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
      for (const side of [-1, 1]) {
        i += 1;
        const off = side * (TRACK.railOffset + 3.8);
        const pos = frame.position.clone().addScaledVector(frame.normal, off);
        if (!isPointClearOfRoad(pos, TRACK.railOffset + 2.8, 1600)) continue;
        if (i % 6 === 0) {
          // gate gap: a pair of taller piers, no wall segment
          for (const t of [-1, 1]) {
            const px = pos.x + Math.sin(yaw) * t * 2;
            const pz = pos.z + Math.cos(yaw) * t * 2;
            piers.push(composeMatrixBox(dummy, px, pos.y + 1.4, pz, 0.7, 2.8, 0.7, yaw));
          }
        } else {
          walls.push(composeMatrixBox(dummy, pos.x, pos.y + 1.05, pos.z, 0.35, 2.1, step + 0.3, yaw));
        }
      }
    }
    return {
      walls, piers,
      boxGeometry: new THREE.BoxGeometry(1, 1, 1),
      wallMaterial: new THREE.MeshStandardMaterial({ color: "#dcd6c6", roughness: 0.95 }),
      pierMaterial: new THREE.MeshStandardMaterial({ color: "#cdc6b4", roughness: 0.9 }),
    };
  }, []);
  return (
    <>
      <Instances matrices={data.walls} geometry={data.boxGeometry} material={data.wallMaterial} castShadow />
      <Instances matrices={data.piers} geometry={data.boxGeometry} material={data.pierMaterial} castShadow />
    </>
  );
}

const UMBRELLA_COLORS = ["#ffcb05", "#e30613", "#0a7cc1", "#13a05a", "#f47b20", "#ffffff"];

// Roadside placement: walk the lap, drop spots either side, skip anything that
// would sit on the road. `face` orients a prop's front toward the street, and
// `distance` lets callers thin a prop out by district.
function roadsideSpots({ step, base, jitter = 4, seed = 1, sides = [-1, 1] }) {
  const out = [];
  const length = getTrackLength();
  const plan = buildLandmarkPlan();
  let i = seed;
  for (let distance = 0; distance < length; distance += step) {
    // keep a clear apron right around each set-piece so props don't bury it
    let nearLandmark = false;
    for (const l of plan) {
      const raw = (((distance - l.distance) % length) + length) % length;
      if (Math.min(raw, length - raw) < 16) { nearLandmark = true; break; }
    }
    if (nearLandmark) continue;
    const frame = getTrackFrame(distance);
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    for (const s of sides) {
      i += 1;
      const off = s * (TRACK.railOffset + base + ((i * 7) % jitter));
      const pos = frame.position.clone().addScaledVector(frame.normal, off);
      // fine sampling so props don't slip onto the road between checks on bends
      if (!isPointClearOfRoad(pos, TRACK.railOffset + 1.8, 1600)) continue;
      out.push({ pos: [pos.x, pos.y, pos.z], yaw, face: yaw + s * Math.PI / 2, side: s, i, distance });
    }
  }
  return out;
}

function longestStraightDistance() {
  const length = getTrackLength();
  const step = 5;
  let best = { len: 0, mid: length * 0.05 };
  let runStart = 0;
  let running = false;
  for (let d = 0; d <= length; d += step) {
    const straight = Math.abs(getTrackFrame(d).curvature) < 0.5;
    if (straight && !running) { running = true; runStart = d; }
    if ((!straight || d >= length) && running) {
      running = false;
      const len = d - runStart;
      if (len > best.len) best = { len, mid: runStart + len / 2 };
    }
  }
  return best.mid;
}

// Street-vendor stalls — a parasol over a goods table. They crowd the Osu
// commercial pavements and disappear in the quiet residential avenues.
function CityUmbrellas() {
  const data = useMemo(() => {
    const dummy = new THREE.Object3D();
    const districts = buildDistricts();
    const poles = [];
    const canopies = [];
    const tables = [];
    const canopyColors = [];
    const pal = UMBRELLA_COLORS.map((c) => new THREE.Color(c));
    roadsideSpots({ step: 13, base: 2.4, jitter: 5, seed: 3 }).forEach((s) => {
      if (districts.at(s.distance) !== "commercial") return;
      if (s.i % 2) return;
      const [x, y, z] = s.pos;
      poles.push(composeMatrixBox(dummy, x, y + 1.1, z, 1, 2.2, 1, 0));
      canopies.push(composeMatrixBox(dummy, x, y + 2.5, z, 1, 1, 1, s.i * 0.5));
      tables.push(composeMatrixBox(dummy, x, y + 0.85, z, 1.9, 0.18, 1.1, s.face));
      canopyColors.push(pal[s.i % pal.length]);
    });
    return {
      poles, canopies, tables, canopyColors,
      poleGeometry: new THREE.CylinderGeometry(0.05, 0.05, 1, 5),
      canopyGeometry: new THREE.ConeGeometry(1.8, 0.85, 8),
      tableGeometry: new THREE.BoxGeometry(1, 1, 1),
      poleMaterial: new THREE.MeshStandardMaterial({ color: "#5a4a36", roughness: 1 }),
      canopyMaterial: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85 }),
      tableMaterial: new THREE.MeshStandardMaterial({ color: "#6b5236", roughness: 0.9 }),
    };
  }, []);
  return (
    <>
      <Instances matrices={data.poles} geometry={data.poleGeometry} material={data.poleMaterial} />
      <Instances matrices={data.tables} geometry={data.tableGeometry} material={data.tableMaterial} castShadow />
      <Instances matrices={data.canopies} colors={data.canopyColors} geometry={data.canopyGeometry} material={data.canopyMaterial} castShadow />
    </>
  );
}

// Pedestrians: low-poly figures (body + head) clustered on the busy Osu
// pavements where the hawkers and shoppers actually are.
function CityHawkers() {
  const data = useMemo(() => {
    const dummy = new THREE.Object3D();
    const districts = buildDistricts();
    const bodies = [];
    const heads = [];
    const bodyColors = [];
    const headColors = [];
    const shirts = ["#e30613", "#0a7cc1", "#13a05a", "#f47b20", "#ffcb05", "#7b3fa0", "#f4f4f0"].map((c) => new THREE.Color(c));
    const skin = ["#5a3a23", "#6b4326", "#7a4e2c", "#4a2f1d"].map((c) => new THREE.Color(c));
    roadsideSpots({ step: 7, base: 1.6, jitter: 3, seed: 21 }).forEach((s) => {
      if (districts.at(s.distance) !== "commercial") return;
      if (s.i % 2) return;
      const [x, y, z] = s.pos;
      const h = 1.5 + ((s.i * 5) % 4) * 0.07;
      bodies.push(composeMatrixBox(dummy, x, y + h / 2, z, 1, h, 1, s.i * 0.7));
      heads.push(composeMatrixBox(dummy, x, y + h + 0.16, z, 1, 1, 1, 0));
      bodyColors.push(shirts[s.i % shirts.length]);
      headColors.push(skin[s.i % skin.length]);
    });
    return {
      bodies, heads, bodyColors, headColors,
      bodyGeometry: new THREE.CylinderGeometry(0.2, 0.26, 1, 6),
      headGeometry: new THREE.SphereGeometry(0.18, 6, 5),
      bodyMaterial: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 }),
      headMaterial: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95 }),
    };
  }, []);
  return (
    <>
      <Instances matrices={data.bodies} colors={data.bodyColors} geometry={data.bodyGeometry} material={data.bodyMaterial} castShadow />
      <Instances matrices={data.heads} colors={data.headColors} geometry={data.headGeometry} material={data.headMaterial} castShadow />
    </>
  );
}

// Flags belong to the embassies and missions of Cantonments, not the whole
// city — so they only fly on residential stretches, and sparingly.
function CityFlags() {
  const flagTex = useMemo(() => makeGhanaFlag(), []);
  const data = useMemo(() => {
    const dummy = new THREE.Object3D();
    const districts = buildDistricts();
    const poles = [];
    const flags = [];
    roadsideSpots({ step: 64, base: 3.0, jitter: 3, seed: 9 }).forEach((s) => {
      if (districts.at(s.distance) !== "residential") return;
      if (s.i % 2) return;
      const [x, y, z] = s.pos;
      const t = [Math.sin(s.yaw), 0, Math.cos(s.yaw)];
      poles.push(composeMatrixBox(dummy, x, y + 3, z, 1, 6, 1, 0));
      flags.push(composeMatrixBox(dummy, x + t[0] * 1.3, y + 5.1, z + t[2] * 1.3, 1, 1, 1, s.yaw));
    });
    return {
      poles, flags,
      poleGeometry: new THREE.CylinderGeometry(0.06, 0.06, 1, 6),
      poleMaterial: new THREE.MeshStandardMaterial({ color: "#d7d7d7", metalness: 0.4, roughness: 0.5 }),
      flagGeometry: new THREE.PlaneGeometry(2.4, 1.6),
      flagMaterial: new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 }),
    };
  }, [flagTex]);
  return (
    <>
      <Instances matrices={data.poles} geometry={data.poleGeometry} material={data.poleMaterial} />
      <Instances matrices={data.flags} geometry={data.flagGeometry} material={data.flagMaterial} />
    </>
  );
}

const KIOSK_BRANDS = [
  { color: "#ffcb05", lines: ["MTN"], fg: "#003a70" },
  { color: "#e30613", lines: ["TELECEL"], fg: "#ffffff" },
  { color: "#0a7cc1", lines: ["MOMO"], fg: "#ffffff" },
  { color: "#13a05a", lines: ["CHOP", "BAR"], fg: "#ffffff" },
  { color: "#f47b20", lines: ["PROVISIONS"], fg: "#1a1a1a" },
  { color: "#ffcb05", lines: ["MOBILE", "MONEY"], fg: "#003a70" },
];

function CityKiosks() {
  const brands = useMemo(() => KIOSK_BRANDS.map((b) => ({ ...b, tex: makeSignTexture(b.lines, b.color, b.fg) })), []);
  const districts = useMemo(buildDistricts, []);
  const spots = useMemo(() => roadsideSpots({ step: 13, base: 2.0, jitter: 4, seed: 5 }), []);
  return spots.map((s, idx) => {
    const district = districts.at(s.distance);
    if (district === "residential") return null; // no roadside kiosks behind the walls
    if (district === "institutional" && s.i % 2 === 0) return null; // sparse near the hospital
    if (s.i % 3 === 0) return null;
    const b = brands[s.i % brands.length];
    const [x, y, z] = s.pos;
    return (
      <group key={`kiosk-${idx}`} position={[x, y, z]} rotation={[0, s.face, 0]}>
        <mesh castShadow position={[0, 1.1, 0]}>
          <boxGeometry args={[2.8, 2.2, 2.2]} />
          <meshStandardMaterial color={b.color} roughness={0.7} />
        </mesh>
        <mesh position={[0, 2.35, 0]}>
          <boxGeometry args={[3.1, 0.28, 2.5]} />
          <meshStandardMaterial color="#2f2f2f" roughness={0.8} />
        </mesh>
        <mesh position={[0, 1.55, 1.13]}>
          <planeGeometry args={[2.5, 1.0]} />
          <meshStandardMaterial map={b.tex} emissive={b.color} emissiveIntensity={0.18} />
        </mesh>
      </group>
    );
  });
}

const TROTRO_DESTS = [["CIRCLE"], ["37"], ["OSU"], ["ACCRA"], ["LAPAZ"], ["MADINA"], ["KANESHIE"], ["TEMA"]];

function CityTrotros() {
  const dests = useMemo(() => TROTRO_DESTS.map((d) => makeSignTexture(d, "#16213a", "#ffd54a")), []);
  const districts = useMemo(buildDistricts, []);
  const spots = useMemo(() => roadsideSpots({ step: 30, base: 3.4, jitter: 3, seed: 7 }), []);
  return spots.map((s, idx) => {
    if (districts.at(s.distance) === "residential") return null; // no parked trotros in the embassy quarter
    if (s.i % 2) return null;
    const [x, y, z] = s.pos;
    const tex = dests[s.i % dests.length];
    const body = s.i % 3 === 0 ? "#ffce3a" : s.i % 3 === 1 ? "#f4f4f0" : "#e9e9e4";
    return (
      <group key={`tro-${idx}`} position={[x, y, z]} rotation={[0, s.yaw, 0]}>
        <mesh castShadow position={[0, 1.2, 0]}>
          <boxGeometry args={[2.2, 2.0, 5.2]} />
          <meshStandardMaterial color={body} roughness={0.55} metalness={0.1} />
        </mesh>
        <mesh position={[0, 1.85, 0]}>
          <boxGeometry args={[2.24, 0.85, 4.0]} />
          <meshStandardMaterial color="#243240" roughness={0.25} metalness={0.3} />
        </mesh>
        <mesh position={[0, 2.32, 0]}>
          <boxGeometry args={[2.1, 0.3, 4.8]} />
          <meshStandardMaterial color={body} roughness={0.55} />
        </mesh>
        <mesh position={[0, 1.35, -2.62]}>
          <planeGeometry args={[1.8, 0.6]} />
          <meshStandardMaterial map={tex} />
        </mesh>
        {[-1.75, 1.75].map((wz) => [-1.02, 1.02].map((wx) => (
          <mesh key={`${wz}-${wx}`} position={[wx, 0.42, wz]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.42, 0.42, 0.22, 8]} />
            <meshStandardMaterial color="#14161a" />
          </mesh>
        )))}
      </group>
    );
  });
}

const BILLBOARD_LINES = [["AKWAABA", "TO ACCRA"], ["GHANA", "BLACK STARS"], ["ICE COLD", "MINERALS"], ["MTN", "EVERYWHERE YOU GO"]];

function CityBillboards() {
  const boards = useMemo(() => BILLBOARD_LINES.map((b, i) => makeSignTexture(b, ["#0a7cc1", "#006b3f", "#e30613", "#ffcb05"][i % 4], i === 3 ? "#003a70" : "#ffffff")), []);
  const districts = useMemo(buildDistricts, []);
  const spots = useMemo(() => roadsideSpots({ step: 88, base: 7, jitter: 4, seed: 11 }), []);
  return spots.map((s, idx) => {
    if (districts.at(s.distance) === "residential") return null; // billboards line the arterials, not the quiet streets
    if (s.i % 2) return null;
    const [x, y, z] = s.pos;
    const tex = boards[s.i % boards.length];
    return (
      <group key={`bb-${idx}`} position={[x, y, z]} rotation={[0, s.face, 0]}>
        <mesh position={[-2.4, 3, 0]}><boxGeometry args={[0.3, 6, 0.3]} /><meshStandardMaterial color="#555" /></mesh>
        <mesh position={[2.4, 3, 0]}><boxGeometry args={[0.3, 6, 0.3]} /><meshStandardMaterial color="#555" /></mesh>
        <mesh position={[0, 6.6, 0.1]}><planeGeometry args={[8, 3.4]} /><meshStandardMaterial map={tex} side={THREE.DoubleSide} /></mesh>
      </group>
    );
  });
}

// The Black Star Gate — Accra's defining monument, built to drive under.
function BlackStarGate({ distance }) {
  const star = useMemo(() => makeStarGeometry(1, 0.42, 0.6), []);
  const inscription = useMemo(() => makeSignTexture(["FREEDOM AND JUSTICE"], "#8a1f1f", "#f7f0e0"), []);
  const { pos, yaw } = useMemo(() => {
    const frame = getTrackFrame(distance);
    const p = frame.position.clone();
    return { pos: [p.x, p.y, p.z], yaw: Math.atan2(frame.tangent.x, frame.tangent.z) };
  }, [distance]);
  return (
    <group position={pos} rotation={[0, yaw, 0]}>
      {[[-8.5, -3.2], [-8.5, 3.2], [8.5, -3.2], [8.5, 3.2]].map(([lx, lz], i) => (
        <mesh key={i} castShadow position={[lx, 6, lz]}>
          <boxGeometry args={[2.4, 12, 2.4]} />
          <meshStandardMaterial color="#efe7d4" roughness={0.82} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 12.7, 0]}>
        <boxGeometry args={[21, 2.4, 8.6]} />
        <meshStandardMaterial color="#f3ecdb" roughness={0.8} />
      </mesh>
      {[[-1, "#ce1126"], [0, "#fcd116"], [1, "#006b3f"]].map(([o, c]) => (
        <mesh key={o} position={[0, 11.3, 4.35 + o * 0.001]}>
          <boxGeometry args={[21, 0.42, 0.12]} />
          <meshStandardMaterial color={c} />
        </mesh>
      ))}
      <mesh position={[0, 12.8, 4.36]}>
        <planeGeometry args={[17, 1.5]} />
        <meshStandardMaterial map={inscription} />
      </mesh>
      <mesh position={[0, 14.1, 0]}>
        <cylinderGeometry args={[2.5, 3.0, 0.7, 20]} />
        <meshStandardMaterial color="#efe7d4" roughness={0.8} />
      </mesh>
      <mesh position={[0, 16.4, 0]} scale={[2.9, 2.9, 1]} geometry={star}>
        <meshStandardMaterial color="#0c0c0c" roughness={0.45} metalness={0.15} />
      </mesh>
    </group>
  );
}

// Curated landmark layout. Projecting the real GPS coordinates collapsed Osu's
// landmarks onto the same start point (and dumped Oxford St 600 m off-route), so
// instead we lay the set-pieces out at chosen lap fractions: spread around the
// loop, each in its district, each on the driven road with a generous setback
// and a cleared zone (clearM) where generic buildings are suppressed so the
// landmark actually stands out instead of drowning in the roadside blocks.
const LANDMARK_PLAN = [
  { id: "danquah", frac: 0.05, side: 1, clearM: 30 }, // Osu roundabout, just past the line
  { id: "akoadjei", frac: 0.145, side: 0, clearM: 24 }, // flyover, late on the long straight (spaced from the arch)
  { id: "hospital", frac: 0.18, side: -1, clearM: 40 }, // 37 Military Hospital, the one open institutional straight
  { id: "embassy", frac: 0.80, side: 1, clearM: 42 }, // diplomatic compound, Cantonments
];

// Snap a target distance to the straightest point within a window, so wide
// set-pieces (long compound walls, the flyover deck) sit on a straight and
// their ends never swing over the curving road.
function snapToStraight(distance, length, window = 95, step = 4) {
  let best = distance;
  let bestCurv = Infinity;
  for (let o = -window; o <= window; o += step) {
    const d = (((distance + o) % length) + length) % length;
    const c = Math.abs(getTrackFrame(d).curvature);
    if (c < bestCurv) { bestCurv = c; best = d; }
  }
  return best;
}

function buildLandmarkPlan() {
  const length = getTrackLength();
  return LANDMARK_PLAN.map((l) => {
    const raw = (((l.frac % 1) + 1) % 1) * length;
    const distance = snapToStraight(raw, length);
    const frame = getTrackFrame(distance);
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    return { ...l, distance, frame, yaw };
  });
}

// Position a set-piece beside its landmark site at the given setback (metres
// beyond the rail). Returns the world position plus the yaw that faces the
// model's front toward the street.
function landmarkAnchor(item, setback) {
  const s = item.side || 1;
  const pos = item.frame.position.clone().addScaledVector(item.frame.normal, s * (TRACK.railOffset + setback));
  return { pos: [pos.x, pos.y, pos.z], yaw: item.yaw, face: item.yaw + (s * Math.PI) / 2, side: s };
}

// True when `distance` is clear of every landmark's reserved zone — used by the
// generic building/prop loops to leave room around the set-pieces.
function clearOfLandmarks(distance, plan, length) {
  for (const l of plan) {
    const raw = (((distance - l.distance) % length) + length) % length;
    if (Math.min(raw, length - raw) < l.clearM) return false;
  }
  return true;
}

function GhanaFlagPole({ position = [0, 0, 0], height = 8 }) {
  const flagTex = useMemo(() => makeGhanaFlag(), []);
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.1, 0.12, height, 6]} />
        <meshStandardMaterial color="#dcdcdc" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[1.3, height - 1.2, 0]}>
        <planeGeometry args={[2.5, 1.7]} />
        <meshStandardMaterial map={flagTex} side={THREE.DoubleSide} roughness={0.8} />
      </mesh>
    </group>
  );
}

// Ako Adjei Interchange: the flyover near Danquah Circle (Ghana's first
// interchange). A raised road deck on piers crosses over the racing road at an
// angle, so you sweep underneath it — a strong, recognizable gateway.
function AkoAdjeiFlyover({ item }) {
  const sign = useMemo(() => makeSignTexture(["AKO ADJEI", "INTERCHANGE"], "#16314a", "#ffd54a"), []);
  if (!item) return null;
  const [px, py, pz] = [item.frame.position.x, item.frame.position.y, item.frame.position.z];
  // The group is aligned to the road (local +X = across the road, local +Z =
  // along it), so columns at local x = ±pierX sit a fixed distance OUTSIDE the
  // rails no matter how the road curves — nothing solid ever lands on the road.
  const deckY = 7.8;
  const pierX = TRACK.railOffset + 4; // columns well clear of the rail
  const cross = 0.5; // deck skews across the road so it reads as a crossing
  const span = 36; // deck half-length, overhangs past the columns
  return (
    <group position={[px, py, pz]} rotation={[0, item.yaw, 0]}>
      {/* support columns: two rows on each shoulder */}
      {[-1, 1].map((sx) => (
        [-5.5, 5.5].map((dz) => (
          <mesh key={`${sx}-${dz}`} castShadow position={[sx * pierX, deckY / 2, dz]}>
            <boxGeometry args={[2.4, deckY, 3]} />
            <meshStandardMaterial color="#cfc7b6" roughness={0.9} />
          </mesh>
        ))
      ))}
      {/* the elevated deck crosses above the road (well over the car) at a skew */}
      <group rotation={[0, cross, 0]}>
        <mesh castShadow position={[0, deckY, 0]}>
          <boxGeometry args={[span * 2, 1.2, 12]} />
          <meshStandardMaterial color="#3a3f44" roughness={0.95} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[0, deckY + 0.9, s * 5.7]}>
            <boxGeometry args={[span * 2, 0.9, 0.5]} />
            <meshStandardMaterial color="#d9d2c2" roughness={0.85} />
          </mesh>
        ))}
        {/* a couple of vehicles up on the flyover */}
        {[-9, 8].map((x, i) => (
          <mesh key={x} position={[x, deckY + 1.2, i ? 2 : -2]} rotation={[0, Math.PI / 2, 0]}>
            <boxGeometry args={[2.1, 1.4, 4.6]} />
            <meshStandardMaterial color={i ? "#c43b32" : "#e8e8e2"} roughness={0.5} metalness={0.1} />
          </mesh>
        ))}
      </group>
      {/* overhead name gantry facing oncoming traffic */}
      <mesh position={[0, deckY + 3.1, -8]}>
        <boxGeometry args={[13, 3, 0.3]} />
        <meshStandardMaterial map={sign} emissive="#16314a" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

// National Theatre of Ghana: the white modernist building whose roof reads as a
// set of upswept sails. Backdrop set-piece (not on the racing line).
function NationalTheatre({ position = [0, 0, 0], yaw = 0, scale = 1 }) {
  return (
    <group position={position} rotation={[0, yaw, 0]} scale={scale}>
      <mesh castShadow position={[0, 4, 0]}>
        <boxGeometry args={[34, 8, 22]} />
        <meshStandardMaterial color="#f3f1ea" roughness={0.7} />
      </mesh>
      {/* three upswept white shells (quarter-cylinders tilted up) */}
      {[[-9, 11, 0.5], [2, 14, -0.35], [12, 12, 0.5]].map(([x, h, tilt], i) => (
        <mesh key={i} castShadow position={[x, 8 + h / 2, 0]} rotation={[tilt, 0, tilt * 0.4]}>
          <cylinderGeometry args={[h * 0.62, h * 0.62, 20, 16, 1, false, 0, Math.PI]} />
          <meshStandardMaterial color="#fbfaf5" roughness={0.5} metalness={0.05} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh position={[0, 1.6, 11.2]}>
        <boxGeometry args={[26, 3.2, 0.4]} />
        <meshStandardMaterial color="#2a3340" roughness={0.4} metalness={0.3} />
      </mesh>
    </group>
  );
}

// Kwame Nkrumah Mausoleum: the upward-tapering "sword into the sky" monument on
// a stepped plinth, set in its memorial park. Backdrop set-piece.
function NkrumahMausoleum({ position = [0, 0, 0], yaw = 0, scale = 1 }) {
  const star = useMemo(() => makeStarGeometry(1, 0.42, 0.4), []);
  return (
    <group position={position} rotation={[0, yaw, 0]} scale={scale}>
      {/* park lawn + stepped base */}
      <mesh receiveShadow position={[0, 0.3, 0]}>
        <cylinderGeometry args={[20, 21, 0.6, 8]} />
        <meshStandardMaterial color="#6f8a55" roughness={1} />
      </mesh>
      {[[10, 0.9], [7.5, 1.8], [5, 2.7]].map(([r, y], i) => (
        <mesh key={i} castShadow position={[0, y, 0]}>
          <cylinderGeometry args={[r, r + 1.2, 1, 8]} />
          <meshStandardMaterial color="#d8d2c2" roughness={0.9} />
        </mesh>
      ))}
      {/* tapering shaft topped by a narrow point (sword) */}
      <mesh castShadow position={[0, 11, 0]}>
        <cylinderGeometry args={[0.5, 3.4, 16, 6]} />
        <meshStandardMaterial color="#e9e3d4" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 20, 0]}>
        <coneGeometry args={[0.5, 4, 6]} />
        <meshStandardMaterial color="#e9e3d4" roughness={0.8} />
      </mesh>
      {/* fountains/pillars flanking */}
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[s * 13, 2.4, 6]}>
          <cylinderGeometry args={[0.7, 0.9, 4.8, 6]} />
          <meshStandardMaterial color="#e3ddcd" roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 14, 1.9]} scale={[1.6, 1.6, 1]} geometry={star}>
        <meshStandardMaterial color="#0c0c0c" roughness={0.5} metalness={0.2} />
      </mesh>
    </group>
  );
}

// Skyline placement: stand a hero icon out in the open infield on a bearing
// from the track centre, pushed outward until it's well clear of the road. It
// then reads as a city monument across the interior of the loop — visible from
// the far straights regardless of which way you're facing on the near side.
function skylineSpot(angleDeg, radius) {
  const a = (angleDeg * Math.PI) / 180;
  let r = radius;
  let pos = new THREE.Vector3(TRACK.center.x + Math.cos(a) * r, 0.2, TRACK.center.z + Math.sin(a) * r);
  for (let k = 0; k < 40 && !isPointClearOfRoad(pos, TRACK.railOffset + 28, 600); k += 1) {
    r += 14;
    pos = new THREE.Vector3(TRACK.center.x + Math.cos(a) * r, 0.2, TRACK.center.z + Math.sin(a) * r);
  }
  const yaw = Math.atan2(TRACK.center.x - pos.x, TRACK.center.z - pos.z); // face the centre
  return { position: [pos.x, pos.y, pos.z], yaw };
}

// Explicit skyline position (grid-verified to sit far from every road), facing
// back toward the track centre.
function fixedSkyline(x, z) {
  return { position: [x, 0.2, z], yaw: Math.atan2(TRACK.center.x - x, TRACK.center.z - z) };
}

function CityLandmarks() {
  const plan = useMemo(buildLandmarkPlan, []);
  const byId = useMemo(() => Object.fromEntries(plan.map((p) => [p.id, p])), [plan]);
  const spots = useMemo(() => ({
    danquah: landmarkAnchor(byId.danquah, 11),
    hospital: landmarkAnchor(byId.hospital, 16),
    embassy: landmarkAnchor(byId.embassy, 16),
  }), [byId]);
  const hospitalSign = useMemo(() => makeSignTexture(["37 MILITARY HOSPITAL"], "#0a5a3c", "#ffffff", "#f4c430"), []);
  const danquahSign = useMemo(() => makeSignTexture(["DANQUAH CIRCLE"], "#10243a", "#f4c430"), []);
  const embassySign = useMemo(() => makeSignTexture(["EMBASSY"], "#16314a", "#ffffff"), []);
  // hero skyline icons sit on big open ground (verified far from any road so
  // their footprint can't touch the track) on a clean sightline from a straight
  const theatre = useMemo(() => fixedSkyline(-640, -455), []);
  const mausoleum = useMemo(() => skylineSpot(205, 130), []);

  return (
    <>
      {/* 37 Military Hospital: long cream ward blocks + a tower, big red cross,
          entrance gate, name board, ambulances and a flag, in its own compound */}
      <group position={spots.hospital.pos} rotation={[0, spots.hospital.face, 0]}>
        <GhanaFlagPole position={[12, 0, 8]} height={11} />
        {/* perimeter wall + gate piers facing the street */}
        <mesh position={[0, 1.2, 11]}>
          <boxGeometry args={[26, 2.4, 0.5]} />
          <meshStandardMaterial color="#e4dfd2" roughness={0.95} />
        </mesh>
        {[-3, 3].map((x) => (
          <mesh key={x} castShadow position={[x, 1.7, 11]}>
            <boxGeometry args={[1, 3.4, 1]} />
            <meshStandardMaterial color="#d8d2c2" roughness={0.9} />
          </mesh>
        ))}
        {/* main ward block */}
        <mesh castShadow position={[0, 4, 0]}>
          <boxGeometry args={[22, 8, 9]} />
          <meshStandardMaterial color="#eef0ea" roughness={0.85} />
        </mesh>
        {/* floor banding so it reads as multi-storey */}
        {[2.3, 5].map((y) => (
          <mesh key={y} position={[0, y, 4.6]}>
            <boxGeometry args={[22, 0.4, 0.3]} />
            <meshStandardMaterial color="#cdd0c8" roughness={0.9} />
          </mesh>
        ))}
        {/* taller ward tower with the red cross */}
        <mesh castShadow position={[-7, 8, -1]}>
          <boxGeometry args={[7, 16, 8]} />
          <meshStandardMaterial color="#e6e8e2" roughness={0.85} />
        </mesh>
        <mesh castShadow position={[8, 6, -1]}>
          <boxGeometry args={[7, 11, 8]} />
          <meshStandardMaterial color="#e9ebe5" roughness={0.85} />
        </mesh>
        <mesh position={[-7, 12, 3.1]}>
          <boxGeometry args={[3.4, 1.1, 0.4]} />
          <meshBasicMaterial color="#d8202f" />
        </mesh>
        <mesh position={[-7, 12, 3.1]}>
          <boxGeometry args={[1.1, 3.4, 0.4]} />
          <meshBasicMaterial color="#d8202f" />
        </mesh>
        {/* name board over the gate */}
        <mesh position={[0, 3.8, 11.4]}>
          <boxGeometry args={[13, 2.2, 0.3]} />
          <meshStandardMaterial map={hospitalSign} emissive="#0a5a3c" emissiveIntensity={0.28} />
        </mesh>
        {/* two ambulances in the forecourt */}
        {[-4.5, 5].map((x, i) => (
          <group key={x} position={[x, 0, 7]} rotation={[0, i ? 0.4 : -0.3, 0]}>
            <mesh castShadow position={[0, 1.2, 0]}>
              <boxGeometry args={[2.2, 2.1, 4.6]} />
              <meshStandardMaterial color="#f4f4f0" roughness={0.5} />
            </mesh>
            <mesh position={[0, 1.2, 1.3]}>
              <boxGeometry args={[2.22, 0.7, 0.7]} />
              <meshBasicMaterial color="#d8202f" />
            </mesh>
            <mesh position={[0, 2.4, 0]}>
              <boxGeometry args={[0.6, 0.4, 0.6]} />
              <meshStandardMaterial color="#2f6fd0" emissive="#2f6fd0" emissiveIntensity={0.5} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Danquah Circle: planted roundabout island with the J.B. Danquah statue
          on a plinth, ringed by kerb and shrubs, with a name board */}
      <group position={spots.danquah.pos} rotation={[0, spots.danquah.face, 0]}>
        <mesh receiveShadow position={[0, 0.25, 0]}>
          <cylinderGeometry args={[9, 9.5, 0.5, 28]} />
          <meshStandardMaterial color="#9aa37e" roughness={1} />
        </mesh>
        <mesh receiveShadow position={[0, 0.6, 0]}>
          <cylinderGeometry args={[8, 8.4, 0.4, 28]} />
          <meshStandardMaterial color="#b9b1a0" roughness={1} />
        </mesh>
        {Array.from({ length: 14 }).map((_, i) => {
          const a = (i / 14) * Math.PI * 2;
          return (
            <mesh key={i} castShadow position={[Math.cos(a) * 7, 1.2, Math.sin(a) * 7]}>
              <icosahedronGeometry args={[1, 0]} />
              <meshStandardMaterial color={i % 2 ? "#2f7d3f" : "#266b36"} roughness={0.9} />
            </mesh>
          );
        })}
        <mesh castShadow position={[0, 1.4, 0]}>
          <boxGeometry args={[3.6, 1.6, 3.6]} />
          <meshStandardMaterial color="#d8d0bd" roughness={0.85} />
        </mesh>
        <mesh castShadow position={[0, 3.4, 0]}>
          <boxGeometry args={[2.2, 2.8, 2.2]} />
          <meshStandardMaterial color="#e8e2d4" roughness={0.8} />
        </mesh>
        {/* the statue: a standing bronze figure (head, torso, legs) */}
        <mesh castShadow position={[0, 6.4, 0]}>
          <cylinderGeometry args={[0.5, 0.62, 3, 8]} />
          <meshStandardMaterial color="#5d5240" metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh castShadow position={[0.55, 7, 0.2]} rotation={[0, 0, -0.5]}>
          <cylinderGeometry args={[0.16, 0.16, 1.8, 6]} />
          <meshStandardMaterial color="#5d5240" metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh castShadow position={[0, 8.3, 0]}>
          <sphereGeometry args={[0.48, 10, 8]} />
          <meshStandardMaterial color="#5d5240" metalness={0.5} roughness={0.5} />
        </mesh>
        {/* name board on the kerb facing the road */}
        <mesh position={[0, 2.2, 9]}>
          <boxGeometry args={[8, 1.8, 0.3]} />
          <meshStandardMaterial map={danquahSign} emissive="#10243a" emissiveIntensity={0.3} />
        </mesh>
      </group>

      {/* Cantonments diplomatic compound: long perimeter wall, guarded gate,
          a row of flags and low modern blocks set back behind the wall */}
      <group position={spots.embassy.pos} rotation={[0, spots.embassy.face, 0]}>
        {/* perimeter wall */}
        <mesh castShadow position={[0, 1.6, 9]}>
          <boxGeometry args={[42, 3.2, 0.6]} />
          <meshStandardMaterial color="#e7e2d6" roughness={0.92} />
        </mesh>
        {/* gatehouse + barrier */}
        <mesh castShadow position={[0, 1.6, 9]}>
          <boxGeometry args={[6, 3.6, 3]} />
          <meshStandardMaterial color="#dcd6c6" roughness={0.9} />
        </mesh>
        <mesh position={[3.6, 1.2, 9]} rotation={[0, 0, 0.2]}>
          <boxGeometry args={[4, 0.25, 0.25]} />
          <meshStandardMaterial color="#d8202f" roughness={0.6} />
        </mesh>
        {/* row of flags along the wall */}
        {[-14, -7, 7, 14].map((x) => (
          <GhanaFlagPole key={x} position={[x, 0, 7.5]} height={9} />
        ))}
        {/* low modern blocks + seal */}
        <mesh castShadow position={[-9, 4, -1]}>
          <boxGeometry args={[14, 8, 12]} />
          <meshStandardMaterial color="#eceae2" roughness={0.7} />
        </mesh>
        <mesh castShadow position={[9, 3.2, 0]}>
          <boxGeometry args={[13, 6.4, 12]} />
          <meshStandardMaterial color="#dfe3e6" roughness={0.55} metalness={0.1} />
        </mesh>
        <mesh position={[-9, 8.4, 5.9]}>
          <boxGeometry args={[14.2, 0.5, 12.2]} />
          <meshStandardMaterial color="#5a6b76" roughness={0.6} />
        </mesh>
        <mesh position={[0, 5.2, 9.4]}>
          <boxGeometry args={[6, 2, 0.2]} />
          <meshStandardMaterial map={embassySign} emissive="#16314a" emissiveIntensity={0.25} />
        </mesh>
      </group>

      {/* on-road flyover and distant city icons */}
      <AkoAdjeiFlyover item={byId.akoadjei} />
      <NationalTheatre position={theatre.position} yaw={theatre.yaw} scale={3.2} />
      <NkrumahMausoleum position={mausoleum.position} yaw={mausoleum.yaw} scale={4.2} />
    </>
  );
}

function StartGantry({ countdownRef }) {
  const lightMats = useRef([]);
  const { position, yaw } = useMemo(() => {
    const frame = getTrackFrame(TRACK.startDistance);
    const pos = frame.position.clone();
    pos.y += 0.2;
    return { position: pos, yaw: Math.atan2(frame.tangent.x, frame.tangent.z) };
  }, []);

  const checkerTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 20;
    canvas.height = 4;
    const ctx = canvas.getContext("2d");
    for (let x = 0; x < 20; x += 1) {
      for (let y = 0; y < 4; y += 1) {
        ctx.fillStyle = (x + y) % 2 ? "#15181c" : "#f4f6f2";
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    return texture;
  }, []);

  const bannerTexture = useMemo(() => {
    const texture = new THREE.TextureLoader().load("/banner.jpg");
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);

  useFrame(() => {
    const c = countdownRef?.current ?? -1;
    // F1-style: red lights fill during 3-2-1, all green at GO, then off
    const lit = c > 0 ? Math.max(0, Math.min(5, Math.ceil((3 - c) / 0.6))) : 5;
    const go = c <= 0 && c > -0.9;
    const off = c <= -0.9;
    lightMats.current.forEach((material, index) => {
      if (!material) return;
      if (off) {
        material.emissiveIntensity = 0.05;
        material.color.set("#23090c");
        material.emissive.set("#3a0d12");
      } else if (go) {
        material.color.set("#1d4d2a");
        material.emissive.set("#37ff78");
        material.emissiveIntensity = 3.2;
      } else if (index < lit) {
        material.color.set("#5e1016");
        material.emissive.set("#ff2231");
        material.emissiveIntensity = 3;
      } else {
        material.emissiveIntensity = 0.05;
        material.color.set("#23090c");
        material.emissive.set("#3a0d12");
      }
    });
  });

  return (
    <group position={position} rotation={[0, yaw, 0]}>
      {/* checkered start line painted on the road */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TRACK.width * 0.96, 2.2]} />
        <meshStandardMaterial map={checkerTexture} roughness={0.7} />
      </mesh>
      {/* A-frame legs with feet */}
      {[-6.1, 6.1].map((x) => (
        <group key={x} position={[x, 0, -0.4]}>
          <mesh castShadow position={[0, 2.6, 0]}>
            <boxGeometry args={[0.34, 5.2, 0.34]} />
            <meshStandardMaterial color="#dfe5e8" metalness={0.5} roughness={0.35} />
          </mesh>
          <mesh castShadow position={[0, 2.6, 0]} rotation={[0, 0, x > 0 ? 0.1 : -0.1]}>
            <boxGeometry args={[0.16, 5.0, 0.16]} />
            <meshStandardMaterial color="#9aa6ac" metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.18, 0]}>
            <boxGeometry args={[1.1, 0.36, 1.1]} />
            <meshStandardMaterial color="#d8202f" roughness={0.5} />
          </mesh>
        </group>
      ))}
      {/* striped barrier blocks at the legs */}
      {[-6.1, 6.1].map((x) =>
        [0, 1, 2].map((i) => (
          <mesh key={`${x}-${i}`} castShadow position={[x + (x > 0 ? 0.0 : 0.0), 0.32, 0.9 + i * 0.95]}>
            <boxGeometry args={[0.7, 0.62, 0.9]} />
            <meshStandardMaterial color={i % 2 ? "#f4f6f2" : "#d8202f"} roughness={0.6} />
          </mesh>
        )),
      )}
      {/* top truss */}
      <mesh castShadow position={[0, 5.25, -0.4]}>
        <boxGeometry args={[12.9, 0.22, 0.42]} />
        <meshStandardMaterial color="#dfe5e8" metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh castShadow position={[0, 4.45, -0.4]}>
        <boxGeometry args={[12.9, 0.22, 0.42]} />
        <meshStandardMaterial color="#dfe5e8" metalness={0.5} roughness={0.35} />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => -5.4 + i * 1.35).map((x, i) => (
        <mesh key={`brace-${x}`} position={[x, 4.85, -0.4]} rotation={[0, 0, i % 2 ? 0.7 : -0.7]}>
          <boxGeometry args={[0.1, 0.95, 0.1]} />
          <meshStandardMaterial color="#9aa6ac" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      {/* CHOP FIRST banner — rotated to face the approaching cars */}
      <mesh position={[0, 3.35, -0.38]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[11.6, 1.9]} />
        <meshBasicMaterial map={bannerTexture} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {/* start light pod */}
      <group position={[0, 4.85, -0.72]}>
        <mesh castShadow>
          <boxGeometry args={[3.1, 0.78, 0.3]} />
          <meshStandardMaterial color="#101418" roughness={0.4} />
        </mesh>
        {[-1.2, -0.6, 0, 0.6, 1.2].map((x, index) => (
          <mesh key={x} position={[x, 0, -0.17]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.19, 0.19, 0.06, 14]} />
            <meshStandardMaterial
              ref={(node) => {
                lightMats.current[index] = node;
              }}
              color="#23090c"
              emissive="#3a0d12"
              emissiveIntensity={0.05}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Grandstand() {
  const { position, yaw, crowd } = useMemo(() => {
    const frame = getTrackFrame(TRACK.startDistance - 6);
    const pos = frame.position.clone().addScaledVector(frame.normal, -(TRACK.railOffset + 7.5));
    pos.y += 0.1;
    // stand sits on the -normal side, so face it toward +normal (the road)
    const yawAngle = Math.atan2(frame.tangent.x, frame.tangent.z) - Math.PI / 2;
    const dummy = new THREE.Object3D();
    const matrices = [];
    const colors = [];
    const palette = ["#ff5a4e", "#ffd45e", "#4da3ff", "#7df0ae", "#f4f6f2", "#c178ff"];
    for (let tier = 0; tier < 3; tier += 1) {
      for (let i = 0; i < 14; i += 1) {
        if ((i * 7 + tier * 3) % 4 === 0) continue; // gaps in the crowd
        dummy.position.set(-5.8 + i * 0.9 + ((tier * 13 + i * 7) % 3) * 0.12, 1.05 + tier * 0.78, -0.55 - tier * 1.05);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.42, 0.62, 0.36);
        dummy.updateMatrix();
        matrices.push(dummy.matrix.clone());
        colors.push(new THREE.Color(palette[(i + tier * 5) % palette.length]));
      }
    }
    return { position: pos, yaw: yawAngle, crowd: { matrices, colors } };
  }, []);

  const crowdRef = useRef(null);
  useLayoutEffect(() => {
    const mesh = crowdRef.current;
    if (!mesh) return;
    crowd.matrices.forEach((matrix, index) => {
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, crowd.colors[index]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [crowd]);

  return (
    <group position={position} rotation={[0, yaw, 0]}>
      {/* tiered seating */}
      {[0, 1, 2].map((tier) => (
        <mesh key={tier} castShadow receiveShadow position={[0, 0.4 + tier * 0.78, -tier * 1.05]}>
          <boxGeometry args={[13, 0.8 + tier * 0.0, 1.15]} />
          <meshStandardMaterial color={tier % 2 ? "#5a666e" : "#4a545b"} roughness={0.8} />
        </mesh>
      ))}
      {/* crowd */}
      <instancedMesh ref={crowdRef} args={[undefined, undefined, crowd.matrices.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      {/* roof */}
      {[-5.6, 5.6].map((x) => (
        <mesh key={x} castShadow position={[x, 2.7, -1.6]}>
          <boxGeometry args={[0.18, 2.6, 0.18]} />
          <meshStandardMaterial color="#3d464b" roughness={0.5} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 4.05, -1.3]} rotation={[0.16, 0, 0]}>
        <boxGeometry args={[13.4, 0.12, 2.6]} />
        <meshStandardMaterial color="#d8202f" roughness={0.55} />
      </mesh>
      {/* flag poles */}
      {[-7.4, 7.4].map((x) => (
        <group key={x} position={[x, 0, 0.4]}>
          <mesh castShadow position={[0, 2.6, 0]}>
            <cylinderGeometry args={[0.05, 0.07, 5.2, 6]} />
            <meshStandardMaterial color="#cfd9dd" metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0.55, 4.85, 0]}>
            <planeGeometry args={[1.1, 0.62]} />
            <meshStandardMaterial color={x < 0 ? "#ffd45e" : "#d8202f"} side={THREE.DoubleSide} roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CurveMarker({ position, yaw, direction }) {
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <mesh castShadow position={[0, 1.35, 0]}>
        <boxGeometry args={[1.45, 0.72, 0.08]} />
        <meshStandardMaterial color="#f4cf38" roughness={0.48} />
      </mesh>
      <mesh castShadow position={[direction * 0.22, 1.35, -0.055]} rotation={[0, 0, direction * -0.72]}>
        <boxGeometry args={[0.18, 0.62, 0.05]} />
        <meshStandardMaterial color="#1a1d20" roughness={0.4} />
      </mesh>
      <mesh castShadow position={[direction * -0.16, 1.35, -0.055]} rotation={[0, 0, direction * 0.72]}>
        <boxGeometry args={[0.18, 0.62, 0.05]} />
        <meshStandardMaterial color="#1a1d20" roughness={0.4} />
      </mesh>
      <mesh castShadow position={[0, 0.54, 0]}>
        <boxGeometry args={[0.12, 1.08, 0.12]} />
        <meshStandardMaterial color="#3d464b" roughness={0.5} />
      </mesh>
    </group>
  );
}

function BrakeBoard({ position, yaw, count }) {
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <mesh castShadow position={[0, 0.62, 0]}>
        <boxGeometry args={[0.1, 1.24, 0.1]} />
        <meshStandardMaterial color="#2b3338" roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 1.42, 0]}>
        <boxGeometry args={[1.02, 1.0, 0.08]} />
        <meshStandardMaterial color="#f4f6f2" roughness={0.5} />
      </mesh>
      {/* descending diagonal stripes — 3 boards out, 1 at the brake point */}
      {Array.from({ length: count }).map((_, i) => (
        <mesh key={i} position={[(-(count - 1) / 2 + i) * 0.27, 1.42, 0.05]} rotation={[0, 0, 0.34]}>
          <boxGeometry args={[0.13, 0.94, 0.02]} />
          <meshBasicMaterial color="#15181c" />
        </mesh>
      ))}
    </group>
  );
}

// Countdown braking boards on the outside approach to the sharpest corners:
// three boards (3/2/1 stripes) at descending distances. Decorative, and they
// teach the brake point so players get faster — which keeps them playing.
function createBrakeBoards() {
  const length = getTrackLength();
  const apexes = [];
  let last = -999;
  for (let d = 0; d < length; d += 6) {
    const frame = getTrackFrame(d);
    if (Math.abs(frame.curvature) < 1.5 || d - last < 95) continue;
    apexes.push({ d, side: Math.sign(frame.curvature) || 1 });
    last = d;
  }
  const stops = [
    { count: 3, before: 52 },
    { count: 2, before: 35 },
    { count: 1, before: 18 },
  ];
  const boards = [];
  for (const apex of apexes) {
    const outSide = -apex.side; // boards sit on the outside of the upcoming turn
    for (const stop of stops) {
      const d = (apex.d - stop.before + length) % length;
      const frame = getTrackFrame(d);
      const pos = frame.position.clone().addScaledVector(frame.normal, outSide * (TRACK.railOffset + 1.5));
      if (!isPointClearOfRoad(pos, TRACK.railOffset + 0.7)) continue;
      pos.y += 0.2;
      boards.push({
        key: `brake-${Math.round(apex.d)}-${stop.count}`,
        position: [pos.x, pos.y, pos.z],
        yaw: Math.atan2(frame.tangent.x, frame.tangent.z) + (outSide > 0 ? Math.PI / 2 : -Math.PI / 2),
        count: stop.count,
      });
    }
  }
  return boards;
}

function createCurveMarkers() {
  const length = getTrackLength();
  const items = [];
  let lastDistance = -999;
  for (let distance = 0; distance < length; distance += 10) {
    const frame = getTrackFrame(distance);
    if (Math.abs(frame.curvature) < 0.78 || distance - lastDistance < 28) continue;
    const side = Math.sign(frame.curvature) || 1;
    const position = frame.position.clone().addScaledVector(frame.normal, side * (TRACK.railOffset + 1.6));
    position.y += 0.2;
    if (!isPointClearOfRoad(position, TRACK.railOffset + 0.8)) continue;
    items.push({
      key: `curve-marker-${Math.round(distance)}`,
      position,
      yaw: Math.atan2(frame.tangent.x, frame.tangent.z) + (side > 0 ? Math.PI / 2 : -Math.PI / 2),
      direction: side,
    });
    lastDistance = distance;
  }
  return items;
}

/* ----------------------------------- car ----------------------------------- */

// Visual wheel placement per vehicle (the hover bike has none). Kept in sync with
// the wheelbase feel set in vehicle.js so the contact patches roughly line up.
const WHEEL_LAYOUT = {
  street: { x: 0.88, fz: 1.32, rz: -1.32, r: 0.34 },
  taxi: { x: 0.86, fz: 1.3, rz: -1.34, r: 0.35 },
  trotro: { x: 0.96, fz: 1.72, rz: -1.78, r: 0.42 },
};

const RaceCar = forwardRef(function RaceCar({ carState, color, headlights, vehicle = "street" }, ref) {
  const paint = color || "#d81f33";
  // dark stripe on light paint, light stripe otherwise
  const stripe = ["#e8ecef", "#f5b818"].includes(paint) ? "#14181d" : "#f4f7fa";
  const hover = vehicle === "hoverbike";
  const wheels = WHEEL_LAYOUT[vehicle] || WHEEL_LAYOUT.street;
  // Boost-jet placement and color: blue for the bike, orange exhaust for the rest.
  const flameSpec = hover
    ? { xs: [-0.13, 0.13], y: 0.04, z: -1.48, color: "#46b4ff" }
    : vehicle === "trotro"
      ? { xs: [-0.5, 0.5], y: 0.45, z: -2.85, color: "#ff9b2e" }
      : vehicle === "taxi"
        ? { xs: [-0.4, 0.4], y: 0.4, z: -2.35, color: "#ff9b2e" }
        : { xs: [-0.36, 0.36], y: 0.4, z: -2.45, color: "#ff9b2e" };
  const bodyRef = useRef(null);
  const frontLeftSteer = useRef(null);
  const frontRightSteer = useRef(null);
  const spinRefs = useRef([]);
  const tailMatRef = useRef(null);
  const flameLeft = useRef(null);
  const flameRight = useRef(null);
  // red-hot inner cores for the bike's boost flare (blue jet + red core)
  const coreLeft = useRef(null);
  const coreRight = useRef(null);
  const boostLight = useRef(null);
  // headlight spotlight aims at this object, parked ahead of the nose in local
  // space so it sweeps with the car through corners
  const headlightTarget = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, dt) => {
    const car = carState;
    if (!car) return;
    const speedT = Math.min(1, Math.abs(car.forwardSpeed) / 40);
    const spin = (car.forwardSpeed * dt) / 0.34;
    spinRefs.current.forEach((wheel) => {
      if (wheel) wheel.rotation.x += spin;
    });
    const steerAngle = car.steer * 0.42;
    if (frontLeftSteer.current) frontLeftSteer.current.rotation.y = steerAngle;
    if (frontRightSteer.current) frontRightSteer.current.rotation.y = steerAngle;
    if (bodyRef.current) {
      if (hover) {
        // The bike has no suspension to hide behind, so it leans hard into corners
        // and bobs on its cushion of air.
        bodyRef.current.rotation.z = THREE.MathUtils.clamp(-car.sideSpeed * 0.045 + car.steer * 0.13 * speedT, -0.32, 0.32);
        bodyRef.current.rotation.x = THREE.MathUtils.clamp(car.brake * 0.05 * speedT - car.throttle * 0.03, -0.09, 0.11);
        bodyRef.current.position.y = Math.sin(car.timeMs * 0.004) * 0.06;
      } else {
        bodyRef.current.rotation.z = THREE.MathUtils.clamp(-car.sideSpeed * 0.02 + car.steer * 0.03 * speedT, -0.12, 0.12);
        bodyRef.current.rotation.x = THREE.MathUtils.clamp(car.brake * 0.035 * speedT - car.throttle * 0.018, -0.05, 0.06);
      }
    }
    if (tailMatRef.current) {
      const braking = car.brake > 0.2 || car.reversing;
      tailMatRef.current.emissiveIntensity = THREE.MathUtils.lerp(tailMatRef.current.emissiveIntensity, braking ? 3.4 : 0.85, 1 - Math.exp(-dt * 14));
    }
    const boostK = car.boostTimer > 0 ? Math.min(1, car.boostTimer / 0.9) : 0;
    const flicker = 0.75 + Math.random() * 0.45;
    if (hover) {
      // Blue thrust grows with speed; boost roughly doubles it and fires a red core.
      const speedK = Math.min(1, Math.abs(car.forwardSpeed) / 26);
      const blue = Math.max(0.18 + speedK * 0.7, boostK * 1.5);
      for (const flame of [flameLeft.current, flameRight.current]) {
        if (flame) flame.scale.set(blue * flicker, blue * flicker, blue * (1.1 + Math.random() * 0.7));
      }
      const red = boostK * (0.9 + Math.random() * 0.3);
      for (const core of [coreLeft.current, coreRight.current]) {
        if (core) core.scale.set(red, red, red * (1 + Math.random() * 0.5));
      }
      if (boostLight.current) boostLight.current.intensity = 1.6 + speedK * 1.5 + boostK * 6;
    } else {
      // The cars only flame on boost.
      const k = boostK;
      for (const flame of [flameLeft.current, flameRight.current]) {
        if (flame) flame.scale.set(k * flicker, k * flicker, k * (1 + Math.random() * 0.6));
      }
      if (boostLight.current) boostLight.current.intensity = boostK * 5;
    }
  });

  return (
    <group ref={ref}>
      <group ref={bodyRef}>
        <Suspense fallback={null}>
          <GLBVehicle vehicle={vehicle} paint={paint} />
        </Suspense>
      </group>
      {/* boost flames live outside the rolling body so they stay behind the bumper.
          The bike adds a red-hot inner core that only shows under boost. */}
      {flameSpec.xs.map((x, i) => (
        <group key={x} position={[x, flameSpec.y, flameSpec.z]}>
          <mesh ref={i === 0 ? flameLeft : flameRight} rotation={[-Math.PI / 2, 0, 0]} scale={[0, 0, 0]}>
            <coneGeometry args={[0.17, 1.1, 8]} />
            <meshBasicMaterial color={flameSpec.color} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
          {hover && (
            <mesh ref={i === 0 ? coreLeft : coreRight} rotation={[-Math.PI / 2, 0, 0]} scale={[0, 0, 0]}>
              <coneGeometry args={[0.12, 1.0, 8]} />
              <meshBasicMaterial color="#ff5630" transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
          )}
        </group>
      ))}
      <pointLight ref={boostLight} position={[0, 0.7, flameSpec.z - 0.25]} color={flameSpec.color} intensity={0} distance={9} />
      {headlights && (
        <>
          {/* the beam that actually lights the road ahead */}
          <primitive object={headlightTarget} position={[0, -3.4, 26]} />
          <spotLight
            position={[0, 0.95, 2.1]}
            target={headlightTarget}
            color="#fff3d0"
            intensity={42}
            distance={62}
            angle={0.62}
            penumbra={0.55}
            decay={1.1}
          />
          {/* visible light shafts from each lamp */}
          {[-0.62, 0.62].map((x) => (
            <mesh key={`beam-${x}`} position={[x, 0.6, 5.4]} rotation={[Math.PI / 2 + 0.06, 0, 0]}>
              <coneGeometry args={[1.5, 6.6, 16, 1, true]} />
              <meshBasicMaterial color="#fff4d2" transparent opacity={0.06} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
});

function Wheel({ x, z, r = 0.34, steerRef, spinRefs, index }) {
  return (
    <group position={[x, r, z]} ref={steerRef}>
      <group
        ref={(node) => {
          spinRefs.current[index] = node;
        }}
      >
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[r, r, 0.3, 16]} />
          <meshStandardMaterial color="#0b0d10" roughness={0.7} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[r * 0.56, r * 0.56, 0.32, 12]} />
          <meshStandardMaterial color="#aab3bc" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh>
          <boxGeometry args={[r, 0.1, 0.3]} />
          <meshStandardMaterial color="#5b646d" metalness={0.6} roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}


/* -------------------------------- particles -------------------------------- */

const PARTICLE_PRESETS = {
  smoke: { color: "#dfe3e6", opacity: 0.34, size: 0.5, gravity: 0.6, life: 0.75, blending: THREE.NormalBlending, flat: false },
  spark: { color: "#ffb347", opacity: 0.95, size: 0.12, gravity: 12, life: 0.45, blending: THREE.AdditiveBlending, flat: false },
  skid: { color: "#17191c", opacity: 0.5, size: 0.42, gravity: 0, life: 3.2, blending: THREE.NormalBlending, flat: true },
};

const Particles = forwardRef(function Particles({ mode = "smoke", count = 64 }, ref) {
  const preset = PARTICLE_PRESETS[mode];
  const meshRef = useRef(null);
  const pool = useMemo(
    () => ({
      items: Array.from({ length: count }, () => ({ age: Infinity, life: preset.life, scale: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3() })),
      cursor: 0,
      dummy: new THREE.Object3D(),
    }),
    [count, preset.life],
  );

  useImperativeHandle(
    ref,
    () => ({
      spawn(position, velocity, scale = 1) {
        const item = pool.items[pool.cursor];
        pool.cursor = (pool.cursor + 1) % count;
        item.age = 0;
        item.life = preset.life * (0.75 + Math.random() * 0.5);
        item.scale = scale;
        item.pos.copy(position);
        item.vel.copy(velocity);
      },
    }),
    [pool, count, preset.life],
  );

  useFrame((_, dt) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = pool.dummy;
    pool.items.forEach((item, index) => {
      item.age += dt;
      const t = item.age / item.life;
      if (t >= 1) {
        dummy.position.set(0, -50, 0);
        dummy.scale.setScalar(0.0001);
      } else {
        item.vel.y -= preset.gravity * dt;
        item.pos.addScaledVector(item.vel, dt);
        let s;
        if (mode === "smoke") s = item.scale * preset.size * (0.5 + t * 2.2) * (1 - t * t * 0.7);
        else if (mode === "spark") s = item.scale * preset.size * (1 - t);
        else s = item.scale * preset.size * (t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25);
        dummy.position.copy(item.pos);
        dummy.rotation.set(preset.flat ? -Math.PI / 2 : 0, 0, 0);
        dummy.scale.setScalar(Math.max(0.0001, s));
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      {preset.flat ? <planeGeometry args={[1, 1.6]} /> : <sphereGeometry args={[0.5, 6, 6]} />}
      <meshBasicMaterial color={preset.color} transparent opacity={preset.opacity} depthWrite={false} blending={preset.blending} />
    </instancedMesh>
  );
});

/* ------------------------------ pickups/ghosts ------------------------------ */

function Pickups({ collected, lap }) {
  return PICKUPS.map((pickup, index) => {
    if (collected.has(lap * 1000 + index)) return null;
    const position = pointAt(pickup.distance, pickup.lateral);
    position.y += 1.05;
    return <Coin key={index} position={position} />;
  });
}

function Coin({ position }) {
  const ref = useRef(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 4;
  });
  return (
    <mesh ref={ref} position={position} castShadow>
      <torusGeometry args={[0.42, 0.12, 14, 28]} />
      <meshStandardMaterial color="#ffd948" emissive="#8d6200" emissiveIntensity={0.32} roughness={0.36} metalness={0.28} />
    </mesh>
  );
}

function Ghosts({ challenge, pbRun, car, showLabels }) {
  // runs without a usable trace (legacy/pre-validator data) can't be replayed
  const runs = (challenge?.runs || []).filter((run) => run.ghost?.length > 1).slice(0, 2);
  return (
    <>
      {pbRun?.ghost?.length > 0 && <GhostCar run={pbRun} label="YOUR BEST" color="#ffd15c" car={car} showLabel={showLabels} />}
      {runs.map((run, index) => (
        <GhostCar key={run.id || index} run={run} label={run.name} color={index ? "#c178ff" : "#61d4ff"} car={car} showLabel={showLabels} />
      ))}
    </>
  );
}

// Interpolated trace lookup — decimated samples are ~0.3–0.5s apart, so the
// old nearest-sample replay visibly stepped. Handles legacy {x,y,a} fields.
function sampleGhost(ghost, t) {
  const val = (s) => ({ d: s.d ?? s.x ?? 0, l: s.l ?? s.y ?? 0, h: s.h ?? s.a ?? 0 });
  if (t <= (ghost[0].t || 0)) return val(ghost[0]);
  const last = ghost[ghost.length - 1];
  if (t >= (last.t || 0)) return val(last);
  let lo = 0;
  let hi = ghost.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((ghost[mid].t || 0) <= t) lo = mid;
    else hi = mid;
  }
  const a = val(ghost[lo]);
  const b = val(ghost[hi]);
  const k = (t - ghost[lo].t) / (ghost[hi].t - ghost[lo].t || 1);
  return { d: a.d + (b.d - a.d) * k, l: a.l + (b.l - a.l) * k, h: a.h + (b.h - a.h) * k };
}

function traceSpeed(ghost, t) {
  const windowMs = 250;
  const before = sampleGhost(ghost, Math.max(0, t - windowMs));
  const now = sampleGhost(ghost, t);
  return (now.d - before.d) / (windowMs / 1000);
}

function formatGhostTime(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000).toString().padStart(2, "0");
  const centis = Math.floor((ms % 1000) / 10).toString().padStart(2, "0");
  return `${minutes}:${seconds}.${centis}`;
}

function GhostCar({ run, label, color, car, showLabel }) {
  const ref = useRef(null);
  const labelRef = useRef(null);
  const bodyMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.5,
        emissive: color,
        emissiveIntensity: 0.45,
        roughness: 0.35,
        metalness: 0.3,
        depthWrite: false,
      }),
    [color],
  );
  const tailMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#34110d", transparent: true, opacity: 0.8, emissive: "#ff2a1f", emissiveIntensity: 0.4, depthWrite: false }),
    [],
  );

  useFrame(() => {
    const ghost = run.ghost || [];
    if (!ref.current || ghost.length < 2) return;
    // synced to race time so it's a true side-by-side race: ghosts launch at
    // GO and park at the finish line once their run is over (no looping)
    const t = Math.min(car.timeMs, run.timeMs || Infinity);
    const sample = sampleGhost(ghost, t);
    const transform = getGhostTransform(sample.d, sample.l, sample.h);
    ref.current.position.copy(transform.position);
    ref.current.rotation.set(0, transform.yaw, 0);

    // transient, not obstructive: fade away as the player closes in
    const dist = transform.position.distanceTo(car.position);
    const fade = THREE.MathUtils.clamp((dist - 5) / 14, 0, 1);
    bodyMat.opacity = 0.13 + fade * 0.37;
    tailMat.opacity = 0.18 + fade * 0.62;

    // brake light inferred from the trace slowing down
    tailMat.emissiveIntensity = traceSpeed(ghost, t) < traceSpeed(ghost, t - 350) - 1.2 ? 3.2 : 0.4;

    if (labelRef.current) {
      labelRef.current.visible = dist > 7 && dist < 130;
    }
  });

  return (
    <group ref={ref}>
      <GhostShell material={bodyMat} tailMaterial={tailMat} />
      {showLabel && label && (
        <Billboard ref={labelRef} position={[0, 2.3, 0]}>
          <Text fontSize={0.62} color={color} outlineWidth={0.05} outlineColor="#0b1118" anchorX="center" anchorY="bottom">
            {`${label} · ${formatGhostTime(run.timeMs)}`}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

function GhostShell({ material, tailMaterial }) {
  return (
    <group>
      <mesh material={material} position={[0, 0.55, -0.15]}>
        <boxGeometry args={[1.94, 0.42, 3.4]} />
      </mesh>
      <mesh material={material} position={[0, 0.52, 1.72]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[1.84, 0.34, 1.3]} />
      </mesh>
      <mesh material={material} position={[0, 0.96, -0.35]}>
        <boxGeometry args={[1.5, 0.48, 1.45]} />
      </mesh>
      <mesh material={material} position={[0, 1.15, -2.0]}>
        <boxGeometry args={[1.9, 0.07, 0.45]} />
      </mesh>
      <mesh material={tailMaterial} position={[0, 0.62, -1.87]}>
        <boxGeometry args={[1.6, 0.13, 0.06]} />
      </mesh>
      {[-0.88, 0.88].map((x) =>
        [-1.32, 1.32].map((z) => (
          <mesh key={`${x}${z}`} material={material} position={[x, 0.34, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.34, 0.34, 0.28, 10]} />
          </mesh>
        )),
      )}
    </group>
  );
}

function getGhostTransform(distance, lateral, headingError) {
  const frame = getTrackFrame(distance);
  const position = frame.position.clone().addScaledVector(frame.normal, lateral);
  position.y += 0.66;
  const roadYaw = Math.atan2(frame.tangent.x, frame.tangent.z);
  return { position, yaw: roadYaw - headingError };
}

/* --------------------------------- controls --------------------------------- */

function SteerArrows({ dir }) {
  return (
    <svg
      viewBox="0 0 68 76"
      width="68"
      height="76"
      fill="none"
      stroke="currentColor"
      strokeWidth="8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={dir === "right" ? { transform: "scaleX(-1)" } : undefined}
      aria-hidden
    >
      <path d="M26 6 10 38l16 32" />
      <path d="M38 6 22 38l16 32" opacity=".58" />
      <path d="M50 6 34 38l16 32" opacity=".32" />
      <path d="M62 6 46 38l16 32" opacity=".14" />
    </svg>
  );
}

function DriftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="15.5" cy="8.5" r="5" />
      <path d="M3 21c2.6-1.1 4.3-2.8 5.4-5.4" />
      <path d="M8.5 21.5c2-.9 3.4-2.3 4.3-4.3" opacity=".55" />
    </svg>
  );
}

function BrakeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="6.2" />
      <path d="M4.6 4.6a10.4 10.4 0 0 0 0 14.8" />
      <path d="M19.4 4.6a10.4 10.4 0 0 1 0 14.8" />
      <path d="M12 9.2v3.4" />
      <circle cx="12" cy="15.4" r=".4" fill="currentColor" />
    </svg>
  );
}

function BoostTank({ boosts }) {
  const ratio = Math.max(0, Math.min(1, boosts / MAX_BOOST_CHARGES));
  const fillHeight = 27 * ratio;
  return (
    <svg viewBox="0 0 32 46" width="30" height="43" aria-hidden>
      <rect x="11" y="1" width="10" height="5" rx="1.5" fill="currentColor" opacity=".85" />
      <rect x="4.5" y="7.5" width="23" height="37" rx="6" fill="none" stroke="currentColor" strokeWidth="2.2" />
      {ratio > 0 && (
        <rect x="8.5" y={11.5 + 27 - fillHeight} width="15" height={fillHeight} rx={Math.min(2.5, fillHeight / 2)} fill="currentColor" />
      )}
    </svg>
  );
}

// Touch layout: throttle is automatic. Steering is split — one zone in each
// bottom corner so each thumb owns a direction. DRIFT is mirrored above both
// zones (it's held *while* steering, so it must be reachable by whichever
// thumb is free). Boost tank + brake bar sit center, out of fat-finger range.
function TouchControls({ controlsRef, boosts }) {
  const padRef = useRef(null);

  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return;
    const pointers = new Map();
    const counts = {};

    // Refcounted: both DRIFT buttons drive the same input key, so a key only
    // releases when the last finger holding it lifts.
    const apply = (key, pressed) => {
      counts[key] = Math.max(0, (counts[key] || 0) + (pressed ? 1 : -1));
      const on = counts[key] > 0;
      controlsRef.current[key] = on;
      pad.querySelectorAll(`[data-control="${key}"]`).forEach((el) => el.classList.toggle("pressed", on));
    };
    const controlAt = (x, y) => document.elementFromPoint(x, y)?.closest?.("[data-control]")?.dataset.control ?? null;

    const down = (event) => {
      const key = event.target.closest?.("[data-control]")?.dataset?.control;
      if (!key) return;
      // preventDefault blocks iOS long-press selection/magnifier on held buttons
      event.preventDefault();
      pointers.set(event.pointerId, key);
      apply(key, true);
    };
    // No pointer capture: thumbs slide between controls (steer ↔ drift) and
    // releasing means sliding off, so re-target by position on every move.
    const move = (event) => {
      const prev = pointers.get(event.pointerId);
      if (prev === undefined) return;
      const next = controlAt(event.clientX, event.clientY);
      if (next === prev) return;
      if (prev) apply(prev, false);
      if (next) apply(next, true);
      pointers.set(event.pointerId, next);
    };
    const lift = (event) => {
      const prev = pointers.get(event.pointerId);
      if (prev === undefined) return;
      if (prev) apply(prev, false);
      pointers.delete(event.pointerId);
    };

    pad.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", lift);
    window.addEventListener("pointercancel", lift);
    return () => {
      pad.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", lift);
      window.removeEventListener("pointercancel", lift);
      for (const key of Object.keys(counts)) {
        if (counts[key] > 0) controlsRef.current[key] = false;
      }
    };
  }, [controlsRef]);

  return (
    <div ref={padRef} className="touch-controls race-controls" onContextMenu={(event) => event.preventDefault()}>
      <div className="corner-cluster">
        <button type="button" className="t-drift" aria-label="Drift" data-control="handbrake">
          <DriftIcon />
          <span>DRIFT</span>
        </button>
        <button type="button" className="t-steer" aria-label="Steer left" data-control="left"><SteerArrows dir="left" /></button>
      </div>
      <div className="center-cluster">
        <button type="button" className={`t-boost${boosts <= 0 ? " empty" : ""}`} aria-label={`Boost, ${boosts} charges left`} data-control="boost">
          <BoostTank boosts={boosts} />
          <b>×{boosts}</b>
        </button>
        <button type="button" className="t-brake" aria-label="Brake, hold to reverse" data-control="brake">
          <BrakeIcon />
          <span>BRAKE</span>
        </button>
      </div>
      <div className="corner-cluster">
        <button type="button" className="t-drift" aria-label="Drift" data-control="handbrake">
          <DriftIcon />
          <span>DRIFT</span>
        </button>
        <button type="button" className="t-steer" aria-label="Steer right" data-control="right"><SteerArrows dir="right" /></button>
      </div>
    </div>
  );
}

function useKeyboard(inputRef, setShowDebug, setPaused, onRestart) {
  useEffect(() => {
    inputRef.current.toggleDebug = () => setShowDebug((value) => !value);
    inputRef.current.togglePause = () => setPaused((value) => !value);
    inputRef.current.restart = onRestart;
    const down = (event) => setKey(inputRef.current, event, true);
    const up = (event) => setKey(inputRef.current, event, false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      delete inputRef.current.toggleDebug;
      delete inputRef.current.togglePause;
      delete inputRef.current.restart;
    };
  }, [inputRef, setShowDebug, setPaused, onRestart]);
}

function setKey(input, event, value) {
  const key = event.key.toLowerCase();
  if (value && key === "f3") {
    event.preventDefault();
    input.toggleDebug?.();
  }
  if (value && (key === "escape" || key === "p")) {
    input.togglePause?.();
  }
  if (value && key === "r") {
    input.restart?.();
  }
  if (key === "arrowleft" || key === "a") input.left = value;
  if (key === "arrowright" || key === "d") input.right = value;
  if (key === "arrowup" || key === "w") input.gas = value;
  if (key === "arrowdown" || key === "s") input.brake = value;
  if (key === "shift") input.handbrake = value;
  if (event.key === " ") input.boost = value;
}
