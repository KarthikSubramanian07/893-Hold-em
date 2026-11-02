// The night world: 3 a.m. in a Golden Gai bar, printed as a risograph.
//
// Contract: render the whole table for `view` as a full-bleed canvas, animate
// any transition between two views, and never touch the network. Every visual
// target is derived from the view (see derive.ts); components damp toward it.

import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, use, useEffect, useMemo, useState } from 'react';
import type { GameView } from '../../engine/types';
import { CameraRig } from './CameraRig';
import { deriveTargets, type SceneTargets } from './derive';
import { fontsReady } from './fonts';
import { Dust } from './fx/Dust';
import { GoldLeaf } from './fx/GoldLeaf';
import { Post } from './fx/Post';
import { SmokePuff, Smoke } from './fx/Smoke';
import { cameraFrame, seatLayout } from './layout';
import { createLive, LiveContext } from './live';
import { LiveDriver } from './LiveDriver';
import { PALETTE } from './palette';
import { Board } from './parts/Board';
import { HeroCards } from './parts/HeroCards';
import { Lantern } from './parts/Lantern';
import { House } from './parts/Masks';
import { Room } from './parts/Room';
import { RuleCard } from './parts/RuleCard';
import { Seats } from './parts/Seats';
import { Table } from './parts/Table';

export interface TableSceneProps {
  view: GameView;
  /** Reduced motion / low power: skip post-processing and long camera moves. */
  quality?: 'low' | 'high';
}

function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

function World({ targets, high, dpr }: { targets: SceneTargets; high: boolean; dpr: number }) {
  use(fontsReady());
  const size = useThree((s) => s.size);
  const aspect = size.width / Math.max(1, size.height);
  const spots = useMemo(() => seatLayout(targets.seats.length, aspect), [targets.seats.length, aspect]);
  const hero = targets.seats.find((s) => s.you && !s.empty);
  const showdown = targets.phase === 'showdown';

  return (
    <>
      <Room />
      <Table />
      <Lantern shadows aspect={aspect} />
      <House house={targets.house} aspect={aspect} />
      <RuleCard rule={targets.rule} position={[0, 0.44, -1.42]} />
      <Board board={targets.board} showdown={showdown} />
      <Seats seats={targets.seats} spots={spots} aspect={aspect} />
      <HeroCards cards={targets.heroCards} glow={targets.heroGlow} folded={!!hero && !hero.active && targets.phase === 'call'} />
      <Dust dpr={dpr} />
      <Smoke />
      <SmokePuff on={showdown && targets.outcome === 'tie'} />
      <GoldLeaf on={(showdown && targets.outcome === 'crew') || targets.verdict === 'clean'} />
      {high && (
        <Environment resolution={64} frames={1} environmentIntensity={0.45}>
          <Lightformer form="circle" intensity={3} color="#ffc27a" position={[0, 4, -0.3]} scale={1.2} />
          <Lightformer form="rect" intensity={1.1} color={PALETTE.neon} position={[2, 2.4, -5]} scale={[3, 1.5, 1]} />
          <Lightformer form="rect" intensity={0.8} color={PALETTE.teal} position={[-2.5, 2.6, -5]} scale={[2.5, 1.2, 1]} />
          <Lightformer form="rect" intensity={0.4} color="#ffffff" position={[0, 2, 6]} scale={[6, 2, 1]} />
        </Environment>
      )}
    </>
  );
}

export function TableScene({ view, quality = 'high' }: TableSceneProps) {
  const targets = useMemo(() => deriveTargets(view), [view]);
  const reduced = usePrefersReducedMotion();
  // One mutable bag of per-frame values, shared down the tree.
  const [live] = useState(() => createLive(targets, reduced));
  live.targets = targets;
  live.reducedMotion = reduced;
  const [dpr, setDpr] = useState(() => Math.min(1.75, Math.max(1, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)));
  const [degraded, setDegraded] = useState(false);
  const high = quality === 'high' && !degraded;
  const initial = useMemo(() => cameraFrame(typeof window === 'undefined' ? 1.6 : window.innerWidth / Math.max(1, window.innerHeight)), []);

  return (
    <div style={{ position: 'absolute', inset: 0, background: PALETTE.sumi }}>
      <Canvas
        shadows="percentage"
        dpr={dpr}
        camera={{ fov: initial.fov, near: 0.1, far: 40, position: [initial.position.x, initial.position.y, initial.position.z] }}
        gl={{ antialias: !high, powerPreference: 'high-performance', stencil: false }}
        aria-label="The table"
      >
        <LiveContext.Provider value={live}>
          <PerformanceMonitor
            bounds={() => [45, 59]}
            flipflops={3}
            onIncline={() => setDpr(Math.min(1.75, Math.max(1, window.devicePixelRatio || 1)))}
            onDecline={({ fps }) => {
              setDpr(1);
              // Only drop the post stack when the machine truly can't keep up.
              if (fps < 24) setDegraded(true);
            }}
            onFallback={() => setDpr(1)}
          />
          <color attach="background" args={['#070606']} />
          <fog attach="fog" args={['#0a0807', 7, 18]} />
          <ambientLight intensity={0.05} color="#8aa0c8" />
          <hemisphereLight args={['#2a3a5a', '#1a0f08', 0.12]} />
          <LiveDriver />
          <CameraRig />
          <Suspense fallback={null}>
            <World targets={targets} high={high} dpr={dpr} />
          </Suspense>
          {high && <Post />}
        </LiveContext.Provider>
      </Canvas>
    </div>
  );
}
