// The crew's side of the table. Each seat gets a washi place card with a
// name, a round avatar seal, its hole cards, a stack of lacquer stake tokens,
// a candle that lights when the call is locked, and a stamped slip for the
// latest call.

import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { MAX_STAKE } from '../../../engine/rules';
import { plateText } from '../cardInfo';
import type { SeatTarget } from '../derive';
import { PLATE_FONT } from '../fonts';
import { cameraFrame, seatLocal as local, type SeatSpot } from '../layout';
import { damp, useLive } from '../live';
import { PALETTE } from '../palette';
import { softDot } from '../textures/canvas';
import { flameTexture, sealTexture, stampTexture, tokenTexture } from '../textures/marks';
import { maskTagTexture } from '../textures/masks';
import type { MaskId } from '../../story/types';
import { MASK_TAG as MASK_TAGS, type MASK_TAG } from '../watch';
import { Card } from './Card';
import { SeenMark } from './Watch';

type Tag = (typeof MASK_TAG)[keyof typeof MASK_TAG];

const TOKEN_R = 0.07;
const TOKEN_H = 0.022;
const TOKEN_GEO = new THREE.CylinderGeometry(TOKEN_R, TOKEN_R, TOKEN_H, 40);
const SEAL_GEO = new THREE.CylinderGeometry(0.085, 0.085, 0.03, 40);
const STAMP_GEO = new THREE.PlaneGeometry(0.3, 0.3);

function Tokens({ stake, appear }: { stake: number | null; appear: number }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const cup = useRef<THREE.Mesh>(null);
  const mats = useMemo(() => {
    const side = new THREE.MeshPhysicalMaterial({ color: '#b8331d', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
    const top = new THREE.MeshPhysicalMaterial({ map: tokenTexture(), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
    return [side, top, top];
  }, []);
  const ys = useRef<number[]>(Array.from({ length: MAX_STAKE }, () => 0.6));
  useFrame((_, dt) => {
    const n = stake ?? 1;
    for (let i = 0; i < MAX_STAKE; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const on = i < n && appear > 0.5;
      const target = on ? TOKEN_H / 2 + i * (TOKEN_H + 0.002) : 0.7;
      // Tokens fall fast and land with a clack; they leave gently.
      ys.current[i] = damp(ys.current[i]!, target, on ? 11 : 3, dt);
      m.position.y = ys.current[i]!;
      m.visible = ys.current[i]! < 0.6;
      m.rotation.y = i * 0.7;
    }
    if (cup.current) {
      const s = damp(cup.current.scale.x, stake === null && appear > 0.5 ? 1 : 0.001, 6, dt);
      cup.current.scale.setScalar(s);
      cup.current.visible = s > 0.01;
    }
  });
  return (
    <group>
      {Array.from({ length: MAX_STAKE }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m;
          }}
          geometry={TOKEN_GEO}
          material={mats}
          castShadow
          receiveShadow
          visible={false}
        />
      ))}
      {/* Under Hush, an upturned lacquer cup hides the stack. */}
      <mesh ref={cup} position={[0, 0.06, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.095, 0.12, 32]} />
        <meshPhysicalMaterial color="#0d0b0a" roughness={0.25} clearcoat={1} />
      </mesh>
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

/** The washi slip for the latest call: it drops onto the felt when revealed. */
function Stamp({ mark, position, yaw }: { mark: SeatTarget['lastCall']; position: [number, number]; yaw: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const st = useRef({ key: mark?.key ?? '', born: -10, y: 0.0015, spin: 0, opacity: mark ? 0.62 : 0 });
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    [],
  );
  const stance = mark?.stance ?? null;
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

/** A tiny hanko in the watching mask's colour, so you can tell whose eyes are on you. */
function TagMark({ tag, position, rotation, size, dim }: { tag: Tag; position: [number, number, number]; rotation: [number, number, number]; size: number; dim: number }) {
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ map: maskTagTexture(tag.kanji, tag.color, tag.ink), transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    [tag],
  );
  mat.color.setScalar(1 - dim * 0.6);
  return (
    <mesh material={mat} position={position} rotation={rotation}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}

function PlaceCard({ name, dim, yaw, tag, seen }: { name: string; dim: number; yaw: number; tag: Tag | null; seen: SeatTarget['seen'] }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#efe6d3', roughness: 0.85, side: THREE.DoubleSide }), []);
  mat.color.set('#efe6d3').multiplyScalar(1 - dim * 0.65);
  const W = 0.46;
  const H = 0.14;
  const lean = 0.32;
  const face = (x: number, y: number, out: number): [number, number, number] => [x, y * Math.cos(lean), y * Math.sin(lean) + out];
  return (
    <group rotation={[0, yaw, 0]}>
      {tag && <TagMark tag={tag} dim={dim} size={0.075} position={face(W / 2 - 0.048, H / 2 + 0.002, 0.006)} rotation={[-lean, 0, 0]} />}
      <SeenMark seen={seen} at={[0, -0.28]} stampAt={face(-W / 2 + 0.07, H / 2 + 0.01, 0.012)} stampRot={[-lean, 0, -0.12]} you={false} />
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
        maxWidth={tag ? W * 0.72 : W * 0.92}
        position={[tag ? -0.03 : 0, (H / 2) * Math.cos(lean), (H * Math.sin(lean)) / 2 + 0.003]}
        rotation={[-lean, 0, 0]}
      >
        {plateText(name)}
      </Text>
    </group>
  );
}

export function Seat({ seat, spot, aspect, order, tag }: { seat: SeatTarget; spot: SeatSpot; aspect: number; order: number; tag: Tag | null }) {
  const live = useLive();
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

  const dim = seat.empty ? 0.75 : !seat.connected ? 0.7 : !seat.active ? 0.35 : 0;

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
  // Your own seat flanks the cards you hold up: seal on the left, stake and candle on the right.
  const sealAt = seat.you ? local(spot, -0.95, 0.05) : local(spot, -0.34, 0.14);
  const tokensAt = seat.you ? local(spot, 0.86, 0.02) : local(spot, 0.34, 0.12);
  const candleAt = seat.you ? local(spot, 1.12, 0.12) : local(spot, 0.32, 0.36);
  const stampAt = seat.you ? local(spot, 0.62, -0.42) : local(spot, -0.05, -0.62);

  const showCards = !seat.you && !seat.empty;
  const folded = !seat.active && !seat.empty;

  return (
    <group>
      <group ref={group}>
        {!seat.you && !seat.empty && (
          <group position={[plateAt[0], 0, plateAt[1]]}>
            <PlaceCard name={seat.name} dim={dim} yaw={plateYaw} tag={tag} seen={seat.seen} />
          </group>
        )}
        <mesh geometry={SEAL_GEO} material={sealMat} position={[sealAt[0], 0.015, sealAt[1]]} rotation={[0, spot.yaw, 0]} castShadow receiveShadow />
        {seat.you && tag && <TagMark tag={tag} dim={dim} size={0.11} position={[sealAt[0] + 0.1, 0.034, sealAt[1] - 0.1]} rotation={[-Math.PI / 2, 0, -0.1]} />}
        <mesh material={champGlow} position={[sealAt[0], 0.04, sealAt[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.6, 0.6]} />
        </mesh>
        {!seat.empty && (
          <group position={[tokensAt[0], 0, tokensAt[1]]}>
            <Tokens stake={seat.stake} appear={live.targets.phase === 'lobby' ? 0 : 1} />
          </group>
        )}
        <group position={[candleAt[0], 0, candleAt[1]]}>
          <Candle lit={seat.locked && seat.connected} />
        </group>
      </group>
      {!seat.empty && <Stamp mark={seat.lastCall} position={stampAt} yaw={spot.yaw} />}
      {seat.you && <SeenMark seen={seat.seen} at={sealAt} stampAt={[sealAt[0] + 0.02, 0.05, sealAt[1] - 0.2]} stampRot={[-Math.PI / 2, 0, 0.12]} you />}
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

export function Seats({ seats, spots, aspect, masks }: { seats: SeatTarget[]; spots: SeatSpot[]; aspect: number; masks: readonly MaskId[] }) {
  return (
    <group>
      {seats.map((s, i) => {
        const m = s.watcher === null ? undefined : masks[s.watcher];
        return spots[i] ? <Seat key={s.key} seat={s} spot={spots[i]!} aspect={aspect} order={i} tag={m ? MASK_TAGS[m] : null} /> : null;
      })}
    </group>
  );
}
