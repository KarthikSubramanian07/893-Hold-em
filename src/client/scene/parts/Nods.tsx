// The nods, made visible. Once every nod is in, a gold silk thread bows up
// from each nodder's seat and settles on the teammate they nodded at. It
// glows bright as the nods turn over, then rests as a faint line through the
// call and the showdown, so you can always read who vouched for whom.
//
// Each thread's geometry is built once, when it appears: a thin tube along
// the bow. Growing it is a draw range and glowing it is a material colour, so
// no frame allocates anything or re-uploads a buffer to the GPU.

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { NodThread } from '../derive';
import type { Vec3 } from '../layout';
import { damp, useLive } from '../live';
import { PALETTE } from '../palette';

const TUBULAR = 40;
const RADIAL = 5;
const RADIUS = 0.0055;
const GOLD = new THREE.Color(PALETTE.kin);

function Thread({ from, to, order }: { from: Vec3; to: Vec3; order: number }) {
  const live = useLive();
  const mesh = useRef<THREE.Mesh>(null);
  const st = useRef({ born: -1, o: 0, grow: 0 });

  const geometry = useMemo(() => {
    // A bow: up from the nodder, over, and down onto the nodded seat.
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    const rise = 0.18 + dist * 0.16;
    const a = new THREE.Vector3(from.x, from.y + 0.04, from.z);
    const b = new THREE.Vector3(to.x, to.y + 0.04, to.z);
    const mid = a.clone().lerp(b, 0.5);
    mid.y += rise * 2; // the control point sits twice as high as the curve's peak
    return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), TUBULAR, RADIUS, RADIAL, false);
  }, [from.x, from.y, from.z, to.x, to.y, to.z]);

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: GOLD.clone(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(({ clock }, dt) => {
    const m = mesh.current;
    if (!m) return;
    const now = clock.elapsedTime;
    const s = st.current;
    if (s.born < 0) s.born = now + order * 0.18;
    const age = now - s.born;
    const flash = age > 0 ? Math.max(0, 1 - age / 2.4) : 0;
    s.grow = live.reducedMotion ? 1 : damp(s.grow, age > 0 ? 1 : 0, 3.2, dt);
    s.o = damp(s.o, age > 0 ? 0.28 + 0.6 * flash : 0, 4, dt);
    m.visible = s.o > 0.004 && s.grow > 0.01;
    if (!m.visible) return;
    // Grow along the bow: draw only the first part of the tube's segments.
    const segments = Math.max(1, Math.round(TUBULAR * Math.min(1, s.grow)));
    geometry.setDrawRange(0, segments * RADIAL * 6);
    material.color.copy(GOLD).multiplyScalar(1 + flash * 1.6);
    material.opacity = s.o;
  });

  return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={2} />;
}

export function NodThreads({ nods, anchors, hand }: { nods: NodThread[]; anchors: ReadonlyMap<string, Vec3>; hand: number }) {
  return (
    <group>
      {nods.map((n, i) => {
        const a = anchors.get(n.from);
        const b = anchors.get(n.to);
        return a && b ? <Thread key={`${hand}:${n.from}:${n.to}`} from={a} to={b} order={i} /> : null;
      })}
    </group>
  );
}
