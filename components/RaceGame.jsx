"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, Sky, Stars, Text } from "@react-three/drei";
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
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
    fog: ["#c4e3f0", 90, 580],
    hemisphere: ["#cfe9ff", "#3d5232", 0.55],
    ambient: 0.35,
    sun: { position: [40, 70, 25], color: "#fff4e0", intensity: 1.6 },
    sky: { sunPosition: [100, 40, 40], turbidity: 8, rayleigh: 0.8 },
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
    headlights: true,
  },
};

export default function RaceGame({ driver, challenge, pbRun, timeOfDay = "day", onFinish, onQuit, onRestart }) {
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
        {theme.sky ? (
          <Sky {...theme.sky} />
        ) : (
          <>
            <Stars radius={320} depth={80} count={1400} factor={6} saturation={0} fade speed={0.4} />
            <mesh position={[140, 150, -260]}>
              <sphereGeometry args={[16, 24, 24]} />
              <meshBasicMaterial color="#eaf0ff" />
            </mesh>
            <pointLight position={[140, 150, -260]} color="#cdd9ff" intensity={0.6} distance={0} />
          </>
        )}
        <RaceScene inputRef={inputRef} challenge={challenge} pbRun={pbRun} driver={driver} onFinish={onFinish} setRace={setRace} showDebug={showDebug} pausedRef={pausedRef} audio={audio} ghostLabels={ghostLabels} headlights={theme.headlights} />
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

function RaceScene({ inputRef, challenge, pbRun, driver, onFinish, setRace, showDebug, pausedRef, audio, ghostLabels, headlights }) {
  const car = useMemo(() => createVehicleState(), []);
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
      <RaceCar ref={carRef} carState={car} color={driver?.color} headlights={headlights} />
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
  const mountains = useMemo(() => createMountains(), []);

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
        <meshStandardMaterial color="#4f7a3c" roughness={1} />
      </mesh>
      <mesh receiveShadow geometry={rightShoulder}>
        <meshStandardMaterial color="#578643" roughness={1} />
      </mesh>
      <mesh geometry={leftRail}>
        <meshStandardMaterial color="#cfd9dd" metalness={0.55} roughness={0.32} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={rightRail}>
        <meshStandardMaterial color="#cfd9dd" metalness={0.55} roughness={0.32} side={THREE.DoubleSide} />
      </mesh>
      <RailPosts />
      <Delineators />
      <Forest />
      <Rocks />
      <Grandstand />
      {curveMarkers.map((marker) => (
        <CurveMarker key={marker.key} position={marker.position} yaw={marker.yaw} direction={marker.direction} />
      ))}
      {mountains.map((mountain) => (
        <mesh key={mountain.key} position={mountain.position} scale={[mountain.scale * 1.5, mountain.scale, mountain.scale * 1.5]}>
          <coneGeometry args={[1, 1.6, 6]} />
          <meshStandardMaterial color={mountain.color} roughness={1} />
        </mesh>
      ))}
      <Clouds />
      <mesh receiveShadow position={[TRACK.center.x, -26, TRACK.center.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1600, 1600, 1, 1]} />
        <meshStandardMaterial color="#558544" roughness={1} />
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

function Instances({ matrices, geometry, material, castShadow = false }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    matrices.forEach((matrix, index) => ref.current.setMatrixAt(index, matrix));
    ref.current.instanceMatrix.needsUpdate = true;
  }, [matrices]);
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

function Forest() {
  const data = useMemo(() => {
    const dummy = new THREE.Object3D();
    const trunks = [];
    const canopies = [];
    const length = getTrackLength();
    for (let i = 0; i < 170; i += 1) {
      const distance = (i / 170) * length;
      const frame = getTrackFrame(distance);
      const side = i % 2 ? 1 : -1;
      const offset = side * (TRACK.railOffset + 4.6 + ((i * 17) % 11));
      const pos = frame.position.clone().addScaledVector(frame.normal, offset);
      if (!isPointClearOfRoad(pos, TRACK.railOffset + 3)) continue;
      const scale = 0.85 + ((i * 13) % 9) * 0.13;
      trunks.push(composeMatrix(dummy, pos.x, pos.y + 0.75 * scale, pos.z, scale));
      canopies.push(composeMatrix(dummy, pos.x, pos.y + 2.3 * scale, pos.z, scale, (i * 0.7) % Math.PI));
    }
    return {
      trunks,
      canopies,
      trunkGeometry: new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6),
      canopyGeometry: new THREE.ConeGeometry(1.15, 2.6, 7),
      trunkMaterial: new THREE.MeshStandardMaterial({ color: "#5b3d25", roughness: 1 }),
      canopyMaterial: new THREE.MeshStandardMaterial({ color: "#21663c", roughness: 0.9 }),
    };
  }, []);
  return (
    <>
      <Instances matrices={data.trunks} geometry={data.trunkGeometry} material={data.trunkMaterial} castShadow />
      <Instances matrices={data.canopies} geometry={data.canopyGeometry} material={data.canopyMaterial} castShadow />
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

const RaceCar = forwardRef(function RaceCar({ carState, color, headlights }, ref) {
  const paint = color || "#d81f33";
  // dark stripe on light paint, light stripe otherwise
  const stripe = ["#e8ecef", "#f5b818"].includes(paint) ? "#14181d" : "#f4f7fa";
  const bodyRef = useRef(null);
  const frontLeftSteer = useRef(null);
  const frontRightSteer = useRef(null);
  const spinRefs = useRef([]);
  const tailMatRef = useRef(null);
  const flameLeft = useRef(null);
  const flameRight = useRef(null);
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
      bodyRef.current.rotation.z = THREE.MathUtils.clamp(-car.sideSpeed * 0.02 + car.steer * 0.03 * speedT, -0.12, 0.12);
      bodyRef.current.rotation.x = THREE.MathUtils.clamp(car.brake * 0.035 * speedT - car.throttle * 0.018, -0.05, 0.06);
    }
    if (tailMatRef.current) {
      const braking = car.brake > 0.2 || car.reversing;
      tailMatRef.current.emissiveIntensity = THREE.MathUtils.lerp(tailMatRef.current.emissiveIntensity, braking ? 3.4 : 0.85, 1 - Math.exp(-dt * 14));
    }
    const boostK = car.boostTimer > 0 ? Math.min(1, car.boostTimer / 0.9) : 0;
    const flicker = boostK > 0 ? 0.75 + Math.random() * 0.45 : 0;
    for (const flame of [flameLeft.current, flameRight.current]) {
      if (flame) flame.scale.set(boostK * flicker, boostK * flicker, boostK * (1 + Math.random() * 0.6));
    }
    if (boostLight.current) boostLight.current.intensity = boostK * 5;
  });

  return (
    <group ref={ref}>
      <group ref={bodyRef}>
        {/* floor + lower body */}
        <mesh castShadow position={[0, 0.32, 0]}>
          <boxGeometry args={[1.86, 0.18, 4.15]} />
          <meshStandardMaterial color="#15181c" roughness={0.6} />
        </mesh>
        <mesh castShadow position={[0, 0.58, -0.15]}>
          <boxGeometry args={[1.94, 0.42, 3.4]} />
          <meshStandardMaterial color={paint} roughness={0.28} metalness={0.4} />
        </mesh>
        {/* sloped nose */}
        <mesh castShadow position={[0, 0.55, 1.72]} rotation={[0.1, 0, 0]}>
          <boxGeometry args={[1.84, 0.34, 1.3]} />
          <meshStandardMaterial color={paint} roughness={0.28} metalness={0.4} />
        </mesh>
        {/* hood intake */}
        <mesh position={[0, 0.78, 1.05]}>
          <boxGeometry args={[0.84, 0.07, 0.55]} />
          <meshStandardMaterial color="#15181c" roughness={0.5} />
        </mesh>
        {/* windshield + cabin + roof */}
        <mesh castShadow position={[0, 0.97, 0.62]} rotation={[-0.55, 0, 0]}>
          <boxGeometry args={[1.5, 0.06, 0.95]} />
          <meshStandardMaterial color="#0c1722" roughness={0.12} metalness={0.5} />
        </mesh>
        <mesh castShadow position={[0, 0.99, -0.35]}>
          <boxGeometry args={[1.52, 0.5, 1.45]} />
          <meshStandardMaterial color="#10151c" roughness={0.16} metalness={0.4} />
        </mesh>
        <mesh castShadow position={[0, 1.26, -0.35]}>
          <boxGeometry args={[1.34, 0.07, 1.25]} />
          <meshStandardMaterial color={paint} roughness={0.3} metalness={0.4} />
        </mesh>
        {/* rear deck + fastback slope */}
        <mesh castShadow position={[0, 0.68, -1.75]}>
          <boxGeometry args={[1.9, 0.34, 0.85]} />
          <meshStandardMaterial color={paint} roughness={0.28} metalness={0.4} />
        </mesh>
        <mesh castShadow position={[0, 1.05, -1.18]} rotation={[-0.42, 0, 0]}>
          <boxGeometry args={[1.46, 0.07, 0.85]} />
          <meshStandardMaterial color="#0c1722" roughness={0.14} metalness={0.5} />
        </mesh>
        {/* racing stripes over nose, roof, and deck */}
        {[-0.22, 0.22].map((x) => (
          <mesh key={`stripe-nose-${x}`} position={[x, 0.745, 1.62]} rotation={[0.1, 0, 0]}>
            <boxGeometry args={[0.17, 0.02, 1.34]} />
            <meshStandardMaterial color={stripe} roughness={0.4} />
          </mesh>
        ))}
        {[-0.22, 0.22].map((x) => (
          <mesh key={`stripe-roof-${x}`} position={[x, 1.305, -0.35]}>
            <boxGeometry args={[0.17, 0.02, 1.25]} />
            <meshStandardMaterial color={stripe} roughness={0.4} />
          </mesh>
        ))}
        {[-0.22, 0.22].map((x) => (
          <mesh key={`stripe-deck-${x}`} position={[x, 0.86, -1.78]}>
            <boxGeometry args={[0.17, 0.02, 0.8]} />
            <meshStandardMaterial color={stripe} roughness={0.4} />
          </mesh>
        ))}
        {/* side mirrors */}
        {[-1.02, 1.02].map((x) => (
          <group key={`mirror-${x}`} position={[x, 1.0, 0.42]}>
            <mesh castShadow>
              <boxGeometry args={[0.18, 0.1, 0.22]} />
              <meshStandardMaterial color={paint} roughness={0.3} metalness={0.4} />
            </mesh>
            <mesh position={[Math.sign(x) * -0.04, 0, -0.06]}>
              <boxGeometry args={[0.1, 0.07, 0.02]} />
              <meshStandardMaterial color="#9fc2d8" roughness={0.1} metalness={0.7} />
            </mesh>
          </group>
        ))}
        {/* front grille */}
        <mesh position={[0, 0.46, 2.3]}>
          <boxGeometry args={[0.8, 0.18, 0.05]} />
          <meshStandardMaterial color="#0a0d11" roughness={0.6} />
        </mesh>
        {/* wheel arch trims */}
        {[-0.9, 0.9].map((x) =>
          [1.32, -1.32].map((z) => (
            <mesh key={`arch-${x}-${z}`} castShadow position={[x, 0.62, z]}>
              <boxGeometry args={[0.14, 0.16, 1.0]} />
              <meshStandardMaterial color="#15181c" roughness={0.5} />
            </mesh>
          )),
        )}
        {/* wing */}
        {[-0.58, 0.58].map((x) => (
          <mesh key={x} castShadow position={[x, 1.0, -1.98]}>
            <boxGeometry args={[0.1, 0.34, 0.16]} />
            <meshStandardMaterial color="#15181c" roughness={0.4} />
          </mesh>
        ))}
        <mesh castShadow position={[0, 1.18, -2.02]}>
          <boxGeometry args={[1.92, 0.07, 0.46]} />
          <meshStandardMaterial color="#15181c" roughness={0.35} metalness={0.3} />
        </mesh>
        {/* wing endplates */}
        {[-0.97, 0.97].map((x) => (
          <mesh key={`endplate-${x}`} castShadow position={[x, 1.13, -2.02]}>
            <boxGeometry args={[0.05, 0.3, 0.52]} />
            <meshStandardMaterial color={paint} roughness={0.3} metalness={0.4} />
          </mesh>
        ))}
        {/* shark fin */}
        <mesh castShadow position={[0, 0.95, -1.45]}>
          <boxGeometry args={[0.04, 0.22, 0.65]} />
          <meshStandardMaterial color={paint} roughness={0.3} metalness={0.4} />
        </mesh>
        {/* front canards */}
        {[-0.86, 0.86].map((x) => (
          <mesh key={`canard-${x}`} castShadow position={[x, 0.42, 2.05]} rotation={[0.18, 0, x > 0 ? -0.22 : 0.22]}>
            <boxGeometry args={[0.28, 0.03, 0.34]} />
            <meshStandardMaterial color="#15181c" roughness={0.4} />
          </mesh>
        ))}
        {/* splitter */}
        <mesh position={[0, 0.28, 2.18]}>
          <boxGeometry args={[1.9, 0.12, 0.34]} />
          <meshStandardMaterial color="#15181c" roughness={0.5} />
        </mesh>
        {/* headlights */}
        {[-0.62, 0.62].map((x) => (
          <mesh key={x} position={[x, 0.62, 2.3]}>
            <boxGeometry args={[0.42, 0.13, 0.06]} />
            <meshStandardMaterial color="#fff6d8" emissive="#ffefb0" emissiveIntensity={headlights ? 2.8 : 1.4} />
          </mesh>
        ))}
        {/* tail light strip */}
        <mesh position={[0, 0.72, -2.2]}>
          <boxGeometry args={[1.62, 0.13, 0.06]} />
          <meshStandardMaterial ref={tailMatRef} color="#3d090d" emissive="#ff1626" emissiveIntensity={0.85} />
        </mesh>
        {/* exhausts */}
        {[-0.36, 0.36].map((x) => (
          <mesh key={x} position={[x, 0.4, -2.16]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.09, 0.09, 0.22, 10]} />
            <meshStandardMaterial color="#43494e" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}
        {/* number roundel */}
        <mesh position={[0, 0.81, -0.35]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <circleGeometry args={[0.4, 20]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
      {/* boost flames live outside the rolling body so they stay behind the bumper */}
      {[
        [-0.36, flameLeft],
        [0.36, flameRight],
      ].map(([x, flameRef]) => (
        <group key={x} position={[x, 0.4, -2.45]}>
          <mesh ref={flameRef} rotation={[-Math.PI / 2, 0, 0]} scale={[0, 0, 0]}>
            <coneGeometry args={[0.17, 1.1, 8]} />
            <meshBasicMaterial color="#ff9b2e" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        </group>
      ))}
      <pointLight ref={boostLight} position={[0, 0.7, -2.7]} color="#ff8c3a" intensity={0} distance={9} />
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
      {/* wheels */}
      <Wheel x={-0.88} z={1.32} steerRef={frontLeftSteer} spinRefs={spinRefs} index={0} />
      <Wheel x={0.88} z={1.32} steerRef={frontRightSteer} spinRefs={spinRefs} index={1} />
      <Wheel x={-0.88} z={-1.32} spinRefs={spinRefs} index={2} />
      <Wheel x={0.88} z={-1.32} spinRefs={spinRefs} index={3} />
    </group>
  );
});

function Wheel({ x, z, steerRef, spinRefs, index }) {
  return (
    <group position={[x, 0.34, z]} ref={steerRef}>
      <group
        ref={(node) => {
          spinRefs.current[index] = node;
        }}
      >
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.34, 0.34, 0.3, 16]} />
          <meshStandardMaterial color="#0b0d10" roughness={0.7} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.19, 0.19, 0.32, 12]} />
          <meshStandardMaterial color="#aab3bc" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.34, 0.1, 0.3]} />
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
