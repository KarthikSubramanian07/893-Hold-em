// The House: one masked figure floating in the dark against the rainy window,
// its 3 to 5 cards in a row before it. The mask is the one this table wears
// (Okame, Kitsune, the Okina), carved from its height field in maskShapes.ts
// and painted to match. It glances slowly from seat to seat, and at the
// showdown it turns to stare down the hand that beat it, or the one it beat.

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { MaskId } from '../../story/types';
import type { HouseTarget, MaskMood } from '../derive';
import { houseCardSpots, type Vec3 } from '../layout';
import { damp, dampAngle, SEEN_DELAY, useLive } from '../live';
import { MASK_SHAPES, surfacePoint, type MaskShape } from '../maskShapes';
import { PALETTE } from '../palette';
import { softDot } from '../textures/canvas';
import { maskTexture } from '../textures/masks';
import { Card } from './Card';

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** The carved face: a grid over face coordinates, clipped to the outline. */
export function faceGeometry(shape: MaskShape, cols = 72, rows = 90): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= rows; j++) {
    // Denser rows toward the crown and chin, where the outline turns fastest.
    const v = j / rows;
    const y = Math.cos(v * Math.PI) * 0.995;
    const w = shape.width(y);
    for (let i = 0; i <= cols; i++) {
      const s = (i / cols) * 2 - 1;
      const x = s * w;
      const p = surfacePoint(shape, x, y);
      pos.push(p.x, p.y, p.z);
      uv.push((x + 1) / 2, (y + 1) / 2);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const b = a + cols + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A tube along a curve that tapers from r0 to r1, closed with a round tip. */
function taperTube(points: THREE.Vector3[], r0: number, r1: number, tubular = 28, radial = 14): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const p = g.attributes.position!;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, c);
    const r = THREE.MathUtils.lerp(r0, r1, Math.pow(t, 0.9)) * (t > 0.92 ? Math.sqrt(Math.max(0, 1 - ((t - 0.92) / 0.08) ** 2)) * 0.9 + 0.1 : 1);
    for (let k = 0; k <= radial; k++) {
      const n = i * (radial + 1) + k;
      v.fromBufferAttribute(p, n).sub(c).multiplyScalar(r);
      p.setXYZ(n, c.x + v.x, c.y + v.y, c.z + v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A point on the face, nudged out along z. */
function on(shape: MaskShape, x: number, y: number, dz = 0): THREE.Vector3 {
  const p = surfacePoint(shape, x, y);
  return V(p.x, p.y, p.z + dz);
}

function fuzzBall(r: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 4);
  const p = g.attributes.position!;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 211 + seed) * Math.sin(v.y * 173 + seed * 2) * Math.sin(v.z * 197 + seed * 3);
    v.multiplyScalar(1 + 0.09 * n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function earGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.085, 0);
  s.quadraticCurveTo(-0.07, 0.17, 0, 0.3);
  s.quadraticCurveTo(0.07, 0.17, 0.085, 0);
  s.quadraticCurveTo(0, -0.02, -0.085, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 14 });
  g.translate(0, 0, -0.011);
  g.computeVertexNormals();
  return g;
}

function innerEarGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.05, 0.03);
  s.quadraticCurveTo(-0.04, 0.15, 0, 0.24);
  s.quadraticCurveTo(0.04, 0.15, 0.05, 0.03);
  s.quadraticCurveTo(0, 0.015, -0.05, 0.03);
  return new THREE.ShapeGeometry(s, 12);
}

/** Ebisu's tall folded eboshi, seen side-on and extruded across the head. */
function eboshiGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  // (x here is world z: + toward the viewer.)
  s.moveTo(0.16, 0);
  s.quadraticCurveTo(0.05, 0.02, -0.2, 0.0);
  s.quadraticCurveTo(-0.3, 0.2, -0.26, 0.42);
  s.quadraticCurveTo(-0.2, 0.56, -0.02, 0.58);
  s.quadraticCurveTo(0.12, 0.57, 0.16, 0.48);
  s.quadraticCurveTo(0.06, 0.5, -0.04, 0.44);
  s.quadraticCurveTo(-0.1, 0.28, 0.0, 0.12);
  s.quadraticCurveTo(0.08, 0.06, 0.16, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.44, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 3, curveSegments: 16 });
  g.rotateY(-Math.PI / 2);
  g.translate(0.22, 0, 0);
  g.computeVertexNormals();
  return g;
}

interface Part {
  geo: THREE.BufferGeometry;
  mat: 'face' | 'gold' | 'ivory' | 'black' | 'white' | 'red' | 'indigo' | 'inner' | 'hole';
  position?: THREE.Vector3;
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

/** Everything that is not a height field. */
function maskParts(id: MaskId, shape: MaskShape): Part[] {
  const parts: Part[] = [];
  switch (id) {
    case 'kitsune': {
      const ear = earGeometry();
      const inner = innerEarGeometry();
      for (const s of [-1, 1]) {
        const base = on(shape, s * 0.5, 0.78, -0.04);
        const rot: [number, number, number] = [-0.28, s * 0.12, -s * 0.32];
        parts.push({ geo: ear, mat: 'face', position: base, rotation: rot });
        parts.push({ geo: inner, mat: 'inner', position: base.clone().add(V(0, 0, 0.026)), rotation: rot });
      }
      break;
    }
    case 'tengu': {
      const b = on(shape, 0, 0.02, -0.03);
      parts.push({
        geo: taperTube([b, b.clone().add(V(0, -0.035, 0.16)), b.clone().add(V(0, -0.045, 0.32)), b.clone().add(V(0, -0.01, 0.46))], 0.078, 0.034, 36, 18),
        mat: 'red',
      });
      // A small black tokin cap on the brow.
      parts.push({ geo: new THREE.DodecahedronGeometry(0.07, 0), mat: 'black', position: on(shape, 0, 0.84, -0.01), scale: [1, 0.8, 0.9] });
      break;
    }
    case 'hannya': {
      for (const s of [-1, 1]) {
        const b = on(shape, s * 0.42, 0.74, -0.05);
        parts.push({
          geo: taperTube([b, b.clone().add(V(s * 0.05, 0.12, -0.02)), b.clone().add(V(s * 0.14, 0.24, -0.04)), b.clone().add(V(s * 0.2, 0.34, 0.02))], 0.05, 0.01),
          mat: 'gold',
        });
      }
      break;
    }
    case 'oni': {
      for (const s of [-1, 1]) {
        const b = on(shape, s * 0.38, 0.82, -0.04);
        parts.push({ geo: taperTube([b, b.clone().add(V(s * 0.04, 0.1, 0.01)), b.clone().add(V(s * 0.1, 0.19, 0.04))], 0.06, 0.012), mat: 'ivory' });
        const t = on(shape, s * 0.3, -0.6, -0.01);
        parts.push({ geo: taperTube([t, t.clone().add(V(0, 0.06, 0.03)), t.clone().add(V(s * 0.015, 0.13, 0.03))], 0.026, 0.005, 16, 10), mat: 'ivory' });
      }
      break;
    }
    case 'okina': {
      for (const s of [-1, 1]) {
        parts.push({ geo: fuzzBall(0.058, s + 2), mat: 'white', position: on(shape, s * 0.3, 0.43, 0.01), scale: [1.15, 0.85, 0.8] });
      }
      // The beard: tufts of white hair hanging from the cut jaw.
      for (let k = 0; k < 13; k++) {
        const u = k / 12 - 0.5;
        const b = on(shape, u * 0.7, -0.66 - 0.14 * (1 - Math.abs(u * 2) ** 2), -0.02);
        const len = 0.36 + 0.14 * Math.cos(u * Math.PI);
        const sway = u * 0.14;
        // It falls forward over the robe, the way a long beard rests on a chest.
        parts.push({
          geo: taperTube(
            [b, b.clone().add(V(sway * 0.5, -len * 0.3, 0.12)), b.clone().add(V(sway, -len * 0.62, 0.21)), b.clone().add(V(sway * 1.4, -len, 0.26))],
            0.036 - Math.abs(u) * 0.02,
            0.004,
            20,
            8,
          ),
          mat: 'white',
        });
      }
      break;
    }
    case 'ebisu': {
      parts.push({ geo: eboshiGeometry(), mat: 'black', position: on(shape, 0, 0.76, -0.16), rotation: [-0.12, 0, 0] });
      break;
    }
    case 'hyottoko': {
      const m = on(shape, 0.22, -0.48, -0.02);
      parts.push({ geo: taperTube([m, m.clone().add(V(0.02, -0.004, 0.05)), m.clone().add(V(0.05, -0.006, 0.09))], 0.052, 0.04, 12, 18), mat: 'red' });
      parts.push({
        geo: new THREE.CircleGeometry(0.026, 18),
        mat: 'hole',
        position: m.clone().add(V(0.052, -0.006, 0.093)),
        rotation: [0, 0.5, 0],
      });
      // The knot of the tenugui on the brow.
      for (const s of [-1, 1]) {
        parts.push({
          geo: new THREE.SphereGeometry(0.06, 18, 12),
          mat: 'indigo',
          position: on(shape, s * 0.07, 0.86, 0.02),
          rotation: [0, 0, s * 0.7],
          scale: [1.3, 0.7, 0.6],
        });
      }
      break;
    }
    case 'okame':
      break;
  }
  return parts;
}

// ---------------------------------------------------------------------------
// One figure
// ---------------------------------------------------------------------------

/** Shoulders under a dark robe; static. */
const BODY = (() => {
  const prof: [number, number][] = [
    [0.0, -1.55],
    [0.64, -1.55],
    [0.62, -0.88],
    [0.54, -0.52],
    [0.4, -0.35],
    [0.26, -0.26],
    [0.0, -0.24],
  ];
  const g = new THREE.LatheGeometry(
    prof.map(([r, y]) => new THREE.Vector2(r, y)),
    40,
  );
  g.scale(1, 1, 0.7);
  return g;
})();

/** The hood behind the mask; turns with the head. */
const HOOD = (() => {
  const prof: [number, number][] = [
    [0.0, -0.36],
    [0.25, -0.34],
    [0.3, -0.1],
    [0.32, 0.12],
    [0.3, 0.3],
    [0.21, 0.42],
    [0.09, 0.47],
    [0.0, 0.48],
  ];
  const g = new THREE.LatheGeometry(
    prof.map(([r, y]) => new THREE.Vector2(r, y)),
    40,
  );
  g.scale(1.05, 1, 0.72);
  return g;
})();

const ROBE = new THREE.MeshStandardMaterial({ color: '#080707', roughness: 0.92 });

const EYE_IDLE = new THREE.Color('#ffb46a');
const EYE_FLARE = new THREE.Color('#ff1e2e');

interface MaskProps {
  id: MaskId;
  spot: Vec3;
  scale: number;
  target: HouseTarget;
  index: number;
  /** World anchors of the seats it glances between. */
  gaze: Vec3[];
  /** World anchor of the seat it stares down at the showdown, if any. */
  sawAt: Vec3 | null;
}

/** Which of its seats the House is looking at, `t` seconds in: it glances between them. */
export function gazeIndex(t: number, seats: number, phase: number): number {
  if (seats <= 1) return 0;
  // Dwell ~4.5 s on each seat, offset so repeat visits never line up.
  return Math.floor((t + phase) / 4.5) % seats;
}

function Mask({ id, spot, scale, target, index, gaze, sawAt }: MaskProps) {
  const live = useLive();
  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyeAnchor = useRef<THREE.Object3D>(null);
  const st = useRef({ lean: 0, eye: 0.4, red: 0, appear: 0, yaw: 0, pitch: 0.12, snap: 0 });
  const shape = MASK_SHAPES[id];
  const geo = useMemo(() => faceGeometry(shape), [shape]);
  const parts = useMemo(() => maskParts(id, shape), [id, shape]);
  const mats = useMemo(() => {
    const gloss = { okame: 0.55, hyottoko: 0.3, ebisu: 0.7, kitsune: 0.75, tengu: 0.9, hannya: 0.85, okina: 0.55, oni: 0.8 }[id];
    const face = new THREE.MeshPhysicalMaterial({
      map: maskTexture(id),
      roughness: 0.62 - gloss * 0.3,
      metalness: 0.02,
      clearcoat: gloss,
      clearcoatRoughness: 0.32,
      // A whisper of self-light so the paint reads at the dark ends of the row.
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: maskTexture(id),
      emissiveIntensity: 0.16,
      side: THREE.DoubleSide,
    });
    const tone = { tengu: '#c23a25', hyottoko: '#c4473a' }[id as 'tengu' | 'hyottoko'] ?? '#c23a25';
    return {
      face,
      gold: new THREE.MeshStandardMaterial({ color: PALETTE.kin, metalness: 1, roughness: 0.28 }),
      ivory: new THREE.MeshPhysicalMaterial({ color: '#efe4c8', roughness: 0.35, clearcoat: 0.6 }),
      black: new THREE.MeshPhysicalMaterial({ color: '#0b0908', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 }),
      white: new THREE.MeshStandardMaterial({ color: '#fbf8f2', roughness: 0.95, emissive: '#fbf3e4', emissiveIntensity: 0.12 }),
      red: new THREE.MeshPhysicalMaterial({ color: tone, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.2 }),
      indigo: new THREE.MeshStandardMaterial({ color: '#284a86', roughness: 0.85 }),
      inner: new THREE.MeshStandardMaterial({ color: '#c8321f', roughness: 0.6, side: THREE.DoubleSide }),
      hole: new THREE.MeshBasicMaterial({ color: '#120705' }),
    } satisfies Record<Part['mat'], THREE.Material>;
  }, [id]);
  const eyeMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: softDot(64, 1.6),
        color: EYE_IDLE.clone(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  // Open eyes smoulder a little at rest; eyes carved shut only burn when they flare.
  const idleGlow = shape.eyes[0].r >= 0.75 ? 0.16 : 0;
  const eyes = useMemo(() => shape.eyes.map((e) => ({ p: on(shape, e.x, e.y, 0.012), r: e.r })), [shape]);
  const eyeMid = useMemo(() => eyes[0]!.p.clone().add(eyes[1]!.p).multiplyScalar(0.5), [eyes]);

  useFrame(({ clock }, dt) => {
    const g = root.current;
    const h = head.current;
    if (!g || !h) return;
    const now = clock.elapsedTime;
    const t = now + index * 1.7;
    const s = st.current;
    const still = live.reducedMotion;
    const mood: MaskMood = target.mood;
    const sinceShow = live.showdownAt >= 0 ? now - live.showdownAt : -1;
    // The moment it delivers its verdict on the seats it watches.
    const seeing = !!sawAt && sinceShow >= SEEN_DELAY;
    const flash = seeing ? Math.max(0, 1 - (sinceShow - SEEN_DELAY) / 2.2) : 0;

    const leanT = mood === 'flare' ? 1 : mood === 'lean' ? 0.45 : mood === 'retreat' ? -0.7 : 0;
    s.lean = damp(s.lean, leanT + (seeing ? 0.35 * (0.4 + flash) : 0), 2.2, dt);
    const eyeT = mood === 'flare' ? 3.2 : mood === 'retreat' ? 0.02 : mood === 'lean' ? 1.0 : idleGlow;
    s.eye = damp(s.eye, seeing ? Math.max(eyeT, 1.4 + 2.6 * flash) : eyeT, seeing ? 6 : 2.5, dt);
    const redT = mood === 'flare' ? 1 : mood === 'lean' && live.targets.outcome === 'house' ? 0.6 : 0;
    s.red = damp(s.red, seeing ? 1 : redT, seeing ? 8 : 3, dt);
    s.appear = damp(s.appear, 1, 1.5, dt);

    // Where it looks: the seat it saw, or a slow glance between its two seats.
    let look: Vec3 | null = null;
    if (seeing) look = sawAt;
    else if (gaze.length) look = gaze[still ? 0 : gazeIndex(now, gaze.length, index * 2.3)]!;
    let yawT = 0;
    let pitchT = 0.1;
    if (look) {
      const dx = look.x - spot.x;
      const dz = look.z - spot.z;
      yawT = Math.max(-0.36, Math.min(0.36, Math.atan2(dx, dz) * 0.5));
      pitchT = Math.max(0, Math.min(0.32, Math.atan2(spot.y - look.y, Math.hypot(dx, dz)) * 0.4));
    }
    if (still && !seeing && gaze.length > 1) {
      // Reduced motion: settle between the two seats instead of glancing.
      const a = gaze[0]!;
      const b = gaze[1]!;
      yawT = Math.max(-0.36, Math.min(0.36, Math.atan2((a.x + b.x) / 2 - spot.x, (a.z + b.z) / 2 - spot.z) * 0.5));
    }
    s.yaw = dampAngle(s.yaw, yawT, seeing ? 7 : 1.1, dt);
    s.pitch = damp(s.pitch, pitchT, seeing ? 7 : 1.1, dt);

    const bob = still ? 0 : Math.sin(t * 0.7) * 0.02;
    g.position.set(spot.x, spot.y + bob - (1 - s.appear) * 0.6 - s.lean * 0.1, spot.z + s.lean * 0.38);
    g.rotation.set(s.lean * 0.18, 0, still ? 0 : Math.sin(t * 0.23) * 0.015);
    h.rotation.set(s.pitch + s.lean * 0.2 + (still ? 0 : Math.sin(t * 0.45) * 0.02), s.yaw, s.lean < 0 ? -s.lean * 0.15 : 0);

    const flicker = still ? 1 : 0.92 + 0.08 * Math.sin(t * 13.0) * Math.sin(t * 2.1);
    eyeMat.color.copy(EYE_IDLE).lerp(EYE_FLARE, s.red).multiplyScalar(s.eye * flicker * 2.0);
    const dim = mood === 'retreat' ? 0.5 + 0.5 * (1 + s.lean / 0.7) : 1;
    mats.face.color.setScalar(dim);
    eyeAnchor.current?.getWorldPosition(live.maskEyes[index] ?? (live.maskEyes[index] = new THREE.Vector3()));
  });

  return (
    <group ref={root} scale={scale}>
      <mesh geometry={BODY} material={ROBE} position={[0, 0, -0.12]} />
      <group ref={head}>
        <mesh geometry={HOOD} material={ROBE} position={[0, 0, -0.14]} />
        <mesh geometry={geo} material={mats.face} castShadow />
        {parts.map((p, i) => (
          <mesh key={i} geometry={p.geo} material={mats[p.mat]} position={p.position} rotation={p.rotation} scale={p.scale} castShadow={p.mat !== 'hole' && p.mat !== 'inner'} />
        ))}
        {eyes.map((e, i) => (
          <mesh key={i} position={e.p} material={eyeMat} scale={[0.11 * e.r, 0.075 * e.r, 1]}>
            <planeGeometry args={[1, 1]} />
          </mesh>
        ))}
        <object3D ref={eyeAnchor} position={eyeMid} />
      </group>
    </group>
  );
}

/** A narrow warm key from the lantern onto the masks, so faces read in the dark. */
function MaskKey() {
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, 1.0, -1.95);
    return o;
  }, []);
  return (
    <>
      <primitive object={target} />
      <spotLight color="#ffc58a" position={[0, 2.1, -0.2]} target={target} angle={1.0} penumbra={0.9} intensity={15} decay={2} distance={5.5} />
    </>
  );
}

export interface HouseProps {
  house: HouseTarget[];
  spots: Vec3[];
  scale: number;
  /** World anchor of every seat by id. */
  anchors: ReadonlyMap<string, Vec3>;
}

export function House({ house, spots, scale, anchors }: HouseProps) {
  return (
    <group>
      <MaskKey />
      {house.map((h, i) => {
        const spot = spots[i]!;
        const cards = houseCardSpots(spot, h.cards.length);
        const gaze = h.watches.map((id) => anchors.get(id)).filter((v): v is Vec3 => !!v);
        const sawAt = h.saw.length ? (anchors.get(h.saw[0]!) ?? null) : null;
        return (
          <group key={`${i}:${h.mask}`}>
            <Mask id={h.mask} spot={spot} scale={scale} target={h} index={i} gaze={gaze} sawAt={sawAt} />
            {h.cards.map((slot, k) => {
              const c = cards[k] ?? cards[0]!;
              const lift = h.glow[k] ? 0.16 : 0;
              return (
                <Card
                  key={k}
                  slot={slot}
                  position={[c.x, 0.006 + k * 0.002 + lift, c.z + (h.glow[k] ? 0.1 : 0)]}
                  rotation={[-Math.PI / 2 + (lift ? 0.5 : 0), 0, (k - (h.cards.length - 1) / 2) * 0.05]}
                  scale={h.cards.length > 3 ? 0.78 : 0.82}
                  houseGlow={h.glow[k]}
                  dealFrom={[spot.x, 1.0, spot.z + 0.2]}
                  delay={0.25 + i * 0.12 + k * 0.08}
                />
              );
            })}
          </group>
        );
      })}
    </group>
  );
}
