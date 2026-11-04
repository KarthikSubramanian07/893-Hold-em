// Paint and upload the night's textures before the night needs them.
//
// Masks and card faces are painted on canvases and cached, which is cheap on
// a desktop but costs a phone several seconds of dropped frames if it all
// happens at the deal. While the crew sits in the lobby, this paints the
// table's mask, the card backs, and every card face one at a time in idle
// moments, and uploads each to the GPU, so the deal itself only has to draw.

import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type * as THREE from 'three';
import { RANKS, SUITS, type Card, type Difficulty } from '../../engine/types';
import { maskFor } from '../story/masks';
import { cardGlowTexture, cardTexture } from './textures/cards';
import { maskTexture } from './textures/masks';

/** The textures a night at `table` will ask for, most urgent first. */
export function prewarmTasks(table: Difficulty): (() => THREE.Texture)[] {
  const masks = new Set<string>([maskFor(table, 0).id]);
  const cards: Card[] = RANKS.flatMap((r) => SUITS.map((s) => `${r}${s}` as Card));
  return [
    ...[...masks].map((id) => () => maskTexture(id as Parameters<typeof maskTexture>[0])),
    () => cardTexture('back'),
    () => cardTexture('mystery'),
    () => cardTexture('blank'),
    () => cardGlowTexture(),
    ...cards.map((c) => () => cardTexture(c)),
  ];
}

type Idle = (fn: () => void) => void;
const whenIdle: Idle = (fn) => {
  // Safari has no requestIdleCallback; a short timer leaves room for frames.
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(fn, { timeout: 400 });
  else setTimeout(fn, 32);
};

export function Prewarm({ table }: { table: Difficulty }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const tasks = prewarmTasks(table);
    let i = 0;
    let stopped = false;
    const step = () => {
      if (stopped || i >= tasks.length) return;
      const tex = tasks[i++]!();
      gl.initTexture(tex);
      whenIdle(step);
    };
    // Let the first frames of the room land before starting.
    const start = setTimeout(() => whenIdle(step), 1200);
    return () => {
      stopped = true;
      clearTimeout(start);
    };
  }, [gl, table]);
  return null;
}
