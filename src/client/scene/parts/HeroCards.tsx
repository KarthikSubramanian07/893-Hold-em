// Your own two cards, held up close to the camera, above the HUD at the
// bottom. During a hand they show their backs with a "?": the one hand at the
// table you can't see. At the showdown they turn over, a beat apart.

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import type { Slot } from '../../../engine/types';
import { bottomCalm, cameraFrame, CARD, heroCardPixels } from '../layout';
import { Card } from './Card';

const DIST = 1.4;

export function HeroCards({ cards, glow, folded = false }: { cards: Slot[]; glow: boolean[]; folded?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const size = useThree((s) => s.size);
  const aspect = size.width / Math.max(1, size.height);
  const fov = cameraFrame(aspect).fov;
  const halfH = DIST * Math.tan((fov * Math.PI) / 360);
  const perPx = (2 * halfH) / size.height;
  const calm = useHudBottom(size.height);
  const hidden = cards.every((c) => c === 'back');
  const px = heroCardPixels(size.width, size.height, calm, hidden);
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
            mystery
          />
        );
      })}
    </group>
  );
}

/**
 * Track the top of the HUD's bottom band (the call dock or the showdown
 * panel), so your cards sit above it on every screen. On a phone the dock is
 * far taller than on a desktop, and the cards would otherwise hide behind it.
 */
function useHudBottom(height: number): number {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.querySelector('.hud__bottom');
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setTop(r.height > 0 ? r.top : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      removeEventListener('resize', measure);
    };
  }, []);
  return bottomCalm(top, height);
}
