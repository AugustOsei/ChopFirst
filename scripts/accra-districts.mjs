// Headless check of the Accra district zoning: mirrors buildDistricts() from
// RaceGame.jsx against the real track geometry and reports where each district
// falls and how much of the lap it covers. Lets us confirm the Cantonments
// (residential) stretch is actually on the route without driving there.
import * as THREE from "three";
import { setActiveTrack, getTrackLength, getTrackFrame, projectPointToTrack } from "../game/track.js";

setActiveTrack("accra-city");
const length = getTrackLength();

const anchorDefs = [
  [-181, -1376, "commercial"], // Oxford Street, Osu
  [-200, -831, "commercial"], // Danquah Circle
  [-412, 619, "institutional"], // 37 Military Hospital
  [366, -286, "residential"], // Cantonments
];
const anchors = anchorDefs.map(([x, z, kind]) => ({
  kind,
  d: projectPointToTrack(new THREE.Vector3(x, 0, z), 0, length / 2, 320).distance,
}));

function districtAt(distance) {
  let best = anchors[0];
  let bestGap = Infinity;
  for (const a of anchors) {
    const raw = (((distance - a.d) % length) + length) % length;
    const gap = Math.min(raw, length - raw);
    if (gap < bestGap) { bestGap = gap; best = a; }
  }
  return best.kind;
}

const counts = { commercial: 0, residential: 0, institutional: 0 };
const samples = 200;
let prev = null;
const runs = [];
for (let i = 0; i < samples; i += 1) {
  const d = (i / samples) * length;
  const k = districtAt(d);
  counts[k] += 1;
  if (k !== prev) { runs.push({ k, fromM: Math.round(d) }); prev = k; }
}

console.log("lap length (m):", Math.round(length));
console.log("anchors (arc-distance m):", anchors.map((a) => `${a.kind}@${Math.round(a.d)}`).join("  "));
console.log("coverage:", Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, `${Math.round((v / samples) * 100)}%`])));
console.log("zone order around the lap:");
for (const r of runs) console.log(`  ${r.fromM}m  ->  ${r.k}`);
