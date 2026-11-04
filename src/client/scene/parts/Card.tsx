// One playing card. It damps toward wherever the view says it should be, so a
// deal, a flip, a fold, or a showdown lift all fall out of the same few lines.

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Slot } from '../../../engine/types';
import { isFace } from '../cardInfo';
import { CARD } from '../layout';
import { damp, dampAngle } from '../live';
import { PALETTE } from '../palette';
import { cardGlowTexture, cardTexture } from '../textures/cards';

export type V3 = readonly [number, number, number];

const PLANE = new THREE.PlaneGeometry(CARD.w, CARD.h);
const GLOW_PLANE = new THREE.PlaneGeometry(CARD.w * 1.9, CARD.h * 1.65);
const CREW_GLOW = new THREE.Color(PALETTE.kin).multiplyScalar(2.6);
const HOUSE_GLOW = new THREE.Color(PALETTE.neon).multiplyScalar(2.6);

export interface CardProps {
  slot: Slot;
  position: V3;
  /** Euler rotation of the card when face up. */
  rotation: V3;
  scale?: number;
  /** 0 = lit, 1 = folded into the dark. */
  dim?: number;
  crewGlow?: boolean;
  houseGlow?: boolean;
  /** Where a fresh deal flies in from. */
  dealFrom?: V3;
  /** Self-illumination so cards held near the camera stay readable. */
  emissive?: number;
  /** Delay (s) before a deal starts, to stagger cards. */
  delay?: number;
  /** Your own card: its back carries a "?" until it turns over. */
  mystery?: boolean;
}

export function Card({
  slot,
  position,
  rotation,
  scale = 1,
  dim = 0,
  crewGlow = false,
  houseGlow = false,
  dealFrom = [0, 1.4, -2.4],
  emissive = 0,
  delay = 0,
  mystery = false,
}: CardProps) {
  const root = useRef<THREE.Group>(null);
  const flip = useRef<THREE.Group>(null);
  const lastFace = useRef<Slot>(isFace(slot) ? slot : null);
  if (isFace(slot)) lastFace.current = slot;
  const faceKey = isFace(lastFace.current) ? lastFace.current : null;

  const faceMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        roughness: 0.55,
        metalness: 0,
        alphaTest: 0.5,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 0,
      }),
    [],
  );
  const backMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: cardTexture(mystery ? 'mystery' : 'back'),
        roughness: 0.45,
        alphaTest: 0.5,
        emissive: new THREE.Color('#ffffff'),
        emissiveMap: cardTexture(mystery ? 'mystery' : 'back'),
        emissiveIntensity: 0,
      }),
    [mystery],
  );
  const glowMats = useMemo(
    () =>
      [CREW_GLOW, HOUSE_GLOW].map(
        (c) =>
          new THREE.MeshBasicMaterial({
            map: cardGlowTexture(),
            color: c,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          }),
      ),
    [],
  );

  useEffect(() => {
    const tex = cardTexture(faceKey ?? 'blank');
    faceMat.map = tex;
    faceMat.emissiveMap = tex;
    faceMat.needsUpdate = true;
  }, [faceKey, faceMat]);

  useEffect(
    () => () => {
      faceMat.dispose();
      backMat.dispose();
      glowMats.forEach((m) => m.dispose());
    },
    [faceMat, backMat, glowMats],
  );

  const st = useRef({ dealt: false, wait: 0, flip: Math.PI, s: 0, dim: 0, crew: 0, house: 0 });

  useFrame((_, rawDt) => {
    const g = root.current;
    const f = flip.current;
    if (!g || !f) return;
    const dt = Math.min(rawDt, 0.05);
    const s = st.current;

    if (slot !== null && !s.dealt) {
      s.dealt = true;
      s.wait = delay;
      g.position.set(...dealFrom);
      g.rotation.set(rotation[0], rotation[1] + Math.PI * 0.6, rotation[2]);
      s.flip = Math.PI;
      s.s = scale * 0.5;
    } else if (slot === null && s.dealt) {
      s.dealt = false;
    }
    if (s.wait > 0) {
      s.wait -= dt;
      g.visible = false;
      return;
    }

    const show = slot !== null;
    s.s = damp(s.s, show ? scale : 0, show ? 7 : 10, dt);
    g.visible = s.s > 0.004;
    if (!g.visible) return;
    g.scale.setScalar(s.s);
    g.position.set(
      damp(g.position.x, position[0], 6, dt),
      damp(g.position.y, position[1], 6, dt),
      damp(g.position.z, position[2], 6, dt),
    );
    g.rotation.set(
      dampAngle(g.rotation.x, rotation[0], 7, dt),
      dampAngle(g.rotation.y, rotation[1], 7, dt),
      dampAngle(g.rotation.z, rotation[2], 7, dt),
    );
    s.flip = damp(s.flip, isFace(slot) ? 0 : Math.PI, 6.5, dt);
    f.rotation.y = s.flip;
    // A little hop at the middle of a flip.
    f.position.z = Math.sin(s.flip) * 0.12;

    s.dim = damp(s.dim, dim, 4, dt);
    const lum = 1 - s.dim * 0.8;
    faceMat.color.setScalar(lum);
    backMat.color.setScalar(lum);
    faceMat.emissiveIntensity = emissive * lum;
    backMat.emissiveIntensity = emissive * lum * 0.8;

    s.crew = damp(s.crew, crewGlow ? 1 : 0, 3, dt);
    s.house = damp(s.house, houseGlow ? 1 : 0, 3, dt);
    const pulse = 0.85 + 0.15 * Math.sin(performance.now() * 0.004);
    glowMats[0]!.opacity = s.crew * pulse;
    glowMats[1]!.opacity = s.house * pulse * (crewGlow ? 0.35 : 1);
  });

  return (
    <group ref={root} visible={false}>
      <mesh geometry={GLOW_PLANE} material={glowMats[1]} position={[0, 0, -0.012]} scale={crewGlow ? 1.18 : 1} />
      <mesh geometry={GLOW_PLANE} material={glowMats[0]} position={[0, 0, -0.01]} />
      <group ref={flip}>
        <mesh geometry={PLANE} material={faceMat} position={[0, 0, 0.002]} castShadow />
        <mesh geometry={PLANE} material={backMat} position={[0, 0, -0.002]} rotation={[0, Math.PI, 0]} castShadow />
      </group>
    </group>
  );
}
