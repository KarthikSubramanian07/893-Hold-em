// A slip of washi drops in, and a hanko presses onto it. One stamp at a time,
// from the matchbook's queue unless a stamp is passed in directly.

import { useEffect, useState } from 'react';
import { sfx } from '../audio';
import { useReducedMotion } from './motion';
import { Seal } from './Seal';
import { STAMP, type StampId, useMatchbook } from './stamps';

export interface StampToastProps {
  /** Show this stamp instead of reading the matchbook's queue. */
  stamp?: StampId | null;
  /** How long the slip stays, in ms. */
  duration?: number;
  onDone?: () => void;
  /** Play the hanko thunk. Default true. */
  sound?: boolean;
  className?: string;
}

const PRESS_AT = 420;

export function StampToast({ stamp, duration = 4200, onDone, sound = true, className }: StampToastProps) {
  const queued = useMatchbook((s) => s.toasts[0] ?? null);
  const dismiss = useMatchbook((s) => s.dismiss);
  const id = stamp === undefined ? queued : stamp;
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<'in' | 'pressed' | 'out'>('in');

  useEffect(() => {
    if (!id) return;
    setPhase('in');
    const t = [
      setTimeout(
        () => {
          setPhase('pressed');
          if (sound) sfx.stamp();
        },
        reduced ? 0 : PRESS_AT,
      ),
      setTimeout(() => setPhase('out'), duration),
      setTimeout(() => {
        if (stamp === undefined) dismiss();
        onDone?.();
      }, duration + 600),
    ];
    return () => t.forEach(clearTimeout);
    // A new id restarts the slip; callbacks are read fresh each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!id) return null;
  const s = STAMP[id];
  return (
    <div className={['stamp-toast', className].filter(Boolean).join(' ')} data-phase={phase} role="status">
      <div className="stamp-toast__slip">
        <span className="stamp-toast__label">押印 · A new stamp</span>
        <span className="stamp-toast__name">{s.name}</span>
        <span className="stamp-toast__verse">{s.verse}</span>
        <span className="stamp-toast__bed" aria-hidden="true">
          <span className="stamp-toast__bleed" />
          <span className="stamp-toast__seal">
            <Seal text={s.kanji} shape={s.shape} size={76} />
          </span>
        </span>
      </div>
    </div>
  );
}
