// The House: one masked figure per hand, floating in the dark against the
// rainy window. Masks are built from a displaced half-sphere and a painted
// face; the eyes glow, and flare red when the House takes a hand.

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { HouseTarget, MaskMood } from '../derive';
import { houseCardSpots, maskLayout, type Vec3 } from '../layout';
import { damp, useLive } from '../live';
import { PALETTE } from '../palette';
import { softDot } from '../textures/canvas';
import { MASK_EYES, MASK_ORDER, maskTexture, type MaskKind } from '../textures/masks';
import { Card } from './Card';

const MR = 0.33;
const ZS = 0.62;
/** Masks are ovals, not balls. */
const XS = 0.84;
const THETA0 = 0.1 * Math.PI;
const THETA_L = 0.8 * Math.PI;

function gauss(x: number, y: number, cx: number, cy: number, sx: number, sy: number): number {
  return Math.exp(-((x - cx) ** 2) / (sx * sx) - ((y - cy) ** 2) / (sy * sy));
}

/** Surface point of the mask for a face UV (v from top). */
function facePoint(u: number, v: number): THREE.Vector3 {
  const phi = u * Math.PI;
  const theta = THETA0 + v * THETA_L;
  return new THREE.Vector3(-MR * XS * Math.cos(phi) * Math.sin(theta), MR * Math.cos(theta), MR * Math.sin(phi) * Math.sin(theta) * ZS);
}

function maskGeometry(kind: MaskKind): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(MR, 72, 56, 0, Math.PI, THETA0, THETA_L);
  const p = g.attributes.position!;
  const eye = MASK_EYES[kind];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / MR;
    const y = p.getY(i) / MR;
    let z = p.getZ(i) * ZS;
    const ey = Math.cos(THETA0 + eye.v * THETA_L);
    const ex = Math.sin(eye.u * Math.PI);
    // Eye sockets.
    z -= 0.035 * (gauss(x, y, -ex, ey, 0.13, 0.08) + gauss(x, y, ex, ey, 0.13, 0.08));
    // Brow ridge and nose.
    z += 0.03 * gauss(x, y, 0, ey + 0.12, 0.45, 0.07);
    switch (kind) {
      case 'kitsune':
        z += 0.22 * gauss(x, y, 0, -0.18, 0.16, 0.3) + 0.05 * gauss(x, y, 0, -0.05, 0.3, 0.3);
        break;
      case 'hannya':
        z += 0.07 * gauss(x, y, 0, -0.05, 0.12, 0.18) - 0.04 * gauss(x, y, 0, -0.42, 0.25, 0.1);
        z += 0.04 * (gauss(x, y, -0.32, -0.15, 0.15, 0.2) + gauss(x, y, 0.32, -0.15, 0.15, 0.2));
        break;
      case 'okame':
        z += 0.045 * (gauss(x, y, -0.38, -0.2, 0.22, 0.22) + gauss(x, y, 0.38, -0.2, 0.22, 0.22));
        z += 0.03 * gauss(x, y, 0, -0.05, 0.1, 0.12);
        break;
      case 'tengu':
        z += 0.05 * gauss(x, y, 0, -0.05, 0.14, 0.2);
        break;
    }
    p.setZ(i, z * MR);
  }
  g.scale(XS, 1, 1);
  g.computeVertexNormals();
  return g;
}

function Ears({ kind, mat }: { kind: MaskKind; mat: THREE.Material }) {
  if (kind === 'kitsune') {
    return (
      <>
        {[-1, 1].map((s) => (
          <mesh key={s} material={mat} position={[s * 0.15, 0.3, -0.02]} rotation={[0.15, 0, -s * 0.4]} castShadow>
            <coneGeometry args={[0.075, 0.24, 4, 1]} />
          </mesh>
        ))}
      </>
    );
  }
  if (kind === 'hannya') {
    return (
      <>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.14, 0.26, 0.02]} rotation={[0.4, 0, -s * 0.55]} castShadow>
            <coneGeometry args={[0.032, 0.26, 16, 1]} />
            <meshStandardMaterial color={PALETTE.kin} metalness={1} roughness={0.3} />
          </mesh>
        ))}
      </>
    );
  }
  if (kind === 'tengu') {
    return (
      <mesh material={mat} position={[0, -0.02, 0.19 + 0.13]} rotation={[Math.PI / 2 - 0.12, 0, 0]} castShadow>
        <coneGeometry args={[0.042, 0.32, 20, 1]} />
      </mesh>
    );
  }
  return null;
}

/** A shrouded figure: shoulders and a hood, nearly black, catching only rim light. */
function Figure() {
  const geo = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    const prof: [number, number][] = [
      [0.0, -1.5],
      [0.62, -1.5],
      [0.6, -0.85],
      [0.52, -0.5],
      [0.38, -0.33],
      [0.27, -0.24],
      [0.29, -0.05],
      [0.3, 0.12],
      [0.27, 0.27],
      [0.19, 0.37],
      [0.08, 0.41],
      [0.0, 0.42],
    ];
    for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, 40);
    g.scale(1, 1, 0.7);
    return g;
  }, []);
  return (
    <mesh geometry={geo} position={[0, 0, -0.12]}>
      <meshStandardMaterial color="#070606" roughness={0.9} metalness={0.0} />
    </mesh>
  );
}

const EYE_IDLE = new THREE.Color('#ffb46a');
const EYE_FLARE = new THREE.Color('#ff1e2e');

function Mask({ kind, spot, target, index }: { kind: MaskKind; spot: Vec3; target: HouseTarget; index: number }) {
  const live = useLive();
  const head = useRef<THREE.Group>(null);
  const st = useRef({ lean: 0, tilt: 0, eye: 0.4, red: 0, appear: 0 });
  const geo = useMemo(() => maskGeometry(kind), [kind]);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ map: maskTexture(kind), roughness: 0.42, metalness: 0.05, side: THREE.DoubleSide }),
    [kind],
  );
  const eyeMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: softDot(64, 1.4),
        color: EYE_IDLE.clone(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  const eyes = useMemo(() => {
    const e = MASK_EYES[kind];
    return [facePoint(0.5 - e.u, e.v), facePoint(0.5 + e.u, e.v)];
  }, [kind]);

  useFrame(({ clock }, dt) => {
    const g = head.current;
    if (!g) return;
    const t = clock.elapsedTime + index * 1.7;
    const s = st.current;
    const mood: MaskMood = target.mood;
    const leanT = mood === 'flare' ? 1 : mood === 'lean' ? 0.45 : mood === 'retreat' ? -0.7 : 0;
    s.lean = damp(s.lean, leanT, 2.2, dt);
    s.eye = damp(s.eye, mood === 'flare' ? 3.2 : mood === 'retreat' ? 0.08 : mood === 'lean' ? 1.1 : 0.55, 2.5, dt);
    s.red = damp(s.red, mood === 'flare' ? 1 : mood === 'lean' && live.targets.outcome === 'house' ? 0.6 : 0, 3, dt);
    s.appear = damp(s.appear, 1, 1.5, dt);
    const bob = live.reducedMotion ? 0 : Math.sin(t * 0.7) * 0.025;
    g.position.set(spot.x, spot.y + bob - (1 - s.appear) * 0.6 - s.lean * 0.12, spot.z + s.lean * 0.42);
    g.rotation.set(s.lean * 0.38 + (live.reducedMotion ? 0 : Math.sin(t * 0.45) * 0.03), Math.sin(t * 0.31) * 0.06 - spot.x * 0.1, (s.lean < 0 ? -s.lean * 0.18 : 0) + Math.sin(t * 0.23) * 0.02);
    const flicker = 0.9 + 0.1 * Math.sin(t * 13.0) * Math.sin(t * 2.1);
    eyeMat.color.copy(EYE_IDLE).lerp(EYE_FLARE, s.red).multiplyScalar(s.eye * flicker * 2.2);
    mat.color.setScalar(mood === 'retreat' ? 0.5 + 0.5 * (1 + s.lean / 0.7) : 1);
  });

  return (
    <group ref={head}>
      <Figure />
      <group position={[0, 0, 0.02]}>
        <mesh geometry={geo} material={mat} castShadow />
        <Ears kind={kind} mat={mat} />
        {eyes.map((p, i) => (
          <mesh key={i} position={[p.x, p.y, p.z - 0.01]} material={eyeMat}>
            <planeGeometry args={[0.1, 0.07]} />
          </mesh>
        ))}
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
      <spotLight color="#ffc58a" position={[0, 2.0, -0.45]} target={target} angle={0.95} penumbra={0.9} intensity={13} decay={2} distance={5} />
    </>
  );
}

export function House({ house, aspect }: { house: HouseTarget[]; aspect: number }) {
  const spots = maskLayout(house.length, aspect);
  return (
    <group>
      <MaskKey />
      {house.map((h, i) => {
        const spot = spots[i]!;
        const kind = MASK_ORDER[i % MASK_ORDER.length]!;
        const cards = houseCardSpots(spot);
        return (
          <group key={i}>
            <Mask kind={kind} spot={spot} target={h} index={i} />
            {h.cards.map((slot, k) => {
              const c = cards[k] ?? cards[0];
              const lift = h.glow[k] ? 0.16 : 0;
              return (
                <Card
                  key={k}
                  slot={slot}
                  position={[c.x, 0.006 + k * 0.002 + lift, c.z + (h.glow[k] ? 0.1 : 0)]}
                  rotation={[-Math.PI / 2 + (lift ? 0.5 : 0), 0, (k - 0.5) * 0.12]}
                  scale={0.82}
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
