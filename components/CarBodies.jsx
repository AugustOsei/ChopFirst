import * as THREE from "three";
import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";

// Real vehicle bodies, loaded as glTF/GLB models instead of procedural geometry.
// Each model fits the same rig the game uses: it sits inside the rolling/leaning
// bodyRef group and the boost flames/headlight beams are added by the wrapper.
// Per-model transform (scale, facing, ground offset) is tuned so the model lands on
// the road and points forward (+Z).
//
// The Street Coupe's body material is named "BodyPaint" in the GLB, so we can recolor
// it at runtime to the player's chosen paint (the other models wear fixed liveries).
//
// Sources (see README credits):
//   street — "Low-poly sports car" by Juff22 (CC-BY)
//   taxi   — "Low Poly Hong Kong Taxi" by Han66st (CC-BY), recolored Ghana yellow
//   trotro — "1999 Toyota Hiace Commuter" by Yoru_Murcielago (CC-BY)
//   speeder— "LS-340 Land Speeder" by MRowa (CC-BY-SA)

const MODELS = {
  street: { url: "/models/coupe.glb", scale: 1.0, rotation: 0, y: 0.0 },
  taxi: { url: "/models/taxi.glb?v=2", scale: 1.0, rotation: 0, y: 0.0 },
  trotro: { url: "/models/trotro.glb", scale: 1.0, rotation: 0, y: 0.0 },
  hoverbike: { url: "/models/speeder.glb", scale: 1.0, rotation: 0, y: 0.4 },
};

export const GLB_VEHICLES = Object.keys(MODELS);

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
    return root;
  }, [scene, paint]);
  return (
    <group rotation={[0, spec.rotation, 0]} position={[0, spec.y, 0]} scale={spec.scale}>
      <primitive object={model} />
    </group>
  );
}

Object.values(MODELS).forEach((m) => useGLTF.preload(m.url));
