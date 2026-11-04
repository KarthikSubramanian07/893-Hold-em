// Per-frame shared state. Targets come from the view; the smoothed values are
// damped once per frame by <LiveDriver> and read by anything that needs them
// (the window shader, the lights, the post effects).

import { createContext, useContext } from 'react';
import * as THREE from 'three';
import type { SceneTargets } from './derive';

export interface Live {
  targets: SceneTargets;
  reducedMotion: boolean;
  /** Smoothed 0..1 values. Danger: how close the marker is to the sirens. */
  danger: number;
  neon: number;
  police: number;
  haze: number;
  lantern: number;
  /** A short-lived 0..1 surge when the House wins a hand. */
  surge: number;
  /** World position of the lantern bulb, updated as it sways. */
  lanternPos: THREE.Vector3;
  /** Clock time the current showdown began, or -1 outside one. */
  showdownAt: number;
  /** World position between each mask's eyes, updated as the heads turn. */
  maskEyes: THREE.Vector3[];
  /** Clock time each easter egg last fired (see story/eggs.ts), -1e9 if never. */
  eggs: Record<SceneEgg, number>;
  /** A push for the lantern (radians per second), consumed by the lantern. */
  lanternKick: number;
}

/** The eggs the room itself reacts to. */
export type SceneEgg = 'neon' | 'lantern' | 'kanpai' | 'cat' | 'konami';

/** How long after the showdown starts the House turns to stare down its seat, in seconds. */
export const SEEN_DELAY = 1.5;

export function createLive(targets: SceneTargets, reducedMotion: boolean): Live {
  return {
    targets,
    reducedMotion,
    danger: targets.danger,
    neon: targets.neon,
    police: targets.police,
    haze: 0,
    lantern: targets.lantern,
    surge: 0,
    lanternPos: new THREE.Vector3(0, 2.0, -0.5),
    showdownAt: -1,
    maskEyes: Array.from({ length: 6 }, () => new THREE.Vector3(0, 1, -1.9)),
    eggs: { neon: -1e9, lantern: -1e9, kanpai: -1e9, cat: -1e9, konami: -1e9 },
    lanternKick: 0,
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
