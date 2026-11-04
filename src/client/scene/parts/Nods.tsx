// The nods, made visible. Once every nod is in, a gold silk thread bows up
// from each nodder's seat and settles on the teammate they nodded at. It
// glows bright as the nods turn over, then rests as a faint line through the
// call and the showdown, so you can always read who vouched for whom.

import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { NodThread } from '../derive';
import type { Vec3 } from '../layout';
import { damp, useLive } from '../live';
import { PALETTE } from '../palette';

const SEGMENTS = 24;
const GOLD = new THREE.Color(PALETTE.kin);

type Line2Like = THREE.Mesh & {
  geometry: { setPositions: (a: ArrayLike<number>) => void };
  material: THREE.Material & { opacity: number; color: THREE.Color; linewidth: number };
};

function Thread({ from, to, order }: { from: Vec3; to: Vec3; order: number }) {
  const live = useLive();
  const ref = useRef<Line2Like>(null);
  const st = useRef({ born: -1, o: 0, grow: 0 });
  const pts = useMemo(() => new Float32Array((SEGMENTS + 1) * 3), []);
  const initial = useMemo(() => Array.from({ length: SEGMENTS + 1 }, () => [0, 0, 0] as [number, number, number]), []);

  useFrame(({ clock }, dt) => {
    const line = ref.current;
    if (!line) return;
    const now = clock.elapsedTime;
    const s = st.current;
    if (s.born < 0) s.born = now + order * 0.18;
    const age = now - s.born;
    const flash = age > 0 ? Math.max(0, 1 - age / 2.4) : 0;
    s.grow = live.reducedMotion ? 1 : damp(s.grow, age > 0 ? 1 : 0, 3.2, dt);
    s.o = damp(s.o, age > 0 ? 0.28 + 0.6 * flash : 0, 4, dt);
    line.visible = s.o > 0.004 && s.grow > 0.01;
    if (!line.visible) return;

    // A bow: up from the nodder, over, and down onto the nodded seat.
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    const rise = 0.18 + dist * 0.16;
    const sway = live.reducedMotion ? 0 : Math.sin(now * 0.7 + order) * 0.012;
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = (i / SEGMENTS) * s.grow;
      const k = i * 3;
      pts[k] = from.x + (to.x - from.x) * t;
      pts[k + 1] = from.y + 0.04 + (to.y - from.y) * t + rise * Math.sin(Math.PI * t) + sway * Math.sin(Math.PI * t);
      pts[k + 2] = from.z + (to.z - from.z) * t;
    }
    line.geometry.setPositions(pts);
    const m = line.material;
    m.color.copy(GOLD).multiplyScalar(1 + flash * 1.6);
    m.opacity = s.o;
    m.linewidth = 1.2 + flash * 1.4;
  });

  return <Line ref={ref as never} points={initial} lineWidth={1.2} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />;
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
