import * as THREE from "three";

export const TRACK = {
  id: "akina-ridge",
  name: "Akina Ridge Sprint",
  laps: 3,
  width: 10,
  railOffset: 5.8,
  startDistance: 190,
};

const CONTROL_POINTS = [
  [0, 0, 0],
  [88, 0.1, 0],
  [126, 0.4, -56],
  [184, 0.7, 38],
  [252, 1, 0],
  [320, 1.5, -54],
  [300, 1.9, -112],
  [340, 2.4, -172],
  [288, 3, -234],
  [212, 3.6, -242],
  [154, 4, -178],
  [74, 4.4, -258],
  [-28, 4.1, -224],
  [-104, 3.3, -164],
  [-76, 2.6, -92],
  [-138, 1.8, -38],
  [-56, 0.8, -8],
];

const curve = new THREE.CatmullRomCurve3(
  CONTROL_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  true,
  "catmullrom",
  0.18,
);

const LENGTH_SAMPLES = 1200;
const lengths = curve.getLengths(LENGTH_SAMPLES);
const totalLength = lengths[lengths.length - 1];

export function getTrackLength() {
  return totalLength;
}

export function wrapDistance(distance) {
  return ((distance % totalLength) + totalLength) % totalLength;
}

export function getTrackFrame(distance) {
  const u = wrapDistance(distance) / totalLength;
  const position = curve.getPointAt(u);
  const tangent = curve.getTangentAt(u).normalize();
  const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
  const ahead = curve.getTangentAt((u + 0.006) % 1).normalize();
  const signedCurve = tangent.x * ahead.z - tangent.z * ahead.x;
  return { position, tangent, normal, curvature: signedCurve * 9 };
}

export function pointAt(distance, lateral = 0) {
  const frame = getTrackFrame(distance);
  return frame.position.clone().addScaledVector(frame.normal, lateral);
}

export function projectPointToTrack(point, hintDistance = 0, searchRadius = 90, sampleCount = 48) {
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

export function isPointClearOfRoad(point, minDistance = TRACK.railOffset + 4, sampleCount = 220) {
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

export function createRoadGeometry(sampleCount = 420) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const half = TRACK.width / 2;

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

export function createStripGeometry(lateral, width = 0.18, sampleCount = 360) {
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

export function createDashedStripGeometry(lateral, width = 0.18, dashLength = 3, gapLength = 3, phase = 0, lift = 0.16) {
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

// Vertical ribbon following the road at the rail offset — one mesh per side
// instead of hundreds of segment groups.
export function createRailGeometry(side, bottom = 0.55, top = 0.95, sampleCount = 560) {
  const positions = [];
  const indices = [];
  const lateral = side * TRACK.railOffset;
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

export function createShoulderGeometry(side, sampleCount = 420) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const inner = side * (TRACK.width / 2 + 0.45);
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

export const PICKUPS = [
  { pct: 0.08, lateral: -1.8 },
  { pct: 0.15, lateral: 1.7 },
  { pct: 0.23, lateral: -2.6 },
  { pct: 0.31, lateral: 2.5 },
  { pct: 0.39, lateral: 0.6 },
  { pct: 0.47, lateral: -2.8 },
  { pct: 0.55, lateral: 2.6 },
  { pct: 0.63, lateral: -1.4 },
  { pct: 0.71, lateral: 1.9 },
  { pct: 0.79, lateral: -2.7 },
  { pct: 0.87, lateral: 2.8 },
  { pct: 0.94, lateral: -0.9 },
].map((pickup) => ({ distance: pickup.pct * totalLength, lateral: pickup.lateral }));
