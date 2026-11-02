// Who is watching whom, made visible. Each mask's gaze is a faint silk thread
// from between its eyes to the seat it is looking at, in that mask's colour.
// At the showdown the thread to a seat that was seen snaps taut and red, and
// the seat is branded 見; a seat that got away with it lets out a breath.

import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { HouseTarget, SeatTarget } from '../derive';
import type { Vec3 } from '../layout';
import { damp, SEEN_DELAY, useLive } from '../live';
import { softDot } from '../textures/canvas';
import { seenTexture } from '../textures/masks';
import { gazeIndex, MASK_TAG } from '../watch';

const SEGMENTS = 18;
const SEEN_RED = new THREE.Color('#ff2a36');

type Line2Like = THREE.Mesh & {
  geometry: { setPositions: (a: ArrayLike<number>) => void };
  material: THREE.Material & { opacity: number; color: THREE.Color; linewidth: number };
};

function Thread({ seat, mask, maskIndex, anchor, order }: { seat: SeatTarget; mask: HouseTarget; maskIndex: number; anchor: Vec3; order: number }) {
  const live = useLive();
  const ref = useRef<Line2Like>(null);
  const st = useRef({ o: 0, red: 0 });
  const tag = useMemo(() => new THREE.Color(MASK_TAG[mask.mask].color), [mask.mask]);
  const pts = useMemo(() => new Float32Array((SEGMENTS + 1) * 3), []);
  const a = useMemo(() => new THREE.Vector3(), []);
  const b = useMemo(() => new THREE.Vector3(), []);
  const initial = useMemo(() => Array.from({ length: SEGMENTS + 1 }, () => [0, 0, 0] as [number, number, number]), []);

  useFrame(({ clock }, dt) => {
    const line = ref.current;
    if (!line) return;
    const now = clock.elapsedTime;
    const s = st.current;
    const since = live.showdownAt >= 0 ? now - live.showdownAt : -1;
    const verdict = since >= SEEN_DELAY ? seat.seen : null;
    const flash = verdict === 'seen' ? Math.max(0, 1 - (since - SEEN_DELAY) / 1.8) : 0;
    // Idle: a glint only while the mask is looking this way.
    const looking = mask.watches[live.reducedMotion ? 0 : gazeIndex(now, mask.watches.length, maskIndex * 2.3)] === seat.key;
    const phase = live.targets.phase;
    const idle = phase === 'call' ? (looking ? 0.15 : 0.03) : phase === 'showdown' && since < SEEN_DELAY ? 0.12 : 0;
    const target = verdict === 'seen' ? 0.22 + 0.6 * flash : verdict === 'clear' ? 0 : idle;
    s.o = damp(s.o, target, verdict === 'seen' ? 9 : 2.2, dt);
    s.red = damp(s.red, verdict === 'seen' ? 1 : 0, 8, dt);
    line.visible = s.o > 0.004;
    if (!line.visible) return;

    a.copy(live.maskEyes[maskIndex] ?? a);
    b.set(anchor.x, anchor.y + 0.02, anchor.z);
    // A slack silk thread, pulled taut when the seat is seen.
    const sag = 0.18 * (1 - s.red) + 0.02;
    const drift = live.reducedMotion ? 0 : Math.sin(now * 0.8 + order) * 0.02 * (1 - s.red);
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const k = i * 3;
      pts[k] = a.x + (b.x - a.x) * t + drift * Math.sin(Math.PI * t);
      pts[k + 1] = a.y + (b.y - a.y) * t - sag * Math.sin(Math.PI * t);
      pts[k + 2] = a.z + (b.z - a.z) * t;
    }
    line.geometry.setPositions(pts);
    const m = line.material;
    m.color.copy(tag).lerp(SEEN_RED, s.red).multiplyScalar(1 + s.red * flash * 1.4);
    m.opacity = s.o;
    m.linewidth = 1.1 + s.red * flash * 1.3;
  });

  return <Line ref={ref as never} points={initial} lineWidth={1.1} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />;
}

export function Threads({ seats, house, anchors }: { seats: SeatTarget[]; house: HouseTarget[]; anchors: ReadonlyMap<string, Vec3> }) {
  return (
    <group>
      {seats.map((s, i) => {
        const w = s.watcher;
        const anchor = anchors.get(s.key);
        if (w === null || !house[w] || !anchor) return null;
        return <Thread key={`${s.key}:${w}:${house[w].mask}`} seat={s} mask={house[w]} maskIndex={w} anchor={anchor} order={i} />;
      })}
    </group>
  );
}

/**
 * The showdown verdict at one seat. Seen: a red bloom under the seat and a 見
 * brand stamped down. Clear: one soft warm breath, then nothing.
 */
export function SeenMark({
  seen,
  at,
  stampAt,
  stampRot,
  you,
}: {
  seen: SeatTarget['seen'];
  at: [number, number];
  stampAt: [number, number, number];
  stampRot: [number, number, number];
  you: boolean;
}) {
  const live = useLive();
  const glow = useRef<THREE.Mesh>(null);
  const stamp = useRef<THREE.Mesh>(null);
  const st = useRef({ glow: 0, stamp: 0 });
  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: softDot(128, 1.8),
        color: new THREE.Color('#ff2a36'),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  const stampMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: seenTexture(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }),
    [],
  );

  useFrame(({ clock }, dt) => {
    const since = live.showdownAt >= 0 ? clock.elapsedTime - live.showdownAt : -1;
    const v = since >= SEEN_DELAY ? seen : null;
    const age = since - SEEN_DELAY;
    const s = st.current;
    const g = glow.current;
    const m = stamp.current;
    if (v === 'seen') {
      s.glow = damp(s.glow, 0.55 + 0.45 * Math.max(0, 1 - age / 1.6), 10, dt);
      s.stamp = Math.min(1, s.stamp + dt * 6);
      glowMat.color.set('#ff2a36');
    } else if (v === 'clear') {
      // One breath out: up gently, then away.
      const breath = age < 2.4 ? Math.sin((Math.min(age, 2.4) / 2.4) * Math.PI) * 0.4 : 0;
      s.glow = damp(s.glow, breath, 4, dt);
      s.stamp = 0;
      glowMat.color.set('#ffd8a0');
    } else {
      s.glow = damp(s.glow, 0, 3, dt);
      s.stamp = 0;
    }
    if (g) {
      glowMat.opacity = s.glow;
      g.visible = s.glow > 0.005;
      const size = v === 'clear' ? 0.75 + 0.25 * Math.min(1, Math.max(0, age) / 2.4) : 1;
      g.scale.setScalar(size * (you ? 1.3 : 1));
    }
    if (m) {
      m.visible = s.stamp > 0;
      // Slammed down: big and faint, then small, dark, and final.
      const k = s.stamp;
      const punch = 1 + 0.9 * (1 - k) * (1 - k);
      m.scale.setScalar(punch);
      stampMat.opacity = Math.min(1, k * 1.4);
    }
  });

  return (
    <group>
      <mesh ref={glow} material={glowMat} position={[at[0], 0.012, at[1]]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <planeGeometry args={[0.95, 0.95]} />
      </mesh>
      <mesh ref={stamp} material={stampMat} position={stampAt} rotation={stampRot} visible={false}>
        <planeGeometry args={you ? [0.26, 0.26] : [0.13, 0.13]} />
      </mesh>
    </group>
  );
}
