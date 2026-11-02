// Six small gestures, allowed only when the cards are down.
import { useEffect, useRef, useState } from 'react';
import type { GameView } from '../../engine/types';
import { REACTIONS, type Reaction } from '../../protocol';
import { sfx } from '../audio';
import { canReact } from '../net/selectors';
import { useTable } from '../net/store';
import { REACTION_LABEL, ReactionGlyph } from '../ui/glyphs';

const LIFE = 2600;

export function ReactionsTray({ view }: { view: GameView }) {
  const send = useTable((s) => s.send);
  const last = useRef(0);
  if (!canReact(view) || !view.you) return null;
  const react = (r: Reaction) => {
    const t = Date.now();
    if (t - last.current < 700) return;
    last.current = t;
    sfx.unlock();
    sfx.click();
    send({ t: 'react', reaction: r });
  };
  return (
    <div className="tray" role="toolbar" aria-label="Reactions">
      {REACTIONS.map((r) => (
        <button key={r} type="button" className="tray__btn" onClick={() => react(r)} aria-label={REACTION_LABEL[r]} title={REACTION_LABEL[r]}>
          <ReactionGlyph reaction={r} size={22} />
        </button>
      ))}
    </div>
  );
}

/** Incoming reactions drift up from their seat's spot along the rail. */
export function ReactionFloats({ view }: { view: GameView }) {
  const reactions = useTable((s) => s.reactions);
  const [now, setNow] = useState(() => Date.now());
  const live = reactions.filter((r) => now - r.at < LIFE);

  useEffect(() => {
    if (!reactions.length) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [reactions]);

  if (!live.length) return null;
  const n = Math.max(1, view.seats.length);
  return (
    <div className="floats" aria-live="polite">
      {live.map((r) => {
        const idx = view.seats.findIndex((s) => s.id === r.seat);
        const seat = view.seats[idx];
        const left = ((Math.max(0, idx) + 0.5) / n) * 100;
        return (
          <div key={r.id} className="float" style={{ left: `${left}%`, ['--drift' as string]: `${((r.id * 37) % 40) - 20}px` }}>
            <ReactionGlyph reaction={r.reaction} size={34} strokeWidth={1.8} />
            <span className="float__who">{seat?.name ?? 'Someone'}</span>
            <span className="sr-only">
              {seat?.name ?? 'Someone'}: {REACTION_LABEL[r.reaction]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
