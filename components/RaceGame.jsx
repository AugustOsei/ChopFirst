"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
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
import { createVehicleState, getVehicleTransform, updateVehicle } from "../game/vehicle";
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
  banner: null,
  roadMessage: null,
  wrongWay: false,
  mapPos: null,
  debug: null,
};

export default function RaceGame({ driver, challenge, onFinish, onQuit }) {
  const inputRef = useRef({ left: false, right: false, gas: false, brake: false, handbrake: false, boost: false });
  const [race, setRace] = useState(INITIAL_RACE);
  const [showDebug, setShowDebug] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [muted, setMuted] = useState(() => typeof window !== "undefined" && localStorage.getItem("chopfirst.muted") === "1");
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const audio = useMemo(() => createGameAudio(), []);

  useKeyboard(inputRef, setShowDebug, setPaused);

  useEffect(() => {
    audio.setMuted(muted);
    if (typeof window !== "undefined") localStorage.setItem("chopfirst.muted", muted ? "1" : "0");
  }, [audio, muted]);

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
        <color attach="background" args={["#a8ddff"]} />
        <fog attach="fog" args={["#c4e3f0", 90, 580]} />
        <hemisphereLight args={["#cfe9ff", "#3d5232", 0.55]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[40, 70, 25]} intensity={1.6} color="#fff4e0" />
        <Sky sunPosition={[100, 40, 40]} turbidity={8} rayleigh={0.8} />
        <RaceScene inputRef={inputRef} challenge={challenge} driver={driver} onFinish={onFinish} setRace={setRace} showDebug={showDebug} pausedRef={pausedRef} audio={audio} />
      </Canvas>
      <RaceHud race={race} driver={driver} muted={muted} onToggleMute={() => setMuted((value) => !value)} onPause={() => setPaused(true)} />
      <TouchControls controlsRef={inputRef} />
      {paused && !showGuide && (
        <PauseOverlay onResume={() => setPaused(false)} onGuide={() => setShowGuide(true)} onQuit={onQuit} />
      )}
      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
    </>
  );
}

function PauseOverlay({ onResume, onGuide, onQuit }) {
  return (
    <div className="pause-overlay">
      <div className="pause-card">
        <p className="eyebrow">Paused</p>
        <h2 className="pause-title">CHOP FIRST</h2>
        <ul className="pause-hints">
          <li><kbd>W</kbd>/<kbd>↑</kbd> gas · <kbd>S</kbd>/<kbd>↓</kbd> brake &amp; reverse</li>
          <li><kbd>Shift</kbd> drift · <kbd>Space</kbd> boost · <kbd>Esc</kbd> pause</li>
        </ul>
        <button className="primary" onClick={onResume}>Resume</button>
        <div className="pause-row">
          <button className="secondary" onClick={onGuide}>How to play</button>
          <button className="secondary" onClick={onQuit}>Quit run</button>
        </div>
      </div>
    </div>
  );
}

function RaceScene({ inputRef, challenge, driver, onFinish, setRace, showDebug, pausedRef, audio }) {
  const car = useMemo(() => createVehicleState(), []);
  const carRef = useRef(null);
  const roadMessages = useMemo(
    () => (challenge?.messages || []).filter((note) => note.message).slice(-8),
    [challenge],
  );
  const flowRef = useRef({ lastLap: 0, banner: null, msgIndex: 0, msg: null, wrongWayTime: 0 });
  const smokeRef = useRef(null);
  const sparksRef = useRef(null);
  const skidRef = useRef(null);
  const fxClock = useRef({ smoke: 0, skid: 0, spark: 0 });
  const cameraRig = useRef({ position: new THREE.Vector3(), lookAt: new THREE.Vector3(), initialized: false });
  const finishedRef = useRef(false);
  const snapshotClock = useRef(0);
  const countdownRef = useRef(3);
  const { camera } = useThree();
  const trackLength = getTrackLength();

  // Debug hook for manual/scripted driving QA.
  useEffect(() => {
    window.__carState = car;
    return () => {
      if (window.__carState === car) delete window.__carState;
    };
  }, [car]);

  useFrame((_, delta) => {
    if (finishedRef.current || pausedRef.current) return;
    const dt = Math.min(0.033, delta);
    countdownRef.current = Math.max(-1, countdownRef.current - dt);
    if (countdownRef.current <= 0) updateVehicle(car, inputRef.current, dt);
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
        ghost: car.ghost.slice(0, 500),
      });
    }
  });

  return (
    <group>
      <TrackWorld />
      <Pickups collected={car.coins} />
      <Ghosts challenge={challenge} />
      <RaceCar ref={carRef} carState={car} color={driver?.color} />
      <Particles ref={smokeRef} mode="smoke" count={70} />
      <Particles ref={sparksRef} mode="spark" count={60} />
      <Particles ref={skidRef} mode="skid" count={90} />
    </group>
  );
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
      <StartLine />
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

function StartLine() {
  const frame = getTrackFrame(TRACK.startDistance);
  const position = frame.position.clone();
  position.y += 0.2;
  const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <mesh>
        <boxGeometry args={[TRACK.width * 0.92, 0.05, 1.2]} />
        <meshStandardMaterial color="#f7f7ef" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.08, -1.2]}>
        <boxGeometry args={[TRACK.width * 0.92, 0.06, 0.28]} />
        <meshStandardMaterial color="#d8202f" roughness={0.5} />
      </mesh>
      <mesh position={[0, 4.4, -0.4]}>
        <boxGeometry args={[11.8, 0.7, 0.3]} />
        <meshStandardMaterial color="#14181d" roughness={0.35} />
      </mesh>
      {[-5.7, 5.7].map((x) => (
        <mesh key={x} position={[x, 2.2, -0.4]}>
          <boxGeometry args={[0.26, 4.4, 0.26]} />
          <meshStandardMaterial color="#14181d" roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, 4.4, -0.24]}>
        <boxGeometry args={[4.6, 0.46, 0.05]} />
        <meshBasicMaterial color="#ffd45e" />
      </mesh>
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

const RaceCar = forwardRef(function RaceCar({ carState, color }, ref) {
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
        {/* splitter */}
        <mesh position={[0, 0.28, 2.18]}>
          <boxGeometry args={[1.9, 0.12, 0.34]} />
          <meshStandardMaterial color="#15181c" roughness={0.5} />
        </mesh>
        {/* headlights */}
        {[-0.62, 0.62].map((x) => (
          <mesh key={x} position={[x, 0.62, 2.3]}>
            <boxGeometry args={[0.42, 0.13, 0.06]} />
            <meshStandardMaterial color="#fff6d8" emissive="#ffefb0" emissiveIntensity={1.4} />
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

function Pickups({ collected }) {
  return PICKUPS.map((pickup, index) => {
    if (collected.has(index)) return null;
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

function Ghosts({ challenge }) {
  const runs = challenge?.runs?.slice(0, 2) || [];
  return runs.map((run, index) => <GhostCar key={run.id || index} run={run} color={index ? "#c178ff" : "#61d4ff"} />);
}

function GhostCar({ run, color }) {
  const ref = useRef(null);
  useFrame(({ clock }) => {
    const ghost = run.ghost || [];
    if (!ref.current || !ghost.length) return;
    const t = (clock.elapsedTime * 1000) % Math.max(1000, run.timeMs || 1000);
    const sample = ghost.reduce((best, item) => (Math.abs((item.t || 0) - t) < Math.abs((best?.t || 0) - t) ? item : best), ghost[0]);
    const distance = sample.d ?? sample.x ?? 0;
    const transform = getGhostTransform(distance, sample.l ?? sample.y ?? 0, sample.h ?? sample.a ?? 0);
    ref.current.position.copy(transform.position);
    ref.current.rotation.set(0, transform.yaw, 0);
  });
  return (
    <group ref={ref}>
      <GhostShell color={color} />
    </group>
  );
}

function GhostShell({ color }) {
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.32, roughness: 0.35, metalness: 0.3, depthWrite: false }),
    [color],
  );
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

function TouchControls({ controlsRef }) {
  const bind = (key) => ({
    onPointerDown: (event) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      controlsRef.current[key] = true;
    },
    onPointerUp: () => {
      controlsRef.current[key] = false;
    },
    onPointerCancel: () => {
      controlsRef.current[key] = false;
    },
    onPointerLeave: () => {
      controlsRef.current[key] = false;
    },
  });

  return (
    <div className="touch-controls race-controls">
      <div className="steer-pad">
        <button aria-label="Steer left" {...bind("left")}>‹</button>
        <button aria-label="Steer right" {...bind("right")}>›</button>
      </div>
      <div className="drive-pad">
        <button aria-label="Brake or reverse" className="brake" {...bind("brake")}>REV</button>
        <button aria-label="Handbrake" className="handbrake" {...bind("handbrake")}>DRIFT</button>
        <button aria-label="Boost" className="boost" {...bind("boost")}>BOOST</button>
        <button aria-label="Accelerate" className="gas" {...bind("gas")}>GAS</button>
      </div>
    </div>
  );
}

function useKeyboard(inputRef, setShowDebug, setPaused) {
  useEffect(() => {
    inputRef.current.toggleDebug = () => setShowDebug((value) => !value);
    inputRef.current.togglePause = () => setPaused((value) => !value);
    const down = (event) => setKey(inputRef.current, event, true);
    const up = (event) => setKey(inputRef.current, event, false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      delete inputRef.current.toggleDebug;
      delete inputRef.current.togglePause;
    };
  }, [inputRef, setShowDebug, setPaused]);
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
  if (key === "arrowleft" || key === "a") input.left = value;
  if (key === "arrowright" || key === "d") input.right = value;
  if (key === "arrowup" || key === "w") input.gas = value;
  if (key === "arrowdown" || key === "s") input.brake = value;
  if (key === "shift") input.handbrake = value;
  if (event.key === " ") input.boost = value;
}
