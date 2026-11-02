// The one paper lantern. It sways on its cord, and because the spot light
// hangs inside it, every shadow on the table sways with it. Click it and it
// swings; click it eight times in four seconds and it gutters (story/eggs.ts).

import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { lanternClick } from '../../story/eggs';
import { since } from '../EggListener';
import { lanternGutter, swingStep } from '../eggFx';
import type { Vec3 } from '../layout';
import { damp, useLive } from '../live';
import { PALETTE } from '../palette';
import { softDot } from '../textures/canvas';
import { lanternTexture } from '../textures/surfaces';

const PIVOT_Y = 4.6;
const R = 0.3;
const H = 0.64;

export function Lantern({ shadows, rest }: { shadows: boolean; rest: Vec3 }) {
  const BULB_Y = rest.y;
  const live = useLive();
  const swing = useRef<THREE.Group>(null);
  const spot = useRef<THREE.SpotLight>(null);
  const fill = useRef<THREE.PointLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const level = useRef(live.targets.lantern);
  const pendulum = useRef<[number, number]>([0, 0]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // Pushed away from the side you touched it.
    const side = e.point.x >= live.lanternPos.x ? -1 : 1;
    // Enough to swing visibly, not so much that the next click misses it.
    live.lanternKick += side * (live.reducedMotion ? 0.05 : 0.16);
    lanternClick();
  };
  const hover = (on: boolean) => () => {
    document.body.style.cursor = on ? 'pointer' : '';
  };

  const geo = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    const n = 64;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const ribs = 1 + 0.018 * Math.cos(t * Math.PI * 2 * 16);
      const r = (R * Math.pow(Math.sin(Math.PI * (0.06 + t * 0.88)), 0.62) + 0.01) * ribs;
      pts.push(new THREE.Vector2(r, -H / 2 + t * H));
    }
    return new THREE.LatheGeometry(pts, 72);
  }, []);

  const mats = useMemo(() => {
    const tex = lanternTexture();
    return {
      paper: new THREE.MeshStandardMaterial({
        map: tex,
        emissiveMap: tex,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 2.4,
        roughness: 0.9,
        side: THREE.DoubleSide,
      }),
      cap: new THREE.MeshStandardMaterial({ color: '#0d0b0a', roughness: 0.35, metalness: 0.2 }),
      halo: new THREE.MeshBasicMaterial({
        map: softDot(256, 2.6),
        color: new THREE.Color(PALETTE.sodium).multiplyScalar(0.55),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    };
  }, []);

  useFrame(({ clock, camera }, dt) => {
    const t = clock.elapsedTime;
    const amp = live.reducedMotion ? 0.006 : 0.042;
    const g = swing.current;
    pendulum.current = swingStep(pendulum.current[0], pendulum.current[1], dt, live.lanternKick);
    live.lanternKick = 0;
    if (g) {
      g.rotation.z = amp * Math.sin(t * 0.52) + amp * 0.3 * Math.sin(t * 1.31 + 1) + pendulum.current[0];
      g.rotation.x = amp * 0.6 * Math.sin(t * 0.41 + 2);
      g.updateMatrixWorld();
      g.localToWorld(live.lanternPos.set(0, BULB_Y - PIVOT_Y, 0));
    }
    level.current = damp(level.current, live.targets.lantern, 1.6, dt);
    // A candle-ish flicker that never quite repeats, harder when the room is hot.
    const flick =
      1 +
      (live.reducedMotion ? 0 : 0.035 * Math.sin(t * 9.1) * Math.sin(t * 2.3) + 0.02 * Math.sin(t * 23.7) * (0.5 + live.heat));
    const lvl = level.current * flick * lanternGutter(since(live, 'lantern', t));
    mats.paper.emissiveIntensity = 2.4 * lvl;
    mats.halo.opacity = 0.9 * lvl;
    if (spot.current) {
      spot.current.intensity = 17 * lvl;
      // Aim at the board even when the lantern hangs off to one side.
      target.position.set(live.lanternPos.x * 0.25, 0, live.lanternPos.z * 0.6 + 0.15);
      target.updateMatrixWorld();
    }
    if (fill.current) fill.current.intensity = 2.2 * lvl;
    const halo = g?.getObjectByName('halo');
    if (halo) halo.quaternion.copy(camera.quaternion);
  });

  return (
    <>
      <primitive object={target} />
      <group position={[rest.x, PIVOT_Y, rest.z]}>
        <group ref={swing}>
          {/* cord */}
          <mesh position={[0, (BULB_Y - PIVOT_Y + H / 2) / 2, 0]}>
            <cylinderGeometry args={[0.006, 0.006, PIVOT_Y - BULB_Y - H / 2, 6]} />
            <meshStandardMaterial color="#111" />
          </mesh>
          <group position={[0, BULB_Y - PIVOT_Y, 0]}>
            <mesh geometry={geo} material={mats.paper} rotation={[0, Math.PI, 0]} />
            {/* A slightly generous, invisible target, so a swinging lantern is still easy to tap. */}
            <mesh onClick={onClick} onPointerOver={hover(true)} onPointerOut={hover(false)} scale={[1, 1.15, 1]}>
              <sphereGeometry args={[R * 1.35, 16, 12]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
            </mesh>
            <mesh material={mats.cap} position={[0, H / 2 + 0.02, 0]}>
              <cylinderGeometry args={[R * 0.42, R * 0.46, 0.06, 32]} />
            </mesh>
            <mesh material={mats.cap} position={[0, -H / 2 - 0.02, 0]}>
              <cylinderGeometry args={[R * 0.46, R * 0.42, 0.06, 32]} />
            </mesh>
            <mesh name="halo" material={mats.halo}>
              <planeGeometry args={[2.6, 2.6]} />
            </mesh>
            <spotLight
              ref={spot}
              color="#ffc983"
              angle={1.2}
              penumbra={0.75}
              decay={2}
              distance={12}
              position={[0, -H / 2 + 0.05, 0]}
              target={target}
              castShadow={shadows}
              shadow-mapSize={[1024, 1024]}
              shadow-bias={-0.0004}
              shadow-normalBias={0.02}
              shadow-camera-near={0.3}
              shadow-camera-far={8}
            />
            <pointLight ref={fill} color="#ffb870" decay={2} distance={9} />
          </group>
        </group>
      </group>
    </>
  );
}
