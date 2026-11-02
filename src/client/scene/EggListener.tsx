// The room hears the easter eggs. Nothing here imports UI: eggs arrive as
// `893:egg` CustomEvents on window (see story/eggs.ts), and all this does is
// note the clock time on the shared live bag. The neon, the lantern, the cups
// and the cat each read their own timestamp and react in their own frame loop.

import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { EGG_EVENT, type EggDetail } from '../story/eggs';
import { useLive, type SceneEgg } from './live';

const HEARD: Partial<Record<EggDetail['id'], SceneEgg>> = {
  neon: 'neon',
  'code-893': 'neon',
  lantern: 'lantern',
  kanpai: 'kanpai',
  cat: 'cat',
  'cat-name': 'cat',
  konami: 'konami',
};

export function EggListener() {
  const live = useLive();
  const clock = useThree((s) => s.clock);
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<EggDetail>).detail?.id;
      const egg = id ? HEARD[id] : undefined;
      if (egg) live.eggs[egg] = clock.elapsedTime;
    };
    window.addEventListener(EGG_EVENT, on);
    return () => window.removeEventListener(EGG_EVENT, on);
  }, [live, clock]);
  return null;
}

/** Seconds since an egg fired, or Infinity if it hasn't. */
export function since(live: { eggs: Record<SceneEgg, number> }, egg: SceneEgg, now: number): number {
  const t = live.eggs[egg];
  return t < -1e8 ? Infinity : now - t;
}
