// A polite live region that says what just happened at the table, and the T
// key to hear the whole table again. Visually hidden: the scene and the dock
// already show all of it.
import { useEffect, useRef, useState } from 'react';
import type { GameView } from '../../engine/types';
import { announce, describeTable } from './announce';

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

export function Announcer({ view, paused }: { view: GameView; paused: boolean }) {
  const prev = useRef<GameView | null>(null);
  const [said, setSaid] = useState({ text: '', n: 0 });
  const say = (text: string) => setSaid((s) => ({ text, n: s.n + 1 }));

  useEffect(() => {
    if (prev.current === view) return;
    const line = announce(prev.current, view);
    prev.current = view;
    if (line) say(line);
  }, [view]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    say(paused ? 'Paused. The clock and the regulars wait. Press Resume to play on.' : 'Play goes on.');
  }, [paused]);

  const latest = useRef(view);
  latest.current = view;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || typing(e)) return;
      if (e.key.toLowerCase() === 't') say(describeTable(latest.current));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {/* A new key per line, so the same words twice are still read twice. */}
      <p key={said.n}>{said.text}</p>
    </div>
  );
}
