// Headless report of where CityLandmarks' placeOnTrack() drops each landmark on
// the simplified Accra loop: distance along the lap, lap fraction, lateral side,
// and how far the real coordinate is from the road (projectionDistance). A large
// projectionDistance means the landmark isn't actually near the driven road, and
// two landmarks at nearly the same distance means they collide.
import * as THREE from "three";
import { setActiveTrack, getTrackLength, projectPointToTrack } from "../game/track.js";

setActiveTrack("accra-city");
const length = getTrackLength();

const LANDMARKS = {
  "37 Military Hospital": [-412, 619],
  "Danquah Circle": [-200, -831],
  "Oxford Street": [-181, -1376],
  Cantonments: [323, -317],
};

console.log("lap length (m):", Math.round(length));
for (const [name, [x, z]] of Object.entries(LANDMARKS)) {
  const proj = projectPointToTrack(new THREE.Vector3(x, 0, z), 0, length / 2, 320);
  console.log(
    `${name.padEnd(22)} dist=${String(Math.round(proj.distance)).padStart(5)}m  ` +
    `frac=${(proj.distance / length).toFixed(2)}  ` +
    `lateral=${proj.lateral.toFixed(0).padStart(4)}  ` +
    `awayFromRoad=${Math.round(proj.projectionDistance)}m`,
  );
}
