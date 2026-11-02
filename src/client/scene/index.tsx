// STUB. The night-world table scene replaces this file.
// Contract: render the whole table for `view` as a full-bleed canvas. Must
// animate any transition between two views (deal, flip, fold, reveal) and
// never block on assets from the network.
import type { GameView } from '../../engine/types';

export interface TableSceneProps {
  view: GameView;
  /** Reduced motion / low power: skip post-processing and long camera moves. */
  quality?: 'low' | 'high';
}

export function TableScene({ view }: TableSceneProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#1b1a17', color: '#efe8da', display: 'grid', placeItems: 'center' }}>
      table {view.code} · {view.phase}
    </div>
  );
}
