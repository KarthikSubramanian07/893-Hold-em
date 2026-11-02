// Damps the shared scene values toward the view's targets once per frame.

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { damp, useLive } from './live';

export function LiveDriver() {
  const live = useLive();
  const lastOutcome = useRef(live.targets.outcome);
  useFrame((_, dt) => {
    const t = live.targets;
    if (t.outcome !== lastOutcome.current) {
      if (t.outcome === 'house') live.surge = 1.4;
      lastOutcome.current = t.outcome;
    }
    live.heat = damp(live.heat, t.heat, 1.5, dt);
    live.neon = damp(live.neon, t.neon, 1.2, dt);
    live.police = damp(live.police, t.police, 1.5, dt);
    live.haze = damp(live.haze, t.haze, 1.4, dt);
    live.lantern = damp(live.lantern, t.lantern, 1.6, dt);
    live.surge = damp(live.surge, t.outcome === 'house' ? 0.35 : 0, 0.9, dt);
  });
  return null;
}
