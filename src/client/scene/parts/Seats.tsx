// The crew's side of the table. Each seat gets a washi place card with a
// name, a round avatar seal, its hole cards face up for everyone else to read,
// a candle that lights once it has decided, a row of gold nod beads once the
// nods turn over, and at the showdown a stamped 入 In or 出 Out slip.

import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { plateText } from '../cardInfo';
import type { SeatTarget } from '../derive';
import { PLATE_FONT } from '../fonts';
import { cameraFrame, seatLocal as local, type SeatSpot } from '../layout';
import { damp, useLive } from '../live';
import { PALETTE } from '../palette';
import { softDot } from '../textures/canvas';
import { flameTexture, sealTexture, stampTexture } from '../textures/marks';
import { Card } from './Card';

const BEAD_GEO = new THREE.SphereGeometry(0.026, 16, 12);
const SEAL_GEO = new THREE.CylinderGeometry(0.085, 0.085, 0.03, 40);
const STAMP_GEO = new THREE.PlaneGeometry(0.3, 0.3);

/** One gold bead per nod this seat received; they roll in when the nods turn over. */
function NodBeads({ count }: { count: number }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const mat = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: PALETTE.kin, metalness: 1, roughness: 0.22, emissive: new THREE.Color(PALETTE.kin), emissiveIntensity: 0.35 }),
    [],
  );
  const st = useRef<number[]>(Array.from({ length: 5 }, () => 0));
  useFrame((_, dt) => {
    for (let i = 0; i < 5; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const on = i < count;
      st.current[i] = damp(st.current[i]!, on ? 1 : 0, on ? 6 - i * 0.6 : 4, dt);
      const v = st.current[i]!;
      m.scale.setScalar(Math.max(0.001, v));
      m.visible = v > 0.02;
      m.position.set((i - (Math.min(count, 5) - 1) / 2) * 0.07, 0.026 + (1 - v) * 0.25, 0);
    }
  });
  return (
    <group>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m;
          }}
          geometry={BEAD_GEO}
          material={mat}
          castShadow
          visible={false}
        />
      ))}
    </group>
  );
}

function Candle({ lit }: { lit: boolean }) {
  const live = useLive();
  const flame = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const level = useRef(0);
  const flameMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: flameTexture(),
        color: new THREE.Color('#ffd9a0').multiplyScalar(3.2),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: softDot(64, 2),
        color: new THREE.Color(PALETTE.sodium).multiplyScalar(0.9),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useFrame(({ clock, camera }, dt) => {
    level.current = damp(level.current, lit ? 1 : 0, lit ? 5 : 3, dt);
    const t = clock.elapsedTime;
    const f = live.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 17 + level.current) * Math.sin(t * 5.3);
    if (flame.current) {
      flame.current.scale.set(0.05 * level.current, 0.1 * level.current * f, 1);
      flame.current.visible = level.current > 0.02;
      flame.current.quaternion.copy(camera.quaternion);
    }
    if (glow.current) {
      glow.current.scale.setScalar(0.42 * level.current * f);
      glow.current.visible = level.current > 0.02;
      glow.current.quaternion.copy(camera.quaternion);
    }
  });
  return (
    <group>
      <mesh position={[0, 0.006, 0]} receiveShadow>
        <cylinderGeometry args={[0.055, 0.06, 0.012, 24]} />
        <meshStandardMaterial color={PALETTE.kin} metalness={1} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.065, 0]} castShadow>
        <cylinderGeometry args={[0.022, 0.024, 0.11, 16]} />
        <meshStandardMaterial color="#efe6d4" roughness={0.6} emissive="#ffb060" emissiveIntensity={0.0} />
      </mesh>
      <mesh position={[0, 0.125, 0]}>
        <cylinderGeometry args={[0.002, 0.002, 0.012, 4]} />
        <meshBasicMaterial color="#111" />
      </mesh>
      <mesh ref={flame} position={[0, 0.165, 0]} material={flameMat}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={glow} position={[0, 0.16, 0]} material={glowMat}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </group>
  );
}

/** The washi In/Out slip: it drops onto the felt when the stance is on the table. */
function Stamp({ stance, slipKey, position, yaw }: { stance: SeatTarget['stance']; slipKey: string; position: [number, number]; yaw: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const mark = slipKey && stance ? { key: slipKey, stance } : null;
  const st = useRef({ key: mark?.key ?? '', born: -10, y: 0.0015, spin: 0, opacity: mark ? 0.62 : 0 });
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    [],
  );
  const tex = useMemo(() => (stance ? stampTexture(stance) : null), [stance]);
  if (tex && mat.map !== tex) {
    mat.map = tex;
    mat.needsUpdate = true;
  }
  useFrame(({ clock }, dt) => {
    const m = mesh.current;
    if (!m) return;
    const s = st.current;
    const now = clock.elapsedTime;
    const key = mark?.key ?? '';
    if (key !== s.key) {
      s.key = key;
      if (mark) {
        s.born = now;
        s.y = 0.55;
        s.spin = (Math.random() - 0.5) * 2.5;
        s.opacity = 1;
      }
    }
    const age = now - s.born;
    s.y = damp(s.y, 0.004, 7, dt);
    s.spin = damp(s.spin, 0, 6, dt);
    const restOpacity = mark ? 0.62 : 0;
    s.opacity = damp(s.opacity, age < 2.4 ? 1 : restOpacity, age < 2.4 ? 10 : 1.2, dt);
    const punch = age < 0.6 ? 1 + 0.35 * Math.max(0, 1 - age / 0.35) : 1;
    m.position.set(position[0], s.y, position[1]);
    m.rotation.set(-Math.PI / 2, 0, yaw + 0.25 + s.spin);
    m.scale.setScalar(punch * (age < 2.4 ? 1 : 0.85 + 0.15 * Math.exp(-(age - 2.4))));
    mat.opacity = s.opacity;
    m.visible = s.opacity > 0.01;
  });
  return <mesh ref={mesh} geometry={STAMP_GEO} material={mat} receiveShadow />;
}

function PlaceCard({ name, dim, yaw }: { name: string; dim: number; yaw: number }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#efe6d3', roughness: 0.85, side: THREE.DoubleSide }), []);
  mat.color.set('#efe6d3').multiplyScalar(1 - dim * 0.65);
  const W = 0.46;
  const H = 0.14;
  const lean = 0.32;
  return (
    <group rotation={[0, yaw, 0]}>
      {[1, -1].map((s) => (
        <mesh
          key={s}
          material={mat}
          position={[0, (H / 2) * Math.cos(lean), (s * H * Math.sin(lean)) / 2]}
          rotation={[-s * lean, 0, 0]}
          castShadow
          receiveShadow
        >
          <planeGeometry args={[W, H]} />
        </mesh>
      ))}
      <Text
        font={PLATE_FONT}
        fontSize={0.072}
        color={PALETTE.sumi}
        fillOpacity={1 - dim * 0.6}
        anchorX="center"
        anchorY="middle"
        maxWidth={W * 0.92}
        position={[0, (H / 2) * Math.cos(lean), (H * Math.sin(lean)) / 2 + 0.003]}
        rotation={[-lean, 0, 0]}
      >
        {plateText(name)}
      </Text>
    </group>
  );
}

export function Seat({ seat, spot, aspect, order }: { seat: SeatTarget; spot: SeatSpot; aspect: number; order: number }) {
  const appear = useRef(seat.empty ? 0.35 : 0);
  const group = useRef<THREE.Group>(null);
  const sealMat = useMemo(() => {
    const top = new THREE.MeshStandardMaterial({ map: sealTexture(seat.avatar), roughness: 0.5 });
    const side = new THREE.MeshPhysicalMaterial({ color: '#15110f', roughness: 0.3, clearcoat: 1 });
    return [side, top, side];
  }, [seat.avatar]);
  const champGlow = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: softDot(128, 2),
        color: new THREE.Color(PALETTE.kin).multiplyScalar(1.6),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  const dim = seat.empty ? 0.75 : !seat.connected ? 0.7 : seat.out ? 0.35 : 0;

  useFrame((_, dt) => {
    appear.current = damp(appear.current, seat.empty ? 0.35 : 1, 3, dt);
    const g = group.current;
    if (g) {
      g.scale.setScalar(0.6 + 0.4 * appear.current);
      g.position.y = (1 - appear.current) * -0.05;
    }
    const lum = 1 - dim * 0.7;
    sealMat[1]!.color.setScalar(lum);
    champGlow.opacity = damp(champGlow.opacity, seat.champion ? 0.9 : 0, 3, dt);
  });

  // Where things go, in seat-local offsets (x across, z outward from centre).
  const cam = cameraFrame(aspect).position;
  const plateAt = local(spot, 0, 0.3);
  const plateYaw = Math.atan2(cam.x - plateAt[0], cam.z - plateAt[1]);
  // Your own seat flanks the cards you hold up: seal on the left, nods and candle on the right.
  const sealAt = seat.you ? local(spot, -0.95, 0.05) : local(spot, -0.34, 0.14);
  const beadsAt = seat.you ? local(spot, 0.84, 0.02) : local(spot, 0.3, 0.1);
  const candleAt = seat.you ? local(spot, 1.12, 0.12) : local(spot, 0.32, 0.36);
  const stampAt = seat.you ? local(spot, 0.62, -0.42) : local(spot, -0.05, -0.62);

  const showCards = !seat.you && !seat.empty;
  const folded = seat.out && !seat.empty;

  return (
    <group>
      <group ref={group}>
        {!seat.you && !seat.empty && (
          <group position={[plateAt[0], 0, plateAt[1]]}>
            <PlaceCard name={seat.name} dim={dim} yaw={plateYaw} />
          </group>
        )}
        <mesh geometry={SEAL_GEO} material={sealMat} position={[sealAt[0], 0.015, sealAt[1]]} rotation={[0, spot.yaw, 0]} castShadow receiveShadow />
        <mesh material={champGlow} position={[sealAt[0], 0.04, sealAt[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.6, 0.6]} />
        </mesh>
        {!seat.empty && (
          <group position={[beadsAt[0], 0, beadsAt[1]]} rotation={[0, spot.yaw, 0]}>
            <NodBeads count={seat.nods} />
          </group>
        )}
        <group position={[candleAt[0], 0, candleAt[1]]}>
          <Candle lit={seat.locked && seat.connected} />
        </group>
      </group>
      {!seat.empty && <Stamp stance={seat.stance} slipKey={seat.slipKey} position={stampAt} yaw={spot.yaw} />}
      {showCards &&
        seat.cards.map((slot, k) => {
          const glow = seat.glow[k] ?? false;
          const back = folded ? 0.22 : 0;
          const [x, z] = local(spot, (k - 0.5) * 0.3, -0.24 + back);
          const lift = glow ? 0.2 : 0;
          return (
            <Card
              key={k}
              slot={slot}
              position={[x, 0.006 + k * 0.002 + lift, z + (glow ? -0.12 : 0)]}
              rotation={glow ? [-Math.PI / 2 + 0.75, 0, (k - 0.5) * 0.1] : [-Math.PI / 2, 0, spot.yaw + (k - 0.5) * 0.08]}
              scale={glow ? 0.86 : 0.58}
              dim={folded ? 1 : seat.connected ? 0 : 0.5}
              crewGlow={glow}
              dealFrom={[0, 0.9, -1.9]}
              delay={0.05 + order * 0.1 + k * 0.45}
            />
          );
        })}
    </group>
  );
}

export function Seats({ seats, spots, aspect }: { seats: SeatTarget[]; spots: SeatSpot[]; aspect: number }) {
  return (
    <group>
      {seats.map((s, i) => (spots[i] ? <Seat key={s.key} seat={s} spot={spots[i]!} aspect={aspect} order={i} /> : null))}
    </group>
  );
}
