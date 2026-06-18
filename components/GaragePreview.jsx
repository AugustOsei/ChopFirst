"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import { Suspense } from "react";
import { GLBVehicle } from "./CarBodies";

// Live "showroom" preview: the selected car model on a platform, slowly turn-table
// rotating (and draggable). Lit with a key/fill/rim rig — no network HDR — so it
// works offline and matches the game's clean look. Transparent background lets the
// CSS showroom gradient behind it show through.
export default function GaragePreview({ vehicle, paint }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [5.6, 2.3, 6.4], fov: 33 }}
    >
      <hemisphereLight args={["#dfe9ff", "#20242c", 0.9]} />
      <directionalLight position={[5, 9, 6]} intensity={1.7} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-7, 4, -5]} intensity={0.6} color="#6fb4ff" />
      <directionalLight position={[0, 3, -8]} intensity={0.5} color="#ffd9a0" />
      <Suspense fallback={null}>
        <group position={[0, -0.45, 0]}>
          <GLBVehicle vehicle={vehicle} paint={paint} />
          <ContactShadows position={[0, 0.01, 0]} opacity={0.55} scale={9} blur={2.4} far={4} resolution={512} />
        </group>
      </Suspense>
      <OrbitControls
        autoRotate
        autoRotateSpeed={1.2}
        enablePan={false}
        enableZoom={false}
        minPolarAngle={1.0}
        maxPolarAngle={1.45}
        target={[0, 0.15, 0]}
      />
    </Canvas>
  );
}
