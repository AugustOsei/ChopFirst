import * as THREE from "three";
import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { ROAD_LIFT } from "../game/track";
import { VEHICLES } from "../game/vehicle";

// Real vehicle bodies, loaded as glTF/GLB models instead of procedural geometry.
// Each model fits the same rig the game uses: it sits inside the rolling/leaning
// bodyRef group and the boost flames/headlight beams are added by the wrapper.
//
// The Street Coupe's body material is named "BodyPaint" in the GLB, so we can recolor
// it at runtime to the player's chosen paint (the other models wear fixed liveries).
//
// Sources (see README credits):
//   street — "Low-poly sports car" by Juff22 (CC-BY)
//   taxi   — "Low Poly Hong Kong Taxi" by Han66st (CC-BY), recolored Ghana yellow
//   trotro — "1999 Toyota Hiace Commuter" by Yoru_Murcielago (CC-BY)
//   speeder— "LS-340 Land Speeder" by MRowa (CC-BY-SA)
//
// `float` is the only per-model vertical number left. Every model used to carry a
// hand-tuned `y` offset, which is how they ended up hovering: the offsets were
// guesses against each GLB's own origin, and those origins sit anywhere the artist
// left them (the coupe's is a metre off its own wheels). The model is measured and
// seated on its own bounding box instead, so `float` means what it says — how far
// off the tarmac this vehicle is meant to be, which is zero for anything with tyres.

const MODELS = {
  street: { url: "/models/coupe.glb", scale: 1.0, rotation: 0, float: 0 },
  taxi: { url: "/models/taxi.glb?v=2", scale: 1.0, rotation: 0, float: 0 },
  trotro: { url: "/models/trotro.glb", scale: 1.0, rotation: 0, float: 0 },
  hoverbike: { url: "/models/speeder.glb", scale: 1.0, rotation: 0, float: 0.45 },
};

export const GLB_VEHICLES = Object.keys(MODELS);

const RIDE_HEIGHTS = Object.fromEntries(VEHICLES.map((v) => [v.id, v.tuning.RIDE_HEIGHT]));

// Where the road surface is in the car rig's local space. The rig's origin is the
// chassis origin, parked RIDE_HEIGHT above the centreline; the tarmac is ROAD_LIFT
// above the same centreline. Everything that should look like it touches the road —
// the model, the exhaust flames, the headlights — hangs off this.
export function vehicleSeatY(vehicle) {
  const spec = MODELS[vehicle] || MODELS.street;
  const ride = RIDE_HEIGHTS[vehicle] ?? RIDE_HEIGHTS.street;
  return ROAD_LIFT - ride + spec.float;
}

export function GLBVehicle({ vehicle, paint }) {
  const spec = MODELS[vehicle] || MODELS.street;
  const { scene } = useGLTF(spec.url);
  // Clone so multiple instances don't share one mutated graph; enable shadows; and
  // recolor the "BodyPaint" material to the chosen paint (Street Coupe only — the
  // others have no such material so this is a no-op for them).
  const model = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = false;
      if (!paint || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const next = mats.map((m) => {
        if (m && /BodyPaint/i.test(m.name)) {
          const c = m.clone();
          c.color = new THREE.Color(paint);
          return c;
        }
        return m;
      });
      o.material = next.length === 1 ? next[0] : next;
    });

    // Measure with the model's own facing and scale already applied, then drop it
    // so its lowest point — the bottom of the tyres — lands exactly on y=0.
    const holder = new THREE.Group();
    holder.rotation.y = spec.rotation;
    holder.scale.setScalar(spec.scale);
    holder.add(root);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    if (Number.isFinite(box.min.y)) holder.position.y = -box.min.y;
    return holder;
  }, [scene, paint, spec.rotation, spec.scale]);

  return <primitive object={model} />;
}

Object.values(MODELS).forEach((m) => useGLTF.preload(m.url));
