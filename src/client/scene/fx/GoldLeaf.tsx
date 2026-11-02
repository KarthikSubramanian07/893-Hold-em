// A burst of gold leaf over the table when the crew takes a hand.

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PALETTE } from '../palette';
import { rng } from '../textures/canvas';

const N = 180;

export function GoldLeaf({ on }: { on: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const st = useRef({ born: -100, on: false });
  const parts = useMemo(() => {
    const r = rng(77);
    return Array.from({ length: N }, () => ({
      v: new THREE.Vector3((r() - 0.5) * 3.2, 2.4 + r() * 2.6, (r() - 0.5) * 2.2 - 0.4),
      spin: new THREE.Vector3(r() * 9, r() * 9, r() * 9),
      flutter: 1 + r() * 3,
      size: 0.035 + r() * 0.05,
      phase: r() * 6.28,
    }));
  }, []);
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: PALETTE.kin,
        metalness: 1,
        roughness: 0.22,
        emissive: new THREE.Color(PALETTE.kin),
        emissiveIntensity: 1.4,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 0.7), []);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3() }), []);

  useFrame(({ clock }) => {
    const im = mesh.current;
    if (!im) return;
    const now = clock.elapsedTime;
    if (on && !st.current.on) st.current.born = now;
    st.current.on = on;
    const age = now - st.current.born;
    im.visible = age < 6;
    if (!im.visible) return;
    parts.forEach((p, i) => {
      // Launched up from the board, then drifting down like paper.
      const t = Math.max(0, age - (i % 12) * 0.02);
      const rise = Math.min(t, 0.5);
      const y = 0.2 + p.v.y * rise - 4.9 * rise * rise + (t > 0.5 ? -(t - 0.5) * 0.32 : 0);
      tmp.p.set(p.v.x * (rise + Math.max(0, t - 0.5) * 0.15) + Math.sin(t * p.flutter + p.phase) * 0.12 * Math.min(1, t), Math.max(0.01, y), p.v.z * (rise + Math.max(0, t - 0.5) * 0.15));
      tmp.e.set(p.spin.x * t, p.spin.y * t, p.spin.z * t);
      tmp.q.setFromEuler(tmp.e);
      const fade = t > 4.2 ? Math.max(0, 1 - (t - 4.2) / 1.5) : Math.min(1, t * 8);
      tmp.s.setScalar(p.size * fade);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      im.setMatrixAt(i, tmp.m);
    });
    im.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geo, mat, N]} visible={false} castShadow frustumCulled={false} />;
}
