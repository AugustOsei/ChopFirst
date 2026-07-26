// Rolling terrain for the ground tracks.
//
// The world used to sit on one flat 1600x1600 quad, which is what made the
// scenery read as props standing on a table: nothing occluded anything, the
// horizon was a hard seam, and the "mountains" were obviously a ring of cones
// parked on a plane.
//
// The mountains now live in THIS mesh rather than in a separate ring of unlit
// bands on the horizon. That is the whole point: a backdrop band has no normals,
// so it cannot catch the sun, and the only way to make it read as distant is to
// wash it toward the sky colour — which is exactly how you get white slabs.
// Displaced terrain gets real lighting, real self-occlusion and real fog for
// free, and there is no seam between the valley and the range because they are
// the same surface.
//
// `heightAt(x, z)` is the same function the mesh is built from, so scenery
// (trees, rocks, bushes) can be planted on the surface rather than at a fixed
// Y. Everything is cached per track id and rebuilt when the track changes.

import * as THREE from "three";
import { getTrackFrame, getTrackLength, TRACK } from "./track";

// --- value noise ------------------------------------------------------------
// Deterministic hash -> lattice -> smooth interpolation. Cheap, seed-stable,
// and good enough for landform at this scale; a gradient-noise implementation
// would look marginally better and cost more than it is worth here.
//
// Both shifts are unsigned on purpose. With an arithmetic `>>` the sign bit of
// `h` propagates into the top 13 bits of the shifted copy, so bit 31 of the XOR
// is always 0 and the hash can only ever return 0..0.5 — which made fbm return
// -1..0 and left the terrain able to sink but never rise. That is why the ridge
// term was invisible and the valley read as a putting green.
function hash2(ix, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function saturate(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smoothstep(x - ix);
  const fz = smoothstep(z - iz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

// Four octaves: broad landform, hillsides, bumps, and a little grain. Returns
// roughly -1..1 so callers can scale it to a metre amplitude.
function fbm(x, z) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fz = z;
  for (let i = 0; i < 4; i += 1) {
    sum += valueNoise(fx, fz) * amp;
    norm += amp;
    amp *= 0.48;
    fx *= 2.07;
    fz *= 2.03;
  }
  return (sum / norm) * 2 - 1;
}

// Ridged multifractal — the standard way to get mountains rather than dunes.
// Folding the noise about its midpoint (`1 - |n|`) turns smooth maxima into
// sharp creases, squaring sharpens them further, and weighting each octave by
// the last concentrates detail on the crests and leaves the valleys smooth.
// That crest/valley asymmetry is what separates a mountain from a blob.
function ridged(x, z) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let weight = 1;
  let fx = x;
  let fz = z;
  for (let i = 0; i < 5; i += 1) {
    let n = 1 - Math.abs(valueNoise(fx, fz) * 2 - 1);
    n *= n;
    n *= weight;
    weight = saturate(n * 2.2);
    sum += n * amp;
    norm += amp;
    amp *= 0.5;
    fx *= 2.11;
    fz *= 2.07;
  }
  return sum / norm;
}

// --- track proximity --------------------------------------------------------
// Nearest-centreline lookup, bucketed into a uniform grid. A brute-force scan
// over every centreline sample for every terrain vertex is ~26M distance tests
// and stalls the load; bucketing cuts it to a handful of candidates per vertex.
const CELL = 48;
const MAX_SEARCH_RINGS = 3; // beyond ~144m we don't care about the exact value
const FAR = 9999;

function sampleCentreline() {
  const length = getTrackLength();
  const step = 3;
  const count = Math.max(2, Math.ceil(length / step));
  const px = new Float32Array(count);
  const py = new Float32Array(count);
  const pz = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const frame = getTrackFrame(i * step);
    px[i] = frame.position.x;
    py[i] = frame.position.y;
    pz[i] = frame.position.z;
  }
  return { count, px, py, pz };
}

// Cells are keyed by a packed integer rather than a `${x},${z}` string. The
// search touches up to 49 cells per vertex and there are >100k vertices, so the
// string allocation alone was the single most expensive thing in the load.
const KEY_BIAS = 4096;
const packKey = (cx, cz) => (cx + KEY_BIAS) * 8192 + (cz + KEY_BIAS);

function buildProximity(line) {
  const { count, px, py, pz } = line;
  const buckets = new Map();
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < count; i += 1) {
    const k = packKey(Math.floor(px[i] / CELL), Math.floor(pz[i] / CELL));
    let list = buckets.get(k);
    if (!list) {
      list = [];
      buckets.set(k, list);
    }
    list.push(i);
    if (px[i] < minX) minX = px[i];
    if (px[i] > maxX) maxX = px[i];
    if (pz[i] < minZ) minZ = pz[i];
    if (pz[i] > maxZ) maxZ = pz[i];
  }
  // Anything this far outside the circuit's bounding box cannot be inside the
  // searched rings, so the whole mountain belt skips the search entirely.
  const REACH = (MAX_SEARCH_RINGS + 1) * CELL;

  // Returns { distance, roadY } for the nearest centreline sample. `distance`
  // saturates at FAR once the point is outside the searched rings — callers
  // only use it to decide how much hill to blend in, and everything past the
  // last ring is fully hill anyway.
  const OUTSIDE = { distance: FAR, roadY: 0 };
  return function nearest(x, z) {
    if (x < minX - REACH || x > maxX + REACH || z < minZ - REACH || z > maxZ + REACH) return OUTSIDE;
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    let bestSq = Infinity;
    let bestIdx = -1;
    for (let ring = 0; ring <= MAX_SEARCH_RINGS; ring += 1) {
      for (let ox = -ring; ox <= ring; ox += 1) {
        for (let oz = -ring; oz <= ring; oz += 1) {
          // only the newly added shell each ring
          if (ring > 0 && Math.abs(ox) !== ring && Math.abs(oz) !== ring) continue;
          const list = buckets.get(packKey(cx + ox, cz + oz));
          if (!list) continue;
          for (let n = 0; n < list.length; n += 1) {
            const i = list[n];
            const dx = x - px[i];
            const dz = z - pz[i];
            const sq = dx * dx + dz * dz;
            if (sq < bestSq) {
              bestSq = sq;
              bestIdx = i;
            }
          }
        }
      }
      // a hit inside this ring can't be beaten by anything a full ring further
      if (bestIdx >= 0 && bestSq < ring * CELL * ring * CELL) break;
    }
    if (bestIdx < 0) return { distance: FAR, roadY: 0 };
    return { distance: Math.sqrt(bestSq), roadY: py[bestIdx] };
  };
}

// Long-range distance-to-road, baked once into a coarse grid and sampled
// bilinearly. The bucketed lookup above saturates a couple of hundred metres
// out, but the mountains need to know how far away the pass is over kilometres
// — and they only need it smooth, not exact, so a 40m grid is ample and costs
// one brute-force pass at load instead of a search per vertex.
const COARSE = 96;

function buildCoarseDistance(line, size) {
  const { count, px, pz } = line;
  const cx = TRACK.center.x;
  const cz = TRACK.center.z;
  const half = size * 0.62; // a little past the mesh so edge samples interpolate
  const grid = new Float32Array((COARSE + 1) * (COARSE + 1));
  const stride = (half * 2) / COARSE;
  for (let gz = 0; gz <= COARSE; gz += 1) {
    const z = cz - half + gz * stride;
    for (let gx = 0; gx <= COARSE; gx += 1) {
      const x = cx - half + gx * stride;
      let bestSq = Infinity;
      for (let i = 0; i < count; i += 1) {
        const dx = x - px[i];
        const dz = z - pz[i];
        const sq = dx * dx + dz * dz;
        if (sq < bestSq) bestSq = sq;
      }
      grid[gz * (COARSE + 1) + gx] = Math.sqrt(bestSq);
    }
  }

  return function coarseDistance(x, z) {
    const fx = saturate((x - (cx - half)) / stride / COARSE) * COARSE;
    const fz = saturate((z - (cz - half)) / stride / COARSE) * COARSE;
    const ix = Math.min(COARSE - 1, Math.floor(fx));
    const iz = Math.min(COARSE - 1, Math.floor(fz));
    const tx = fx - ix;
    const tz = fz - iz;
    const row = iz * (COARSE + 1) + ix;
    const a = grid[row];
    const b = grid[row + 1];
    const c = grid[row + COARSE + 1];
    const d = grid[row + COARSE + 2];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  };
}

// --- height field -----------------------------------------------------------

// Ground sits this far below the road surface, so the shoulder edge always has
// something under it instead of the road hanging in mid-air.
export const GROUND_DROP = 1.0;

function makeHeightField(nearest, coarse, profile) {
  const {
    amplitude,
    flatRadius,
    blendRadius,
    massifStart,
    massifRamp,
    massifHeight,
    rimStart,
    rimEnd,
    rimDrop,
  } = profile;

  return function heightAt(x, z) {
    const { distance, roadY } = nearest(x, z);
    const base = roadY - GROUND_DROP;
    if (distance <= flatRadius) return base;
    // 0 at the edge of the flat corridor, 1 once fully out in the meadow
    const verge = smoothstep(saturate((distance - flatRadius) / blendRadius));
    const rolling =
      fbm(x / 210, z / 210) * amplitude +
      fbm(x / 64, z / 64) * amplitude * 0.34 +
      fbm(x / 19, z / 19) * 0.5;

    let massif = 0;
    let drop = 0;
    if (massifHeight > 0) {
      const far = coarse(x, z);
      // The range climbs away from the pass rather than out from the middle of
      // the loop, so it never crowds one corner and hangs back from another.
      const gate = smoothstep(saturate((far - massifStart) / massifRamp));
      if (gate > 0) {
        // A second, very broad noise decides which sectors are high massif and
        // which are low saddle. Without it every bearing gets the same skyline
        // height and the range reads as a wall.
        const sector = 0.38 + 1.0 * (fbm(x / 820 + 3.1, z / 820 - 5.7) * 0.5 + 0.5);
        massif = ridged(x / 470, z / 470) * massifHeight * sector * gate;
        // a little high-frequency erosion so the flanks aren't glassy
        massif += ridged(x / 120, z / 120) * 18 * gate;
      }
      // The mesh is a square, and a square's edge shows up on the horizon as a
      // dead straight line. Rolling the outer rim away below the eyeline hides
      // the cut the way a curving earth would.
      drop = smoothstep(saturate((far - rimStart) / (rimEnd - rimStart))) * rimDrop;
    }
    return base + verge * rolling + massif - drop;
  };
}

// --- mesh -------------------------------------------------------------------

const MEADOW = new THREE.Color("#4c7a38");
const MEADOW_DRY = new THREE.Color("#7f9a55");
const SLOPE_FOREST = new THREE.Color("#2b5331");
const ROCK = new THREE.Color("#6d6b61");
const ROCK_DARK = new THREE.Color("#4a4941");
const SNOW = new THREE.Color("#eef3fa");
const DIRT = new THREE.Color("#5c6b3a");

function buildGeometry(heightAt, profile) {
  const { size, segments, treeline, rockline, snowline } = profile;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const cx = TRACK.center.x;
  const cz = TRACK.center.z;
  const color = new THREE.Color();

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i) + cx;
    const z = position.getZ(i) + cz;
    position.setY(i, heightAt(x, z));
  }
  geometry.computeVertexNormals();

  // Colour after normals exist so slope can drive the rock blend: steep faces
  // get scree, shoulders get forest, crests get bare rock and only the highest
  // gentle ground holds snow.
  const normal = geometry.attributes.normal;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i) + cx;
    const z = position.getZ(i) + cz;
    const y = position.getY(i);
    const slope = 1 - saturate(normal.getY(i));

    color.copy(MEADOW).lerp(MEADOW_DRY, saturate(valueNoise(x / 130, z / 130) * 1.4 - 0.2));
    color.lerp(DIRT, saturate((valueNoise(x / 90, z / 90) - 0.55) * 2.6) * 0.5);
    // dark conifer flanks, which is also where the scattered trees stop
    color.lerp(SLOPE_FOREST, smoothstep(saturate((y - 12) / treeline)));
    color.lerp(ROCK, smoothstep(saturate((y - treeline) / rockline)));
    color.lerp(ROCK_DARK, saturate(slope * 2.6));
    if (snowline > 0) {
      // snow settles on ledges, not on cliffs, so it fades out with slope
      const cap = smoothstep(saturate((y - snowline) / 110)) * saturate(1 - slope * 2.4);
      if (cap > 0) color.lerp(SNOW, cap);
    }

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// --- public API -------------------------------------------------------------

const PROFILES = {
  // The circuit is a closed 1.3km loop through a mountain pass. The corridor is
  // flat only as far as the shoulder, the meadow rolls, and from ~180m off the
  // road the land climbs into the range that used to be painted on the horizon.
  mountain: {
    size: 3600,
    segments: 340,
    amplitude: 16,
    flatRadius: 11,
    blendRadius: 34,
    massifStart: 170,
    massifRamp: 430,
    massifHeight: 330,
    rimStart: 1250,
    rimEnd: 1650,
    rimDrop: 900,
    treeline: 95,
    rockline: 140,
    snowline: 285,
  },
  // Accra is a city floor: essentially flat, with only enough roll to stop the
  // ground reading as a sheet of card behind the buildings.
  city: {
    size: 2600,
    segments: 120,
    amplitude: 2.4,
    flatRadius: 20,
    blendRadius: 120,
    massifStart: 0,
    massifRamp: 1,
    massifHeight: 0,
    rimStart: 0,
    rimEnd: 1,
    rimDrop: 0,
    treeline: 40,
    rockline: 60,
    snowline: 0,
  },
};

let cache = null;

function ensure() {
  const profile = PROFILES[TRACK.environment];
  if (!profile) return null;
  if (cache && cache.id === TRACK.id) return cache;
  if (cache) cache.geometry.dispose();
  const line = sampleCentreline();
  const nearest = buildProximity(line);
  const coarse = profile.massifHeight > 0 ? buildCoarseDistance(line, profile.size) : () => FAR;
  const heightAt = makeHeightField(nearest, coarse, profile);
  cache = { id: TRACK.id, heightAt, nearest, geometry: buildGeometry(heightAt, profile), profile };
  return cache;
}

export function getTerrain() {
  return ensure();
}

// Distance from a world point to the nearest centreline sample, via the same
// bucketed lookup the mesh is built with. Scatter code needs this for tens of
// thousands of candidate points; `projectPointToTrack` costs ~65 spline
// evaluations per call, which at that volume stalls the load for seconds.
export function trackDistanceAt(x, z) {
  const terrain = ensure();
  if (!terrain) return FAR;
  return terrain.nearest(x, z).distance;
}

// The same value noise the terrain is built from, exposed so scatter can carve
// clearings and thickets that agree with the shape of the land.
export function foliageNoise(x, z) {
  return fbm(x, z);
}

// Surface height at a world point. Falls back to the old fixed ground level for
// tracks with no terrain profile (the orbital deck), so callers don't branch.
export function terrainHeightAt(x, z) {
  const terrain = ensure();
  return terrain ? terrain.heightAt(x, z) : -GROUND_DROP;
}

// Where the forest gives out. Scatter uses it to fade the treeline in step with
// the colour band the mesh already paints, so the two never disagree.
export function treelineHeight() {
  const terrain = ensure();
  return terrain ? terrain.profile.treeline : 1e9;
}
