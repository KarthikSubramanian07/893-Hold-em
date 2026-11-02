// The House Rule: a tall lacquer card hovering at the far edge of the table.
// When the rule changes it spins in from its back, kanji blazing.

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { RuleId } from '../../../engine/types';
import { damp, useLive } from '../live';
import { softDot } from '../textures/canvas';
import { ruleBackTexture, ruleInk, ruleTexture } from '../textures/marks';

const W = 0.42;
const H = 0.735;

export function RuleCard({ rule, position }: { rule: RuleId | null; position: [number, number, number] }) {
  const live = useLive();
  const root = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const st = useRef({ shown: rule ?? null, spin: Math.PI * 3, s: 0, glow: 0 });
  const front = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1, transparent: true, emissive: '#ffffff', emissiveIntensity: 0.9 }), []);
  const back = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: ruleBackTexture(),
        roughness: 0.4,
        transparent: true,
        emissive: '#ffffff',
        emissiveMap: ruleBackTexture(),
        emissiveIntensity: 0.4,
      }),
    [],
  );
  const halo = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: softDot(128, 2.2),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        opacity: 0,
      }),
    [],
  );

  useFrame(({ clock }, dt) => {
    const s = st.current;
    if (rule !== s.shown && rule) {
      // A new rule: start from the back, a turn and a half away.
      s.spin = Math.PI * 3;
      s.glow = 1.8;
    }
    s.shown = rule;
    if (rule) {
      const tex = ruleTexture(rule);
      if (front.map !== tex) {
        front.map = tex;
        front.emissiveMap = tex;
        front.needsUpdate = true;
        halo.color.set(ruleInk(rule)).multiplyScalar(1.4);
      }
    }
    s.s = damp(s.s, rule ? 1 : 0, rule ? 3 : 5, dt);
    s.spin = damp(s.spin, 0, 2.4, dt);
    s.glow = damp(s.glow, rule ? 0.55 : 0, 1.2, dt);
    const g = root.current;
    if (g) {
      const t = clock.elapsedTime;
      g.visible = s.s > 0.01;
      g.scale.setScalar(s.s);
      g.position.set(position[0], position[1] + (live.reducedMotion ? 0 : Math.sin(t * 0.9) * 0.02) - (1 - s.s) * 0.4, position[2]);
    }
    if (spin.current) spin.current.rotation.y = s.spin;
    halo.opacity = s.glow;
  });

  return (
    <group ref={root} visible={false} rotation={[-0.12, 0, 0]}>
      <mesh material={halo} position={[0, 0, -0.05]}>
        <planeGeometry args={[W * 3.2, H * 2.2]} />
      </mesh>
      <group ref={spin}>
        <mesh material={front} position={[0, 0, 0.003]} castShadow>
          <planeGeometry args={[W, H]} />
        </mesh>
        <mesh material={back} position={[0, 0, -0.003]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[W, H]} />
        </mesh>
      </group>
    </group>
  );
}
