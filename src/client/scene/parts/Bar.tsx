// The bar counter along the left wall: a tokkuri and two cups for anyone who
// types kanpai, and on her nights (see catVisits in story/eggs.ts) Kyū, the
// black cat with one white sock, asleep on the ledger. Hover and she wakes and
// blinks; pet her and she closes her eyes.

import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { petCat } from '../../story/eggs';
import { since } from '../EggListener';
import { kanpaiGlint, kanpaiLift } from '../eggFx';
import { lerp } from '../layout';
import { damp, useLive } from '../live';
import { PALETTE } from '../palette';
import { makeCanvas, softDot, toTexture, cached } from '../textures/canvas';

/** Where the counter runs: along the left wall, top at y = COUNTER_Y. */
export const COUNTER = { x: -3.45, y: 0.55, z0: -3.4, z1: 0.6, w: 0.62 } as const;

function catEyeTexture(): THREE.CanvasTexture {
  return cached('cat-eye', () => {
    const N = 64;
    const [c, ctx] = makeCanvas(N, N);
    const g = ctx.createRadialGradient(N / 2, N / 2, 2, N / 2, N / 2, N / 2);
    g.addColorStop(0, '#ffe7a0');
    g.addColorStop(0.7, '#d8a845');
    g.addColorStop(1, '#8a6420');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(N / 2, N / 2, N / 2 - 2, N / 2 - 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b0a09';
    ctx.beginPath();
    ctx.ellipse(N / 2, N / 2, 4, N / 2 - 8, 0, 0, Math.PI * 2);
    ctx.fill();
    return toTexture(c);
  });
}

function tailGeometry(): THREE.BufferGeometry {
  // Curled along the counter, around the front of the loaf.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.0, 0.05, -0.2),
    new THREE.Vector3(0.14, 0.03, -0.14),
    new THREE.Vector3(0.18, 0.025, 0.04),
    new THREE.Vector3(0.12, 0.025, 0.2),
    new THREE.Vector3(0.02, 0.03, 0.27),
  ]);
  return new THREE.TubeGeometry(curve, 30, 0.024, 10, false);
}

function Kyu({ position, yaw }: { position: [number, number, number]; yaw: number }) {
  const live = useLive();
  const body = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const ears = useRef<(THREE.Mesh | null)[]>([]);
  const st = useRef({ hover: false, wake: 0, open: 0, pettedAt: -1e9, blinkAt: 2 });
  // Velvet sheen gives a black cat the soft rim of light that shows her shape.
  const fur = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: '#121012', roughness: 0.7, sheen: 1, sheenColor: new THREE.Color('#b9a48a'), sheenRoughness: 0.35 }),
    [],
  );
  const sock = useMemo(() => new THREE.MeshStandardMaterial({ color: PALETTE.washi, roughness: 0.9 }), []);
  const eyeMat = useMemo(() => new THREE.MeshBasicMaterial({ map: catEyeTexture(), toneMapped: false, color: new THREE.Color(1.4, 1.4, 1.4) }), []);
  const tail = useMemo(tailGeometry, []);

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    st.current.hover = true;
    document.body.style.cursor = 'pointer';
  };
  const onOut = () => {
    st.current.hover = false;
    document.body.style.cursor = '';
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const s = st.current;
    // Like the HUD cat: one stamp per petting, not one per click.
    if (performance.now() - s.pettedAt > 2600) petCat();
    s.pettedAt = performance.now();
  };

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const s = st.current;
    const petted = performance.now() - s.pettedAt < 2600 || since(live, 'cat', t) < 2.6;
    s.wake = damp(s.wake, s.hover || petted ? 1 : 0, s.hover ? 4 : 1.2, dt);
    // Awake: eyes open, with a slow blink now and then. Petted: content squint.
    let open = s.hover ? 1 : 0;
    if (s.hover && t > s.blinkAt) {
      if (t > s.blinkAt + 0.14) s.blinkAt = t + 2.2 + ((t * 7.3) % 1.8);
      else open = 0.05;
    }
    if (petted) open = 0.18;
    s.open = damp(s.open, open, open < s.open ? 22 : 6, dt);
    const breath = live.reducedMotion ? 0 : Math.sin(t * 1.5) * (petted ? 0.012 + 0.006 * Math.sin(t * 60) : 0.02);
    if (body.current) body.current.scale.set(1, 0.62 * (1 + breath), 1.32);
    if (head.current) {
      head.current.position.set(0, lerp(0.085, 0.15, s.wake), lerp(0.2, 0.19, s.wake));
      head.current.rotation.set(lerp(0.35, -0.1, s.wake), lerp(0.25, 0, s.wake), lerp(0.3, 0, s.wake));
    }
    if (eyes.current) {
      eyes.current.scale.set(1, Math.max(0.001, s.open), 1);
      eyes.current.visible = s.open > 0.02;
    }
    ears.current.forEach((m, i) => {
      if (!m) return;
      const twitch = s.wake > 0.5 && !live.reducedMotion ? Math.max(0, Math.sin(t * 3.1 + i * 2)) ** 12 * 0.35 : 0;
      m.rotation.z = (i ? -1 : 1) * (0.3 + twitch);
    });
  });

  return (
    <group position={position} rotation={[0, yaw, 0]} scale={1.6}>
      <mesh ref={body} material={fur} position={[0, 0.095, 0]} castShadow>
        <sphereGeometry args={[0.16, 32, 20]} />
      </mesh>
      <mesh geometry={tail} material={fur} castShadow />
      <mesh material={sock} position={[0.05, 0.022, 0.21]} scale={[1, 0.6, 1.3]}>
        <sphereGeometry args={[0.032, 16, 10]} />
      </mesh>
      <mesh material={fur} position={[-0.05, 0.022, 0.21]} scale={[1, 0.6, 1.3]}>
        <sphereGeometry args={[0.032, 16, 10]} />
      </mesh>
      <group ref={head}>
        <mesh material={fur} castShadow scale={[1.1, 0.92, 1]}>
          <sphereGeometry args={[0.095, 28, 18]} />
        </mesh>
        {[-1, 1].map((sd, i) => (
          <mesh
            key={sd}
            ref={(m) => {
              ears.current[i] = m;
            }}
            material={fur}
            position={[sd * 0.058, 0.075, -0.005]}
            rotation={[0, 0, -sd * 0.3]}
          >
            <coneGeometry args={[0.036, 0.075, 4]} />
          </mesh>
        ))}
        <group ref={eyes} position={[0, 0.012, 0.085]}>
          {[-1, 1].map((sd) => (
            <mesh key={sd} material={eyeMat} position={[sd * 0.038, 0, 0.004 - Math.abs(sd) * 0.006]} rotation={[0, sd * 0.35, 0]}>
              <planeGeometry args={[0.034, 0.026]} />
            </mesh>
          ))}
        </group>
        <mesh position={[0, -0.018, 0.093]}>
          <sphereGeometry args={[0.009, 8, 6]} />
          <meshStandardMaterial color="#5a2a2a" roughness={0.6} />
        </mesh>
      </group>
      {/* A generous, invisible hit box so she is easy to find with a finger. */}
      <mesh position={[0, 0.12, 0.05]} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick}>
        <boxGeometry args={[0.5, 0.32, 0.62]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  );
}

/** A tokkuri and two cups. On kanpai the cups rise, meet with a glint, and settle. */
function SakeForTwo({ position }: { position: [number, number, number] }) {
  const live = useLive();
  const cups = useRef<(THREE.Group | null)[]>([]);
  const glint = useRef<THREE.Mesh>(null);
  const tokkuri = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      const belly = 0.07 * Math.sin(Math.PI * Math.min(1, t * 1.2)) + 0.018;
      const neck = t > 0.78 ? 0.022 + Math.max(0, t - 0.93) * 0.5 : belly;
      pts.push(new THREE.Vector2(Math.max(0.016, t > 0.78 ? neck : belly), t * 0.27));
    }
    return new THREE.LatheGeometry(pts, 36);
  }, []);
  const cup = useMemo(() => {
    const pts = [new THREE.Vector2(0.0, 0.0), new THREE.Vector2(0.026, 0.0), new THREE.Vector2(0.03, 0.006), new THREE.Vector2(0.042, 0.045), new THREE.Vector2(0.038, 0.045), new THREE.Vector2(0.024, 0.01), new THREE.Vector2(0.0, 0.01)];
    return new THREE.LatheGeometry(pts, 28);
  }, []);
  const glintMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: softDot(64, 2.4),
        color: new THREE.Color(PALETTE.ember).multiplyScalar(3),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useFrame(({ clock, camera }) => {
    const t = since(live, 'kanpai', clock.elapsedTime);
    const lift = live.reducedMotion ? Math.min(0.4, kanpaiLift(t)) : kanpaiLift(t);
    cups.current.forEach((g, i) => {
      if (!g) return;
      const side = i ? 1 : -1;
      const rest = side * 0.09;
      g.position.set(0.03, 0.12 * lift, lerp(rest, side * 0.035, lift) + 0.12);
      g.rotation.set(side * 0.35 * lift, 0, 0);
    });
    if (glint.current) {
      glintMat.opacity = kanpaiGlint(t);
      glint.current.visible = glintMat.opacity > 0.01;
      glint.current.quaternion.copy(camera.quaternion);
    }
  });
  return (
    <group position={position}>
      <mesh geometry={tokkuri} castShadow receiveShadow>
        <meshPhysicalMaterial color="#e8e1d2" roughness={0.25} clearcoat={0.8} />
      </mesh>
      {[0, 1].map((i) => (
        <group
          key={i}
          ref={(g) => {
            cups.current[i] = g;
          }}
        >
          <mesh geometry={cup} castShadow>
            <meshPhysicalMaterial color={i ? '#1f2a3d' : '#efe6d4'} roughness={0.3} clearcoat={0.8} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
      <mesh ref={glint} material={glintMat} position={[0.03, 0.17, 0.12]} visible={false}>
        <planeGeometry args={[0.28, 0.28]} />
      </mesh>
    </group>
  );
}

export function Bar({ cat }: { cat: boolean }) {
  const mats = useMemo(
    () => ({
      top: new THREE.MeshPhysicalMaterial({ color: '#3a2416', roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.4 }),
      body: new THREE.MeshStandardMaterial({ color: '#150d09', roughness: 0.7 }),
      ledger: new THREE.MeshStandardMaterial({ color: '#2a1f3a', roughness: 0.8 }),
      pages: new THREE.MeshStandardMaterial({ color: '#d9cdb4', roughness: 0.9 }),
    }),
    [],
  );
  const { x, y, z0, z1, w } = COUNTER;
  const len = z1 - z0;
  return (
    <group>
      <mesh material={mats.top} position={[x, y - 0.03, (z0 + z1) / 2]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.06, len]} />
      </mesh>
      <mesh material={mats.body} position={[x - 0.04, (y - 1.1) / 2 - 0.03, (z0 + z1) / 2]} receiveShadow>
        <boxGeometry args={[w - 0.1, y + 1.1, len - 0.06]} />
      </mesh>
      {/* The ledger under the cat; she sleeps on the book. */}
      <group position={[x + 0.06, y, -1.35]} rotation={[0, 0.25, 0]}>
        <mesh material={mats.ledger} position={[0, 0.018, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.44, 0.036, 0.6]} />
        </mesh>
        <mesh material={mats.pages} position={[0.006, 0.018, 0]}>
          <boxGeometry args={[0.43, 0.03, 0.59]} />
        </mesh>
      </group>
      <SakeForTwo position={[x + 0.08, y, -0.45]} />
      {/* A bare bulb under a tin shade over the counter: the Master's light. */}
      <group position={[x + 0.1, y + 1.0, -0.95]}>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.004, 0.004, 1.0, 5]} />
          <meshBasicMaterial color="#0a0a0a" />
        </mesh>
        <mesh position={[0, 0.03, 0]}>
          <coneGeometry args={[0.13, 0.09, 24, 1, true]} />
          <meshStandardMaterial color="#1c1a17" metalness={0.6} roughness={0.4} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.01, 0]}>
          <sphereGeometry args={[0.035, 16, 10]} />
          <meshBasicMaterial color={new THREE.Color(PALETTE.ember).multiplyScalar(2.2)} toneMapped={false} />
        </mesh>
        <pointLight color="#ffc27a" intensity={3.4} decay={2} distance={2.8} position={[0, -0.05, 0]} />
      </group>
      {cat && <Kyu position={[x + 0.06, y + 0.036, -1.35]} yaw={0.62} />}
    </group>
  );
}
