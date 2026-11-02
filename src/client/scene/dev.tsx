// Dev-only scene lab, served at /scene.html by `vite`. Never built.
// Keys 1–5 pick a fixture, P plays a scripted hand, G toggles the HUD guides.
// URL params: ?fixture=<name>&quality=low|high&heat=<n>&outcome=crew|house|tie|walked

import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { GameView, HandOutcome } from '../../engine/types';
import { FIXTURES } from '../dev/fixtures';
import { TableScene } from './index';

const clone = (v: GameView): GameView => structuredClone(v);

/** A hand from an empty lobby to the showdown, so every transition can be watched. */
function script(): { name: string; view: GameView; hold: number }[] {
  const lobby = clone(FIXTURES.lobby!);
  const pre = clone(FIXTURES.preflop!);
  const river = clone(FIXTURES.river!);
  const show = clone(FIXTURES.showdown!);
  const seats4 = show.seats.map((s) => ({ ...s, hand: null, champion: false }));
  const deal: GameView = {
    ...pre,
    seats: seats4.map((s, i) => ({
      ...s,
      cards: i === 0 ? ['Ah', 'Kd'] : ['back', 'back'],
      active: true,
      stake: 1,
      locked: false,
      calls: [null, null, null, null],
    })),
    board: [null, null, null, null, null],
  };
  const lobbyFull: GameView = { ...lobby, seats: deal.seats.map((s) => ({ ...s, cards: [] })) };
  const flop: GameView = {
    ...deal,
    street: 1,
    hand: 3,
    rule: 'kagami',
    house: river.house.slice(0, 2),
    board: ['Kh', '7s', '7d', null, null],
    seats: deal.seats.map((s, i) => ({
      ...s,
      stake: i === 1 ? 2 : 1,
      calls: [i === 1 ? 'raise' : 'stay', null, null, null],
      locked: i === 3,
    })),
  };
  const turn: GameView = {
    ...flop,
    street: 2,
    board: ['Kh', '7s', '7d', '2c', null],
    heat: 4,
    seats: flop.seats.map((s, i) => ({
      ...s,
      stake: i === 0 ? 2 : i === 1 ? 3 : 1,
      active: i !== 2,
      calls: [s.calls[0]!, i === 2 ? 'fold' : i < 2 ? 'raise' : 'stay', null, null],
      locked: false,
    })),
  };
  const riv: GameView = {
    ...turn,
    street: 3,
    board: ['Kh', '7s', '7d', '2c', 'Qh'],
    seats: turn.seats.map((s, i) => ({ ...s, calls: [s.calls[0]!, s.calls[1]!, i === 2 ? null : 'stay', null], locked: i === 1 })),
  };
  return [
    { name: 'lobby', view: lobby, hold: 2200 },
    { name: 'lobby (full)', view: lobbyFull, hold: 2200 },
    { name: 'deal', view: deal, hold: 3200 },
    { name: 'flop', view: flop, hold: 3600 },
    { name: 'turn', view: turn, hold: 3600 },
    { name: 'river', view: riv, hold: 3600 },
    { name: 'showdown', view: show, hold: 7000 },
  ];
}

function applyParams(view: GameView, params: URLSearchParams): GameView {
  const v = clone(view);
  const heat = params.get('heat');
  if (heat !== null) v.heat = Number(heat);
  const outcome = params.get('outcome') as HandOutcome | null;
  if (outcome && v.result) v.result.outcome = outcome;
  const verdict = params.get('verdict');
  if (verdict === 'clean' || verdict === 'raid' || verdict === 'short') v.verdict = verdict;
  const rule = params.get('rule');
  if (rule) v.rule = rule as GameView['rule'];
  return v;
}

const NAMES = ['lobby', 'preflop', 'river', 'showdown', 'over'];

function Lab() {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const quality = params.get('quality') === 'low' ? 'low' : 'high';
  const steps = useMemo(script, []);
  const [name, setName] = useState(params.get('fixture') ?? 'river');
  const [view, setView] = useState<GameView>(() => {
    const step = steps.find((s) => s.name === name);
    return applyParams(step?.view ?? FIXTURES[name] ?? FIXTURES.river!, params);
  });
  const [guides, setGuides] = useState(params.has('guides'));
  const [hud, setHud] = useState(!params.has('clean'));
  const timer = useRef<number | undefined>(undefined);

  const pick = useCallback(
    (n: string) => {
      window.clearTimeout(timer.current);
      setName(n);
      setView(applyParams(FIXTURES[n]!, params));
    },
    [params],
  );

  const play = useCallback(() => {
    window.clearTimeout(timer.current);
    let i = 0;
    const next = () => {
      const s = steps[i]!;
      setName(`▶ ${s.name}`);
      setView(applyParams(s.view, params));
      i = (i + 1) % steps.length;
      timer.current = window.setTimeout(next, s.hold);
    };
    next();
  }, [steps, params]);

  useEffect(() => {
    if (params.has('play')) play();
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= NAMES.length) pick(NAMES[n - 1]!);
      if (e.key === 'p') play();
      if (e.key === 'g') setGuides((g) => !g);
      if (e.key === 'h') setHud((h) => !h);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pick, play, params]);

  return (
    <>
      <TableScene view={view} quality={quality} />
      {guides && (
        <>
          <div style={{ position: 'fixed', left: 0, right: 0, top: 0, height: 64, background: 'rgba(255,79,109,0.18)', pointerEvents: 'none' }} />
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: 150, background: 'rgba(255,79,109,0.18)', pointerEvents: 'none' }} />
        </>
      )}
      {hud && (
        <div
          style={{
            position: 'fixed',
            left: 12,
            top: 12,
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            font: '600 11px/1 "JetBrains Mono Variable", ui-monospace, monospace',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          {NAMES.map((n, i) => (
            <button key={n} onClick={() => pick(n)} style={btn(n === name)}>
              {i + 1} {n}
            </button>
          ))}
          <button onClick={play} style={btn(name.startsWith('▶'))}>
            P play {name.startsWith('▶') ? name.slice(2) : ''}
          </button>
        </div>
      )}
    </>
  );
}

function btn(active: boolean): React.CSSProperties {
  return {
    font: 'inherit',
    letterSpacing: 'inherit',
    textTransform: 'inherit',
    padding: '7px 9px',
    border: '1px solid rgba(239,232,218,0.25)',
    borderRadius: 3,
    background: active ? '#d2412a' : 'rgba(27,26,23,0.7)',
    color: '#efe8da',
    cursor: 'pointer',
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
);
