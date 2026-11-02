// The black urushi oval, its gold maki-e rim, the indigo sashiko felt, and a
// few things people leave on a bar table at 3 a.m.

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BOARD_Z, TABLE } from '../layout';
import { useLive } from '../live';
import { PALETTE } from '../palette';
import { softDot } from '../textures/canvas';
import { boardSlotsTexture, FELT_TILE, feltTexture, lacquerTexture } from '../textures/surfaces';

function ellipseShape(rx: number, rz: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
  return s;
}

/** A flat ellipse in the XZ plane with UVs normalised across its bounds. */
function flatEllipse(rx: number, rz: number, segments = 128): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(ellipseShape(rx, rz), segments);
  const pos = g.attributes.position!;
  const uv = g.attributes.uv!;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + rx) / (2 * rx), (pos.getY(i) + rz) / (2 * rz));
  }
  g.rotateX(-Math.PI / 2);
  return g;
}

function ellipseRing(rx: number, rz: number, width: number, segments = 160): THREE.BufferGeometry {
  const outer = ellipseShape(rx + width / 2, rz + width / 2);
  const hole = new THREE.Path();
  hole.absellipse(0, 0, rx - width / 2, rz - width / 2, 0, Math.PI * 2, true, 0);
  outer.holes.push(hole);
  const g = new THREE.ShapeGeometry(outer, segments);
  g.rotateX(-Math.PI / 2);
  return g;
}

export function Table() {
  const geo = useMemo(() => {
    const body = new THREE.ExtrudeGeometry(ellipseShape(TABLE.rx - 0.05, TABLE.rz - 0.05), {
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.05,
      bevelSegments: 6,
      curveSegments: 96,
    });
    body.rotateX(Math.PI / 2);
    body.translate(0, -0.04, 0);
    return {
      body,
      top: flatEllipse(TABLE.rx, TABLE.rz),
      felt: flatEllipse(TABLE.feltRx, TABLE.feltRz),
      rim: ellipseRing(TABLE.feltRx + 0.025, TABLE.feltRz + 0.025, 0.022),
      rimShadow: ellipseRing(TABLE.feltRx + 0.06, TABLE.feltRz + 0.06, 0.05),
    };
  }, []);

  const mats = useMemo(() => {
    const felt = feltTexture();
    const tileUnits = 1.25;
    felt.repeat.set((TABLE.feltRx * 2) / tileUnits, (TABLE.feltRz * 2) / ((tileUnits * FELT_TILE.h) / FELT_TILE.w));
    return {
      lacquer: new THREE.MeshPhysicalMaterial({
        color: '#ffffff',
        map: lacquerTexture(),
        roughness: 0.32,
        metalness: 0.1,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
      }),
      body: new THREE.MeshPhysicalMaterial({ color: PALETTE.urushi, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }),
      felt: new THREE.MeshStandardMaterial({ map: felt, roughness: 0.96, metalness: 0, color: '#d6dcea' }),
      rim: new THREE.MeshStandardMaterial({
        color: PALETTE.kin,
        metalness: 1,
        roughness: 0.28,
        emissive: new THREE.Color(PALETTE.kin),
        emissiveIntensity: 0.35,
      }),
      rimShadow: new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }),
      slots: new THREE.MeshBasicMaterial({ map: boardSlotsTexture(), transparent: true, depthWrite: false, opacity: 0.8 }),
    };
  }, []);

  return (
    <group>
      <mesh geometry={geo.body} material={mats.body} receiveShadow castShadow />
      <mesh geometry={geo.top} material={mats.lacquer} position={[0, 0.0005, 0]} receiveShadow />
      <mesh geometry={geo.felt} material={mats.felt} position={[0, 0.002, 0]} receiveShadow />
      <mesh geometry={geo.rimShadow} material={mats.rimShadow} position={[0, 0.0025, 0]} />
      <mesh geometry={geo.rim} material={mats.rim} position={[0, 0.003, 0]} />
      <mesh material={mats.slots} position={[0, 0.0035, BOARD_Z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.2, 0.9]} />
      </mesh>
      <Ashtray position={[1.42, 0, 0.98]} />
      <SakeSet position={[-1.85, 0, -0.95]} />
    </group>
  );
}

/** A ceramic ashtray with a cigarette left burning. The smoke rises from here. */
export const CIGARETTE_TIP = new THREE.Vector3(1.53, 0.055, 0.95);

function Ashtray({ position }: { position: [number, number, number] }) {
  const ember = useRef<THREE.Mesh>(null);
  const live = useLive();
  const emberMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: softDot(64, 1.6),
        color: new THREE.Color(PALETTE.sodium).multiplyScalar(4),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const breath = live.reducedMotion ? 0.8 : 0.65 + 0.35 * Math.pow(Math.sin(t * 0.7) * 0.5 + 0.5, 3);
    emberMat.opacity = breath;
    ember.current?.scale.setScalar(0.05 + breath * 0.03);
  });
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 0.025, 0]}>
        <cylinderGeometry args={[0.15, 0.13, 0.05, 40]} />
        <meshStandardMaterial color="#d9d2c4" roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.051, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.115, 40]} />
        <meshStandardMaterial color="#3a3530" roughness={1} />
      </mesh>
      {/* the cigarette, resting on the rim */}
      <group position={[0.05, 0.06, -0.02]} rotation={[0, 0.5, 0.08]}>
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.009, 0.009, 0.16, 12]} />
          <meshStandardMaterial color="#f4efe6" roughness={0.8} />
        </mesh>
        <mesh position={[-0.06, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.0095, 0.0095, 0.045, 12]} />
          <meshStandardMaterial color="#c98a4a" roughness={0.8} />
        </mesh>
        <mesh ref={ember} position={[0.082, 0, 0]} material={emberMat}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      </group>
    </group>
  );
}

/** A tokkuri and two choko cups, one tipped over. */
function SakeSet({ position }: { position: [number, number, number] }) {
  const tokkuri = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const y = t * 0.3;
      const body = 0.075 * Math.sin(Math.PI * Math.min(1, t * 1.25)) + 0.02;
      const neck = t > 0.75 ? 0.02 + (t - 0.9) * (t > 0.9 ? 0.25 : 0) : body;
      pts.push(new THREE.Vector2(Math.max(0.015, t > 0.75 ? neck : body), y));
    }
    return new THREE.LatheGeometry(pts, 40);
  }, []);
  return (
    <group position={position}>
      <mesh geometry={tokkuri} castShadow receiveShadow>
        <meshPhysicalMaterial color="#e8e1d2" roughness={0.25} clearcoat={0.8} />
      </mesh>
      <mesh position={[0.2, 0.025, 0.08]} castShadow>
        <cylinderGeometry args={[0.04, 0.028, 0.05, 28, 1, true]} />
        <meshStandardMaterial color="#1f2a3d" roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0.12, 0.022, 0.22]} rotation={[Math.PI / 2.3, 0, 0.6]} castShadow>
        <cylinderGeometry args={[0.04, 0.028, 0.05, 28, 1, true]} />
        <meshStandardMaterial color="#1f2a3d" roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
