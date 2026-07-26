// Tree geometry.
//
// The old trees were three instanced cones stacked on a cylinder, which is why
// they read as Christmas decorations rather than forest: a conifer's silhouette
// comes from many tiers whose radius falls off non-linearly, and a broadleaf's
// from an irregular cluster of masses, not one ball.
//
// Each species is merged down to two geometries — trunk and foliage — so a whole
// forest is two instanced draw calls no matter how many tiers each tree has.
// That is the trick that buys detail for free: eight tiers costs exactly what
// three did, because the tier count lives inside the merged geometry rather than
// multiplying the instance count.
//
// Foliage bakes a vertical light-to-dark ramp into its vertex colours. Three
// multiplies vertex colour by instance colour, so one geometry gives both
// per-tier shading and a per-tree species tint.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// All species are built to a unit height of 1 with the base at y=0, so the
// scatter can size them purely by scaling the instance matrix.

function withColorRamp(geometry, low, high, y0, y1) {
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const t = Math.min(1, Math.max(0, (position.getY(i) - y0) / Math.max(0.0001, y1 - y0)));
    const v = low + (high - low) * t;
    colors[i * 3] = v;
    colors[i * 3 + 1] = v;
    colors[i * 3 + 2] = v;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function solidColor(geometry, r, g, b) {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// --- conifer ----------------------------------------------------------------

export function makeConiferFoliage(seed = 1) {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const tiers = [];
  const count = 8;
  const bottom = 0.14;
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    // radius falls off faster than linearly, which is what gives a spruce its
    // concave taper instead of a straight-sided party hat
    const radius = 0.055 + 0.30 * Math.pow(1 - t, 1.35) * (0.9 + rand() * 0.2);
    const height = 0.30 * (1 - t * 0.42);
    const y = bottom + t * (1 - bottom - height * 0.35);
    const cone = new THREE.ConeGeometry(radius, height, 9, 1);
    cone.rotateY(rand() * Math.PI * 2);
    cone.translate((rand() - 0.5) * 0.012, y + height * 0.5, (rand() - 0.5) * 0.012);
    tiers.push(cone);
  }
  const merged = mergeGeometries(tiers, false);
  tiers.forEach((t) => t.dispose());
  // darker in the shaded lower skirt, brighter at the crown
  return withColorRamp(merged, 0.62, 1.06, bottom, 1);
}

export function makeConiferTrunk() {
  const trunk = new THREE.CylinderGeometry(0.028, 0.055, 0.34, 6);
  trunk.translate(0, 0.17, 0);
  return solidColor(trunk, 1, 1, 1);
}

// --- broadleaf --------------------------------------------------------------

export function makeBroadleafFoliage(seed = 9) {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  // an irregular cluster of masses reads as a canopy; one sphere reads as a
  // lollipop, which is what the previous three-blob crown was edging toward
  const lobes = [
    [0, 0.74, 0, 0.30],
    [0.20, 0.62, 0.10, 0.23],
    [-0.19, 0.65, -0.12, 0.24],
    [0.08, 0.86, -0.17, 0.21],
    [-0.11, 0.83, 0.16, 0.20],
    [0.02, 0.95, 0.02, 0.16],
  ];
  const parts = lobes.map(([x, y, z, r]) => {
    const blob = new THREE.IcosahedronGeometry(r, 1);
    blob.scale(1, 0.88, 1);
    blob.rotateY(rand() * Math.PI * 2);
    blob.translate(x, y, z);
    return blob;
  });
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return withColorRamp(merged, 0.6, 1.08, 0.45, 1.05);
}

export function makeBroadleafTrunk() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.045, 0.08, 0.62, 6);
  trunk.translate(0, 0.31, 0);
  parts.push(trunk);
  // two stub limbs so the canopy has something to sit on when seen from close
  for (const [yaw, lean] of [[0.7, 0.4], [3.6, -0.35]]) {
    const limb = new THREE.CylinderGeometry(0.022, 0.038, 0.3, 5);
    limb.translate(0, 0.15, 0);
    limb.rotateZ(lean);
    limb.rotateY(yaw);
    limb.translate(0, 0.5, 0);
    parts.push(limb);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return solidColor(merged, 1, 1, 1);
}

// --- dead snag --------------------------------------------------------------
// A handful of these per forest does more for believability than another
// thousand healthy trees: a treeline of identically healthy specimens is the
// giveaway that it was generated.

export function makeSnagGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.03, 0.075, 0.86, 6);
  trunk.translate(0, 0.43, 0);
  parts.push(trunk);
  for (const [yaw, lean, y, len] of [
    [0.4, 0.75, 0.52, 0.26],
    [2.9, -0.62, 0.66, 0.2],
    [4.8, 0.5, 0.38, 0.22],
  ]) {
    const branch = new THREE.CylinderGeometry(0.012, 0.026, len, 4);
    branch.translate(0, len * 0.5, 0);
    branch.rotateZ(lean);
    branch.rotateY(yaw);
    branch.translate(0, y, 0);
    parts.push(branch);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return withColorRamp(merged, 0.75, 1.05, 0, 0.9);
}
