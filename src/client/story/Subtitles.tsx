// Subtitles for the bar. One line at a time, typed on without hurry, held long
// enough to read twice, then gone. The speaker is a small vertical seal; the
// moment's kanji, if it has one, sits faint behind the words.
//
// Place-agnostic: it fills whatever box the integrator gives it. Pass every
// line `narrate()` returns; lines already queued or recently shown (by id) are
// ignored, so re-renders and StrictMode can't double them.

import { useEffect, useReducer, useRef, useState } from 'react';
import { speakerInfo } from './lines';
import { useReducedMotion } from './motion';
import { Seal } from './Seal';
import type { Line } from './types';

export interface NarratorProps {
  lines: readonly Line[];
  /** `night` is ink-light on the dark table; `paper` is sumi ink on washi. */
  tone?: 'night' | 'paper';
  /** Characters per second while typing. */
  speed?: number;
  /** Called as each line finishes and leaves. */
  onDone?: (line: Line) => void;
  className?: string;
}

type Stage = 'typing' | 'holding' | 'leaving';

interface State {
  queue: Line[];
  recent: string[];
}

type Action = { t: 'add'; lines: readonly Line[] } | { t: 'shift' };

const RECENT = 48;

function reducer(s: State, a: Action): State {
  if (a.t === 'shift') return { ...s, queue: s.queue.slice(1) };
  const fresh = a.lines.filter((l) => !s.recent.includes(l.id) && !s.queue.some((q) => q.id === l.id));
  if (fresh.length === 0) return s;
  return { queue: [...s.queue, ...fresh], recent: [...s.recent, ...fresh.map((l) => l.id)].slice(-RECENT) };
}

const LEAVE_MS = 520;

export function Narrator({ lines, tone = 'night', speed = 34, onDone, className }: NarratorProps) {
  const [{ queue }, dispatch] = useReducer(reducer, { queue: [], recent: [] });
  const reduced = useReducedMotion();
  const current = queue[0] ?? null;
  const [shown, setShown] = useState(0);
  const [stage, setStage] = useState<Stage>('typing');
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    dispatch({ t: 'add', lines });
  }, [lines]);

  // Type, hold, leave, next.
  useEffect(() => {
    if (!current) return;
    const len = Array.from(current.text).length;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let raf = 0;
    setStage('typing');
    if (reduced) {
      setShown(len);
      setStage('holding');
    } else {
      setShown(0);
      const start = performance.now();
      const tick = (now: number) => {
        const n = Math.min(len, Math.floor(((now - start) / 1000) * speed) + 1);
        setShown(n);
        if (n < len) raf = requestAnimationFrame(tick);
        else setStage('holding');
      };
      raf = requestAnimationFrame(tick);
    }
    const typing = reduced ? 0 : (len / speed) * 1000;
    const hold = current.hold ?? 3200;
    timers.push(setTimeout(() => setStage('leaving'), typing + hold));
    timers.push(
      setTimeout(() => {
        done.current?.(current);
        dispatch({ t: 'shift' });
      }, typing + hold + LEAVE_MS),
    );
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
  }, [current, reduced, speed]);

  const classes = ['narrator', `narrator--${tone}`, className].filter(Boolean).join(' ');
  if (!current) return <div className={classes} aria-live="polite" />;

  const who = speakerInfo(current.speaker);
  const chars = Array.from(current.text);
  return (
    <div className={classes} aria-live="polite">
      <figure
        key={current.id}
        className="narrator__line"
        data-stage={stage}
        data-kind={who.kind}
        data-mood={current.mood ?? 'calm'}
      >
        {current.kanji ? (
          <span className="narrator__ghost" aria-hidden="true">
            {current.kanji}
          </span>
        ) : null}
        <Seal
          className="narrator__seal"
          text={who.seal}
          variant={who.kind === 'master' || who.kind === 'mask' ? 'solid' : 'outline'}
          shape={who.kind === 'regular' ? 'round' : 'square'}
          size={who.seal.length > 1 ? 44 : 40}
          color={who.kind === 'mask' ? 'var(--shu, #d2412a)' : who.kind === 'house' ? 'var(--kin, #c9a45c)' : undefined}
        />
        <figcaption className="narrator__who">{who.name}</figcaption>
        <blockquote className="narrator__text">
          <span className="story-sr">{current.text}</span>
          <span aria-hidden="true">
            <span>{chars.slice(0, shown).join('')}</span>
            <span className="narrator__rest">{chars.slice(shown).join('')}</span>
          </span>
        </blockquote>
      </figure>
    </div>
  );
}
