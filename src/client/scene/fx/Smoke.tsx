// Cigarette smoke curling up from the ashtray, plus the big puff that rolls
// across the felt when a hand ties.

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useLive } from '../live';
import { smokeTexture } from '../textures/marks';
import { CIGARETTE_TIP } from '../parts/Table';

const WISPS = 14;

function smokeMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: smokeTexture(),
    color: '#d8cfc2',
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
}

export function Smoke() {
  const live = useLive();
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const mats = useMemo(() => Array.from({ length: WISPS }, smokeMaterial), []);
  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime * (live.still ? 0 : live.reducedMotion ? 0.4 : 1);
    for (let i = 0; i < WISPS; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const age = (t * 0.075 + i / WISPS) % 1;
      const curl = Math.sin(age * 7 + i * 1.3) * 0.12 * age + Math.sin(t * 0.3 + i) * 0.05 * age;
      m.position.set(CIGARETTE_TIP.x + curl - age * 0.25, CIGARETTE_TIP.y + age * 1.9, CIGARETTE_TIP.z + Math.cos(age * 5 + i) * 0.08 * age - age * 0.2);
      m.scale.setScalar(0.06 + age * 0.75);
      m.quaternion.copy(camera.quaternion);
      m.rotateZ(i * 1.9 + age * 1.6);
      mats[i]!.opacity = Math.sin(Math.PI * Math.min(1, age * 1.3)) * 0.16 * (1 - age * 0.5);
    }
  });
  return (
    <group>
      {mats.map((mat, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m;
          }}
          material={mat}
        >
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  );
}

const PUFFS = 16;

/** A slow roll of smoke over the board, for a tie. Plays while `on` is true. */
export function SmokePuff({ on }: { on: boolean }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const mats = useMemo(() => Array.from({ length: PUFFS }, smokeMaterial), []);
  const st = useRef({ born: -100, on: false });
  const dirs = useMemo(() => Array.from({ length: PUFFS }, (_, i) => (i / PUFFS) * Math.PI * 2 + Math.sin(i * 7.1) * 0.4), []);
  useFrame(({ clock, camera }) => {
    const now = clock.elapsedTime;
    if (on && !st.current.on) st.current.born = now;
    st.current.on = on;
    const age = now - st.current.born;
    const k = Math.min(1, age / 3.5);
    for (let i = 0; i < PUFFS; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const a = dirs[i]!;
      const r = 0.2 + k * (0.9 + (i % 3) * 0.3);
      m.position.set(Math.cos(a) * r * 1.4, 0.15 + k * 0.5 + (i % 4) * 0.05, 0.1 + Math.sin(a) * r * 0.6);
      m.scale.setScalar(0.5 + k * 1.3);
      m.quaternion.copy(camera.quaternion);
      m.rotateZ(i + k);
      mats[i]!.opacity = age < 4.5 ? Math.sin(Math.PI * k) * 0.22 : 0;
      m.visible = mats[i]!.opacity > 0.005;
    }
  });
  return (
    <group>
      {mats.map((mat, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m;
          }}
          material={mat}
          visible={false}
        >
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  );
}
