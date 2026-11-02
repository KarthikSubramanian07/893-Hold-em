// The night world: 3 a.m. in a Golden Gai bar, printed as a risograph.
//
// Contract: render the whole table for `view` as a full-bleed canvas, animate
// any transition between two views, and never touch the network. Every visual
// target is derived from the view (see derive.ts); components damp toward it.

import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, use, useEffect, useMemo, useRef, useState } from 'react';
import type { GameView } from '../../engine/types';
import { AnchorTracker } from './AnchorTracker';
import { Prewarm } from './Prewarm';
import { CameraRig } from './CameraRig';
import { deriveTargets, type SceneTargets } from './derive';
import { EggListener } from './EggListener';
import { catVisits } from '../story/eggs';
import { Bar } from './parts/Bar';
import { fontsReady } from './fonts';
import { Dust } from './fx/Dust';
import { GoldLeaf } from './fx/GoldLeaf';
import { Post } from './fx/Post';
import { SmokePuff, Smoke } from './fx/Smoke';
import { cameraFrame, seatAnchor, seatLayout, stageLayout, type Vec3 } from './layout';
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
import { Threads } from './parts/Watch';

export interface TableSceneProps {
  view: GameView;
  /** Reduced motion / low power: skip post-processing and long camera moves. */
  quality?: 'low' | 'high';
  /** Force Kyū onto the bar (or off it). Defaults to catVisits(view.code), tonight. */
  cat?: boolean;
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

function World({ targets, high, dpr, cat }: { targets: SceneTargets; high: boolean; dpr: number; cat: boolean }) {
  use(fontsReady());
  const size = useThree((s) => s.size);
  const aspect = size.width / Math.max(1, size.height);
  const spots = useMemo(() => seatLayout(targets.seats.length, aspect), [targets.seats.length, aspect]);
  const stage = useMemo(() => stageLayout(targets.house.length, aspect), [targets.house.length, aspect]);
  const anchors = useMemo(() => {
    const m = new Map<string, Vec3>();
    targets.seats.forEach((s, i) => spots[i] && !s.empty && m.set(s.key, seatAnchor(spots[i]!, s.you)));
    return m;
  }, [targets.seats, spots]);
  const hero = targets.seats.find((s) => s.you && !s.empty);
  const showdown = targets.phase === 'showdown';

  return (
    <>
      <Room />
      <Table />
      <Bar cat={cat} />
      <AnchorTracker anchors={anchors} />
      <Lantern shadows rest={stage.lantern} />
      <House house={targets.house} spots={stage.masks} scale={stage.scale} anchors={anchors} />
      <RuleCard rule={targets.rule} position={[stage.rule.x, stage.rule.y, stage.rule.z]} />
      <Board board={targets.board} showdown={showdown} />
      <Seats seats={targets.seats} spots={spots} aspect={aspect} masks={targets.house.map((h) => h.mask)} />
      <Threads seats={targets.seats} house={targets.house} anchors={anchors} />
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

export function TableScene({ view, quality = 'high', cat }: TableSceneProps) {
  const targets = useMemo(() => deriveTargets(view), [view]);
  const catTonight = useMemo(() => cat ?? catVisits(view.code), [cat, view.code]);
  const reduced = usePrefersReducedMotion();
  // One mutable bag of per-frame values, shared down the tree.
  const [live] = useState(() => createLive(targets, reduced));
  live.targets = targets;
  live.reducedMotion = reduced;
  const [dpr, setDpr] = useState(() => Math.min(1.75, Math.max(1, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)));
  const [degraded, setDegraded] = useState(false);
  const swings = useRef(0);
  const full = Math.min(1.75, Math.max(1, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1));
  /** Move between full and 1x sharpness; after four real swings, settle at 1x for good. */
  const sharpen = (up: boolean, fps = 60) => {
    if (swings.current >= 4) return;
    if (up) {
      setDegraded(false);
      setDpr((d) => {
        if (d < full) swings.current++;
        return full;
      });
    } else {
      // Only drop the post stack when the machine truly can't keep up.
      if (fps < 20) setDegraded(true);
      setDpr((d) => {
        if (d > 1) swings.current++;
        return 1;
      });
    }
  };
  // The deal builds the masks, cards, and their shaders, which stalls a few
  // frames on every device. Judge performance only once that has settled,
  // counted from the start of each night, so a phone isn't marked slow
  // (blurry, no bloom) for the whole night by its first seconds.
  const [watching, setWatching] = useState(false);
  const settleKey = view.phase === 'lobby' ? 'lobby' : `night-${view.night}`;
  useEffect(() => {
    setWatching(false);
    const t = setTimeout(() => setWatching(true), 6000);
    return () => clearTimeout(t);
  }, [settleKey]);
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
          {watching && (
            <PerformanceMonitor
              // Judge against the screen's real rate (drei takes the best rate it
              // has seen): iPhones in Low Power Mode and many tablets run the
              // page at 30fps by design, and frame rates jitter, so only a
              // sustained slump below 60% of that rate counts as struggling.
              bounds={(refresh) => [Math.min(40, refresh * 0.6), Math.min(57, refresh * 0.85)]}
              // drei counts every incline as a flip, even when the scene is
              // already at full sharpness, and gives up after a few. A steady,
              // healthy phone would end up locked blurry; count real changes.
              onIncline={() => sharpen(true)}
              onDecline={({ fps }) => sharpen(false, fps)}
            />
          )}
          <color attach="background" args={['#070606']} />
          <fog attach="fog" args={['#0a0807', 7, 18]} />
          <ambientLight intensity={0.05} color="#8aa0c8" />
          <hemisphereLight args={['#2a3a5a', '#1a0f08', 0.12]} />
          <Prewarm table={view.config.difficulty} />
          <LiveDriver />
          <EggListener />
          <CameraRig />
          <Suspense fallback={null}>
            <World targets={targets} high={high} dpr={dpr} cat={catTonight} />
          </Suspense>
          {high && <Post />}
        </LiveContext.Provider>
      </Canvas>
    </div>
  );
}
