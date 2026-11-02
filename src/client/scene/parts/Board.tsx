// The five community cards. They deal from the House's side of the table and
// lift toward you at the showdown when they belong to a champion's best five.

import type { BoardTarget } from '../derive';
import { boardSpot } from '../layout';
import { Card } from './Card';

export function Board({ board, showdown }: { board: BoardTarget[]; showdown: boolean }) {
  return (
    <group>
      {board.map((b, i) => {
        const p = boardSpot(i);
        const hot = showdown && (b.crew || b.house);
        return (
          <Card
            key={i}
            slot={b.slot}
            position={[p.x, hot ? 0.14 : 0.006, p.z + (hot ? 0.12 : 0)]}
            rotation={[-Math.PI / 2 + (hot ? 0.42 : 0), 0, 0]}
            crewGlow={showdown && b.crew}
            houseGlow={showdown && b.house}
            dim={showdown && !hot ? 0.45 : 0}
            dealFrom={[0, 0.8, -1.8]}
            delay={0.6 + (i < 3 ? i * 0.14 : 0)}
          />
        );
      })}
    </group>
  );
}
