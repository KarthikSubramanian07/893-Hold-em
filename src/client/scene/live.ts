// Per-frame shared state. Targets come from the view; the smoothed values are
// damped once per frame by <LiveDriver> and read by anything that needs them
// (the window shader, the lights, the post effects).

import { createContext, useContext } from 'react';
import * as THREE from 'three';
import type { SceneTargets } from './derive';

export interface Live {
  targets: SceneTargets;
  reducedMotion: boolean;
  /** Smoothed 0..1 values. */
  heat: number;
  neon: number;
  police: number;
  haze: number;
  lantern: number;
  /** A short-lived 0..1 surge when the House wins a hand. */
  surge: number;
  /** World position of the lantern bulb, updated as it sways. */
  lanternPos: THREE.Vector3;
}

export function createLive(targets: SceneTargets, reducedMotion: boolean): Live {
  return {
    targets,
    reducedMotion,
    heat: targets.heat,
    neon: targets.neon,
    police: targets.police,
    haze: 0,
    lantern: targets.lantern,
    surge: 0,
    lanternPos: new THREE.Vector3(0, 2.0, -0.5),
  };
}

export const LiveContext = createContext<Live | null>(null);

export function useLive(): Live {
  const live = useContext(LiveContext);
  if (!live) throw new Error('useLive must be used inside <TableScene>');
  return live;
}

/** Frame-rate independent damping with a capped step, so a stalled tab never jumps. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.damp(current, target, lambda, Math.min(dt, 0.05));
}

export function dampVec(v: THREE.Vector3, x: number, y: number, z: number, lambda: number, dt: number): void {
  v.set(damp(v.x, x, lambda, dt), damp(v.y, y, lambda, dt), damp(v.z, z, lambda, dt));
}

/** Damp toward an angle along the short way round. */
export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let d = target - current;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return damp(current, current + d, lambda, dt);
}
