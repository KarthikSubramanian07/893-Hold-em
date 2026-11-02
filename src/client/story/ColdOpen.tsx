// The first thing anyone sees: an alley in the rain, a neon sign through wet
// glass, four lines, one seal. Any key or tap skips it, and the matchbook
// remembers it played so it only ever plays once (unless asked).

import { useCallback, useEffect, useRef, useState } from 'react';
import { COLD_OPEN, type ColdOpenBeat } from './lines';
import { useReducedMotion } from './motion';
import { Rain } from './Rain';
import { Seal } from './Seal';
import { useMatchbook } from './stamps';

export interface ColdOpenProps {
  onDone: () => void;
  beats?: readonly ColdOpenBeat[];
  /** Fill the parent instead of the viewport (for the lab). */
  contained?: boolean;
}

/** Should the cold open play for this browser? */
export function shouldPlayColdOpen(): boolean {
  return !useMatchbook.getState().data.coldOpen;
}

const IN_MS = 900;
const OUT_MS = 700;

export function ColdOpen({ onDone, beats = COLD_OPEN, contained = false }: ColdOpenProps) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [sealed, setSealed] = useState(false);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    useMatchbook.getState().sawColdOpen();
    setLeaving(true);
    setTimeout(onDone, reduced ? 0 : 900);
  }, [onDone, reduced]);

  // Walk the beats.
  useEffect(() => {
    const beat = beats[index];
    if (!beat) {
      finish();
      return;
    }
    const t: ReturnType<typeof setTimeout>[] = [];
    t.push(setTimeout(() => setVisible(true), index === 0 ? 700 : 60));
    if (beat.seal) t.push(setTimeout(() => setSealed(true), 500));
    t.push(setTimeout(() => setVisible(false), IN_MS + beat.hold));
    t.push(setTimeout(() => setIndex((i) => i + 1), IN_MS + beat.hold + OUT_MS));
    return () => t.forEach(clearTimeout);
  }, [index, beats, finish]);

  // Any key, any tap.
  useEffect(() => {
    const skip = (e: Event) => {
      if (e instanceof KeyboardEvent && (e.metaKey || e.ctrlKey || e.altKey)) return;
      // The key only opens the door; it shouldn't also scroll the page behind it.
      if (e instanceof KeyboardEvent && e.key !== 'Tab') e.preventDefault();
      finish();
    };
    addEventListener('keydown', skip);
    return () => removeEventListener('keydown', skip);
  }, [finish]);

  const beat = beats[Math.min(index, beats.length - 1)]!;
  return (
    <div
      className={['cold-open', contained ? 'cold-open--contained' : ''].join(' ')}
      data-leaving={leaving || undefined}
      onPointerDown={finish}
      role="dialog"
      aria-label="Bar 893"
    >
      <div className="cold-open__street" aria-hidden="true">
        <div className="cold-open__window">
          <span className="cold-open__neon">八九三</span>
          <span className="cold-open__neon-sub">BAR · 2F</span>
        </div>
        <div className="cold-open__lantern" />
      </div>
      <Rain className="cold-open__rain" density={1.1} />
      <div className="cold-open__vignette" aria-hidden="true" />

      <div className="cold-open__stage">
        <div className="cold-open__seal" data-pressed={sealed || undefined} aria-hidden="true">
          <Seal text="八九三" size={112} tilt={-3} />
        </div>
        <p className="cold-open__line" data-visible={visible || undefined} aria-live="polite">
          {beat.text}
        </p>
      </div>

      <button type="button" className="cold-open__skip" onClick={finish}>
        Any key to come in
      </button>
    </div>
  );
}
