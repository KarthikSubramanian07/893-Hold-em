// Your own two cards, held up close to the camera so they are always readable,
// on any screen, above the HUD at the bottom.

import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import type { Slot } from '../../../engine/types';
import { cameraFrame, CARD, heroCardPixels } from '../layout';
import { Card } from './Card';

const DIST = 1.4;

export function HeroCards({ cards, glow, folded }: { cards: Slot[]; glow: boolean[]; folded: boolean }) {
  const group = useRef<THREE.Group>(null);
  const size = useThree((s) => s.size);
  const aspect = size.width / Math.max(1, size.height);
  const fov = cameraFrame(aspect).fov;
  const halfH = DIST * Math.tan((fov * Math.PI) / 360);
  const perPx = (2 * halfH) / size.height;
  const px = heroCardPixels(size.width, size.height);
  const scale = (px.cardHeight * perPx) / CARD.h;
  const baseY = (px.centreY - size.height / 2) * perPx;
  const dropY = folded ? -px.cardHeight * 0.35 * perPx : 0;

  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
  });

  return (
    <group ref={group}>
      {cards.map((slot, k) => {
        const side = k - 0.5;
        const lift = glow[k] ? 18 * perPx : 0;
        return (
          <Card
            key={k}
            slot={slot}
            position={[side * px.gap * perPx * 1.9, baseY + dropY + lift - Math.abs(side) * 6 * perPx, -DIST + k * 0.004]}
            rotation={[-0.16, side * -0.12, side * -0.1]}
            scale={scale}
            emissive={0.32}
            dim={folded ? 0.85 : 0}
            crewGlow={glow[k]}
            dealFrom={[side * 0.3, baseY - px.cardHeight * perPx * 1.2, -DIST]}
            delay={0.15 + k * 0.25}
          />
        );
      })}
    </group>
  );
}
