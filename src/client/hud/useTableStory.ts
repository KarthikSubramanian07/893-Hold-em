// The story at the table: every view change goes past the narrator and the
// matchbook, eggs found at the table get the Master's remark, and the lobby
// gets an idle word now and then. Returns the lines for <Narrator />.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameView } from '../../engine/types';
import { EGG_EVENT, type EggDetail, type Line, catVisits, checkCode, idleLine, narrate, useMatchbook } from '../story';
import { IDLE_EVERY_MS, eggRemark, idleDue, witnessed } from '../story/stage';

export interface TableStory {
  lines: readonly Line[];
  /** Kyū is on the bar tonight. */
  cat: boolean;
}

export function useTableStory(view: GameView | null, code: string): TableStory {
  const [lines, setLines] = useState<readonly Line[]>([]);
  const prev = useRef<GameView | null>(null);
  const spokeAt = useRef(Date.now());
  const tick = useRef(0);
  const cat = useMemo(() => catVisits(code), [code]);

  const say = (next: readonly Line[]) => {
    if (next.length === 0) return;
    spokeAt.current = Date.now();
    setLines(next);
  };

  // A code with 8-9-3 in it goes in the matchbook; the welcome does the talking.
  useEffect(() => {
    checkCode(code);
  }, [code]);

  // One step of the night: lines for everyone, stamps for you.
  useEffect(() => {
    if (!view) {
      prev.current = null;
      return;
    }
    // StrictMode runs effects twice; the same view is only one step.
    if (prev.current === view) return;
    const before = prev.current;
    prev.current = view;
    const book = useMatchbook.getState();
    const returning = book.data.nights > 0;
    say(narrate(before, view, view.you, { returning }));
    if (witnessed(before, view)) book.observe(before, view, view.you);
  }, [view]);

  // Eggs found while sitting here.
  const open = view !== null;
  useEffect(() => {
    const onEgg = (e: CustomEvent<EggDetail>) => {
      const line = eggRemark(e.detail, open ? 'table' : 'door');
      if (line) say([line]);
    };
    addEventListener(EGG_EVENT, onEgg);
    return () => removeEventListener(EGG_EVENT, onEgg);
  }, [open]);

  // The lobby, while it fills.
  const phase = view?.phase;
  useEffect(() => {
    if (phase !== 'lobby') return;
    spokeAt.current = Math.max(spokeAt.current, Date.now() - IDLE_EVERY_MS / 2);
    const timer = setInterval(() => {
      const v = prev.current;
      if (!v || !idleDue(v, spokeAt.current, Date.now())) return;
      spokeAt.current = Date.now();
      const line = idleLine(v, tick.current++, { cat });
      if (line) setLines([line]);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, cat]);

  return { lines, cat };
}
