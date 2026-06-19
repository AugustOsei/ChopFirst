import * as THREE from "three";

// All speeds in m/s, all angles in radians.
// Yaw convention: forward = (sin(yaw), 0, cos(yaw)); +yaw rotates the nose toward +X.
//
// Multi-track: every track is built by buildTrack(def) from a closed control-point
// spline plus a handful of scalars. The module keeps one ACTIVE track and exposes
// the legacy named exports (getTrackFrame, TRACK, PICKUPS, ...) as live delegators
// to it, so the renderer, vehicle, and validator keep working unchanged. Call
// setActiveTrack(id) before a race builds its scene/vehicle. The server validator
// looks tracks up by id (getTrackData) instead, so it is concurrency-safe.

// --- Akina Ridge: the original hand-laid mountain sprint (closed loop, ~1300 m).
// Heading +X off the line; "right" curves toward +Z.
const AKINA_CONTROL_POINTS = [
  // start/finish straight
  [-60, 0.2, 0],
  [20, 0.2, 0],
  [95, 0.3, 2],
  // easy right
  [155, 0.6, 16],
  [196, 1.0, 52],
  // medium left
  [216, 1.4, 110],
  [256, 1.8, 152],
  // approach straight
  [320, 2.4, 186],
  // hairpin right (crest of the climb)
  [372, 2.9, 202],
  [398, 3.2, 232],
  [386, 3.4, 266],
  [340, 3.3, 278],
  // S-chicane (descent begins)
  [276, 2.8, 258],
  [230, 2.4, 274],
  [186, 2.0, 258],
  // recovery straight
  [95, 1.4, 252],
  [5, 0.9, 250],
  // final sweeper back to the start straight
  [-72, 0.7, 236],
  [-112, 0.5, 178],
  [-116, 0.3, 108],
  [-92, 0.2, 42],
];

// --- Accra City Run: traced from real OpenStreetMap road geometry for the loop
// Osu (Danquah Circle) -> 37 Military Hospital -> Cantonments -> Osu, cleaned to a
// simple closed loop and scaled to ~5 km. Flat (y ~ 0.2) city streets.
const ACCRA_CONTROL_POINTS = [
  [-218.9, 0.2, -754.2],
  [-233.6, 0.2, -751.4],
  [-496.6, 0.2, -598.6],
  [-258.2, 0.2, -167.6],
  [-226.2, 0.2, 20.9],
  [-231.6, 0.2, 84.2],
  [-290.5, 0.2, 209.3],
  [-326.2, 0.2, 458.8],
  [-365.0, 0.2, 512.8],
  [-320.4, 0.2, 573.9],
  [-335.9, 0.2, 593.4],
  [-304.5, 0.2, 647.7],
  [-364.4, 0.2, 745.9],
  [-344.0, 0.2, 760.9],
  [-306.2, 0.2, 676.5],
  [-268.8, 0.2, 645.1],
  [105.8, 0.2, 559.2],
  [80.1, 0.2, 260.8],
  [98.1, 0.2, 124.7],
  [125.3, 0.2, 99.7],
  [205.9, 0.2, 80.1],
  [200.6, 0.2, -3.0],
  [310.6, 0.2, -4.2],
  [400.9, 0.2, 20.8],
  [449.2, 0.2, -72.4],
  [410.2, 0.2, -92.5],
  [320.5, 0.2, -98.7],
  [319.1, 0.2, -261.0],
  [465.4, 0.2, -273.8],
  [449.1, 0.2, -319.1],
  [323.9, 0.2, -317.5],
  [341.1, 0.2, -406.0],
  [240.4, 0.2, -411.3],
  [184.9, 0.2, -387.5],
  [175.1, 0.2, -354.3],
  [145.0, 0.2, -335.2],
  [-103.9, 0.2, -279.5],
  [-154.4, 0.2, -459.6],
  [-201.8, 0.2, -727.1],
];

// Coin layouts are expressed as fractions of the lap so they ride along with the
// spline regardless of length. Lines sit on straights, arcs sweep across corners.
function coinLine(pctFrom, pctTo, count, lateral) {
  return Array.from({ length: count }, (_, i) => ({
    pct: pctFrom + ((pctTo - pctFrom) * i) / Math.max(1, count - 1),
    lateral,
  }));
}

function coinArc(pctFrom, pctTo, count, lateralFrom, lateralTo) {
  return Array.from({ length: count }, (_, i) => {
    const t = i / Math.max(1, count - 1);
    return { pct: pctFrom + (pctTo - pctFrom) * t, lateral: lateralFrom + (lateralTo - lateralFrom) * t };
  });
}

const AKINA_COINS = [
  ...coinLine(0.04, 0.085, 5, 0), // launch straight, dead center
  ...coinArc(0.12, 0.18, 4, 1.6, -2.0), // easy right, sweep to the inside
  ...coinLine(0.21, 0.235, 3, 2.7), // risky outside cluster
  ...coinArc(0.28, 0.34, 4, -1.8, 1.8), // medium left
  ...coinLine(0.4, 0.45, 4, -0.7), // approach straight
  ...coinArc(0.5, 0.56, 4, 2.2, -2.2), // summit hairpin
  ...coinLine(0.6, 0.62, 3, -2.7), // risky outside cluster
  ...coinArc(0.66, 0.74, 5, -2.0, 2.0), // S-chicane sweep
  ...coinLine(0.8, 0.86, 5, 0.6), // recovery straight
  ...coinArc(0.9, 0.95, 4, -1.4, 1.4), // final sweeper
];

// Generic coin spread for routes without hand-authored sections: evenly spaced
// runs around the lap, alternating which side of the lane they favour.
function autoCoins() {
  // Dense, generous coin spread (≈80/lap across 3 lanes) so boost recharges fast on
  // the long city loop — at COINS_PER_BOOST=15 that's roughly a charge every ~190m.
  const out = [];
  const lanes = [-1.6, 0, 1.6];
  for (let i = 0; i < 16; i += 1) {
    const from = i / 16 + 0.008;
    out.push(...coinLine(from, from + 0.04, 5, lanes[i % 3]));
  }
  return out;
}

const TRACK_DEFS = [
  {
    id: "akina-ridge",
    name: "Akina Ridge Sprint",
    blurb: "A fast alpine touge — flowing esses, a tight summit hairpin, and a drift-built downhill S.",
    difficulty: "Intermediate",
    laps: 3,
    // Medal targets calibrated from headless bot runs at three skill levels
    // (scripts/record-rivals.mjs personalities on this layout: 184.7/134.5/129.4s)
    medals: { bronze: 185000, silver: 135000, gold: 129500 },
    width: 10,
    railOffset: 5.8,
    startDistance: 60,
    center: { x: 140, z: 140 }, // rough centroid, used for mountains/ground placement
    tension: 0.18,
    environment: "mountain",
    controlPoints: AKINA_CONTROL_POINTS,
    coins: AKINA_COINS,
    // Full-boost stars: rare glowing pickups that refill boost to max. Placed on
    // straights so grabbing one is a line choice, not a scramble mid-corner.
    boostStars: [
      { pct: 0.065, lateral: 0 }, // launch straight
      { pct: 0.43, lateral: 0 }, // approach straight before the summit
      { pct: 0.83, lateral: 0.6 }, // recovery straight after the S-chicane
    ],
  },
  {
    id: "accra-city",
    name: "Accra City Run",
    blurb: "A street circuit through Accra — landmarks, flyovers and tight city corners past Danquah Circle.",
    difficulty: "Technical",
    laps: 2,
    // Placeholder medals — recalibrated from a headless bot lap once it drives.
    medals: { bronze: 320000, silver: 250000, gold: 230000 },
    width: 10,
    railOffset: 5.8,
    startDistance: 40,
    center: { x: 0, z: 0 },
    tension: 0.18,
    environment: "city",
    controlPoints: ACCRA_CONTROL_POINTS,
    coins: autoCoins(),
    // Double the stars of the mountain — the city loop is the longest, so boost
    // top-ups come more often. Spread evenly, alternating lanes.
    boostStars: [
      { pct: 0.09, lateral: 0 },
      { pct: 0.24, lateral: -1.4 },
      { pct: 0.4, lateral: 1.4 },
      { pct: 0.56, lateral: 0 },
      { pct: 0.72, lateral: -1.4 },
      { pct: 0.88, lateral: 1.4 },
    ],
  },
];

function buildTrack(def) {
  const curve = new THREE.CatmullRomCurve3(
    def.controlPoints.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    true,
    "catmullrom",
    def.tension ?? 0.18,
  );
  const lengths = curve.getLengths(1200);
  const totalLength = lengths[lengths.length - 1];

  function wrapDistance(distance) {
    return ((distance % totalLength) + totalLength) % totalLength;
  }

  function getTrackFrame(distance) {
    const u = wrapDistance(distance) / totalLength;
    const position = curve.getPointAt(u);
    const tangent = curve.getTangentAt(u).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const ahead = curve.getTangentAt((u + 0.006) % 1).normalize();
    const signedCurve = tangent.x * ahead.z - tangent.z * ahead.x;
    return { position, tangent, normal, curvature: signedCurve * 9 };
  }

  function pointAt(distance, lateral = 0) {
    const frame = getTrackFrame(distance);
    return frame.position.clone().addScaledVector(frame.normal, lateral);
  }

  function projectPointToTrack(point, hintDistance = 0, searchRadius = 90, sampleCount = 48) {
    const flatPoint = new THREE.Vector2(point.x, point.z);
    let bestDistance = hintDistance;
    let bestDistanceSq = Infinity;

    for (let i = 0; i <= sampleCount; i += 1) {
      const offset = -searchRadius + (i / sampleCount) * searchRadius * 2;
      const distance = wrapDistance(hintDistance + offset);
      const frame = getTrackFrame(distance);
      const flatTrack = new THREE.Vector2(frame.position.x, frame.position.z);
      const distanceSq = flatPoint.distanceToSquared(flatTrack);
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestDistance = distance;
      }
    }

    for (let i = 0; i <= 16; i += 1) {
      const offset = -8 + i;
      const distance = wrapDistance(bestDistance + offset);
      const frame = getTrackFrame(distance);
      const flatTrack = new THREE.Vector2(frame.position.x, frame.position.z);
      const distanceSq = flatPoint.distanceToSquared(flatTrack);
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestDistance = distance;
      }
    }

    const frame = getTrackFrame(bestDistance);
    const offset = point.clone().sub(frame.position);
    const lateral = offset.dot(frame.normal);
    return { distance: bestDistance, frame, lateral, center: frame.position.clone(), projectionDistance: Math.sqrt(bestDistanceSq) };
  }

  const minimap = (() => {
    const sampleCount = 170;
    const raw = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i <= sampleCount; i += 1) {
      const frame = getTrackFrame((i / sampleCount) * totalLength);
      raw.push({ x: frame.position.x, z: frame.position.z });
      minX = Math.min(minX, frame.position.x);
      maxX = Math.max(maxX, frame.position.x);
      minZ = Math.min(minZ, frame.position.z);
      maxZ = Math.max(maxZ, frame.position.z);
    }
    const pad = 8;
    const scale = (100 - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const toMap = (x, z) => ({
      x: Number((50 + (x - cx) * scale).toFixed(1)),
      y: Number((50 - (z - cz) * scale).toFixed(1)),
    });
    const points = raw.map((p) => {
      const m = toMap(p.x, p.z);
      return `${m.x},${m.y}`;
    }).join(" ");
    const startFrame = getTrackFrame(def.startDistance);
    return { points, toMap, start: toMap(startFrame.position.x, startFrame.position.z) };
  })();

  function isPointClearOfRoad(point, minDistance = def.railOffset + 4, sampleCount = 220) {
    const flatPoint = new THREE.Vector2(point.x, point.z);
    let closest = Infinity;
    for (let i = 0; i < sampleCount; i += 1) {
      const frame = getTrackFrame((i / sampleCount) * totalLength);
      const flatTrack = new THREE.Vector2(frame.position.x, frame.position.z);
      closest = Math.min(closest, flatPoint.distanceTo(flatTrack));
      if (closest < minDistance) return false;
    }
    return true;
  }

  function createRoadGeometry(sampleCount = 420) {
    const positions = [];
    const uvs = [];
    const indices = [];
    const half = def.width / 2;
    for (let i = 0; i <= sampleCount; i += 1) {
      const distance = (i / sampleCount) * totalLength;
      const frame = getTrackFrame(distance);
      const left = frame.position.clone().addScaledVector(frame.normal, -half);
      const right = frame.position.clone().addScaledVector(frame.normal, half);
      left.y += 0.12;
      right.y += 0.12;
      positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
      uvs.push(0, i / 8, 1, i / 8);
      if (i < sampleCount) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function createStripGeometry(lateral, width = 0.18, sampleCount = 360) {
    const positions = [];
    const indices = [];
    for (let i = 0; i <= sampleCount; i += 1) {
      const distance = (i / sampleCount) * totalLength;
      const frame = getTrackFrame(distance);
      const a = frame.position.clone().addScaledVector(frame.normal, lateral - width / 2);
      const b = frame.position.clone().addScaledVector(frame.normal, lateral + width / 2);
      a.y += 0.16;
      b.y += 0.16;
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      if (i < sampleCount) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function createDashedStripGeometry(lateral, width = 0.18, dashLength = 3, gapLength = 3, phase = 0, lift = 0.16) {
    const positions = [];
    const indices = [];
    const period = dashLength + gapLength;
    const step = 0.9;
    for (let start = phase; start < totalLength - 0.5; start += period) {
      const end = Math.min(start + dashLength, totalLength);
      const segments = Math.max(1, Math.ceil((end - start) / step));
      const base = positions.length / 3;
      for (let i = 0; i <= segments; i += 1) {
        const distance = start + ((end - start) * i) / segments;
        const frame = getTrackFrame(distance);
        const a = frame.position.clone().addScaledVector(frame.normal, lateral - width / 2);
        const b = frame.position.clone().addScaledVector(frame.normal, lateral + width / 2);
        a.y += lift;
        b.y += lift;
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        if (i < segments) {
          const v = base + i * 2;
          indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function createRailGeometry(side, bottom = 0.55, top = 0.95, sampleCount = 560) {
    const positions = [];
    const indices = [];
    const lateral = side * def.railOffset;
    for (let i = 0; i <= sampleCount; i += 1) {
      const distance = (i / sampleCount) * totalLength;
      const frame = getTrackFrame(distance);
      const base = frame.position.clone().addScaledVector(frame.normal, lateral);
      positions.push(base.x, base.y + bottom, base.z, base.x, base.y + top, base.z);
      if (i < sampleCount) {
        const v = i * 2;
        indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function createShoulderGeometry(side, sampleCount = 420) {
    const positions = [];
    const uvs = [];
    const indices = [];
    const inner = side * (def.width / 2 + 0.45);
    const outer = side * 9;
    for (let i = 0; i <= sampleCount; i += 1) {
      const distance = (i / sampleCount) * totalLength;
      const frame = getTrackFrame(distance);
      const a = frame.position.clone().addScaledVector(frame.normal, inner);
      const b = frame.position.clone().addScaledVector(frame.normal, outer);
      a.y -= 0.18;
      b.y -= 0.95;
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      uvs.push(0, i / 12, 1, i / 12);
      if (i < sampleCount) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  const pickups = def.coins.map((pickup) => ({ distance: pickup.pct * totalLength, lateral: pickup.lateral }));
  const boostStars = (def.boostStars || []).map((star) => ({ distance: star.pct * totalLength, lateral: star.lateral }));

  return {
    def,
    curve,
    totalLength,
    getTrackLength: () => totalLength,
    wrapDistance,
    getTrackFrame,
    pointAt,
    projectPointToTrack,
    isPointClearOfRoad,
    createRoadGeometry,
    createStripGeometry,
    createDashedStripGeometry,
    createRailGeometry,
    createShoulderGeometry,
    minimap,
    pickups,
    boostStars,
  };
}

const TRACKS = Object.fromEntries(TRACK_DEFS.map((def) => [def.id, buildTrack(def)]));
const DEFAULT_ID = TRACK_DEFS[0].id;

let active = TRACKS[DEFAULT_ID];

export function setActiveTrack(id) {
  if (!TRACKS[id] || active === TRACKS[id]) return;
  active = TRACKS[id];
  TRACK = active.def;
  MINIMAP = active.minimap;
  PICKUPS = active.pickups;
  BOOST_PICKUPS = active.boostStars;
}

export function getActiveTrackId() {
  return active.def.id;
}

// Static numbers for one track, looked up by id — used by the server validator,
// which must stay independent of whatever track the client last activated.
export function getTrackData(id) {
  const t = TRACKS[id];
  if (!t) return null;
  return { ...t.def, totalLength: t.totalLength, pickupCount: t.pickups.length, boostStarCount: t.boostStars.length };
}

export function listTracks() {
  return Object.values(TRACKS).map((t) => ({ ...t.def, totalLength: t.totalLength, pickupCount: t.pickups.length }));
}

// --- live-binding legacy exports: always reflect the active track -----------
export let TRACK = active.def;
export let MINIMAP = active.minimap;
export let PICKUPS = active.pickups;
export let BOOST_PICKUPS = active.boostStars;

export function getTrackLength() {
  return active.totalLength;
}
export function wrapDistance(distance) {
  return active.wrapDistance(distance);
}
export function getTrackFrame(distance) {
  return active.getTrackFrame(distance);
}
export function pointAt(distance, lateral) {
  return active.pointAt(distance, lateral);
}
export function projectPointToTrack(point, hintDistance, searchRadius, sampleCount) {
  return active.projectPointToTrack(point, hintDistance, searchRadius, sampleCount);
}
export function isPointClearOfRoad(point, minDistance, sampleCount) {
  return active.isPointClearOfRoad(point, minDistance, sampleCount);
}
export function createRoadGeometry(sampleCount) {
  return active.createRoadGeometry(sampleCount);
}
export function createStripGeometry(lateral, width, sampleCount) {
  return active.createStripGeometry(lateral, width, sampleCount);
}
export function createDashedStripGeometry(lateral, width, dashLength, gapLength, phase, lift) {
  return active.createDashedStripGeometry(lateral, width, dashLength, gapLength, phase, lift);
}
export function createRailGeometry(side, bottom, top, sampleCount) {
  return active.createRailGeometry(side, bottom, top, sampleCount);
}
export function createShoulderGeometry(side, sampleCount) {
  return active.createShoulderGeometry(side, sampleCount);
}
