// Dev-only scene lab, served at /scene.html by `vite`. Never built.
// Alt+1–5 pick a fixture, Alt+P plays a scripted hand, Alt+G toggles the HUD
// guides (Alt, so typing 8 9 3 or kanpai reaches the easter eggs instead).
// URL params: ?fixture=<name>&quality=low|high&heat=<n>&outcome=crew|house|tie|walked

import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { GameView, HandOutcome } from '../../engine/types';
import { FIXTURES } from '../dev/fixtures';
import { installEggs } from '../story/eggs';
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
  // Six seats, four masks (Oni), calls hidden under Hush: the busiest table.
  const names = ['Karthik', 'Mio', 'Ren', 'Daichi', 'Sora', 'Yuki'];
  const crowd: GameView = {
    ...riv,
    rule: 'shizuka',
    heat: 6,
    seats: names.map((n, i) => ({
      ...deal.seats[0]!,
      id: `s${i}`,
      name: n,
      avatar: (['kitsune', 'koi', 'tora', 'tanuki', 'tsuru', 'karasu'] as const)[i]!,
      cards: i === 0 ? ['Qs', 'Qd'] : ['back', 'back'],
      active: i !== 4,
      stake: i === 0 ? 2 : null,
      locked: i % 2 === 1,
      connected: i !== 5,
      calls: ['hidden', 'hidden', i === 4 ? 'fold' : 'hidden', null],
    })),
    house: [0, 1, 2, 3].map(() => ({ cards: ['back', 'back'], hand: null, champion: false })),
  };
  return [
    { name: 'crowd', view: crowd, hold: 3000 },
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
  const table = params.get('table');
  if (table === 'shitamachi' || table === 'kabukicho' || table === 'oyabun') v.config.difficulty = table;
  // masks=<1..4> reshapes the crew and the House: n masks face 2n players, and
  // the fourth mask only ever comes with the Oni.
  const masks = Number(params.get('masks') ?? 0);
  const crewParam = Number(params.get('crew') ?? 0);
  if ((masks || crewParam) && v.phase !== 'lobby') {
    const oni = masks === 4 || v.rule === 'oni';
    if (masks === 4) v.rule = 'oni';
    const crew = crewParam || Math.min(6, oni ? 2 * (masks - 1) : 2 * masks);
    const names = ['Karthik', 'Mio', 'Ren', 'Daichi', 'Sora', 'Yuki'];
    const avatars = ['kitsune', 'koi', 'tora', 'tanuki', 'tsuru', 'karasu'] as const;
    const template = v.seats[v.seats.length - 1]!;
    v.seats = Array.from({ length: crew }, (_, i) => v.seats[i] ?? { ...structuredClone(template), id: `s${i}`, name: names[i]!, avatar: avatars[i]!, champion: false });
    const count = masks || Math.ceil(crew / 2) + (oni ? 1 : 0);
    const proto = v.house[0] ?? { cards: ['back', 'back'], hand: null, champion: false };
    v.house = Array.from({ length: count }, (_, i) => v.house[i] ?? { ...structuredClone(proto), champion: false });
  }
  // Watchers as the engine assigns them: pairs of seats, in seat order.
  v.seats = v.seats.map((s, k) => ({ ...s, watcher: v.phase === 'lobby' || !v.house.length ? null : Math.min(Math.floor(k / 2), v.house.length - 1) }));
  const burned = params.get('burned');
  if (burned !== null && v.result) v.result.burned = burned ? burned.split(',') : [];
  return v;
}

const NAMES = ['lobby', 'preflop', 'river', 'showdown', 'over'];

function Lab() {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const quality = params.get('quality') === 'low' ? 'low' : 'high';
  const steps = useMemo(script, []);
  const [name, setName] = useState(params.get('fixture') ?? 'river');
  const [view, setView] = useState<GameView>(() => {
    const step = steps.find((s) => s.name === name || s.name === name.replace(/-/g, ' '));
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
    let i = 1;
    const next = () => {
      const s = steps[i]!;
      setName(`▶ ${s.name}`);
      setView(applyParams(s.view, params));
      i = (i + 1) % steps.length;
      if (i === 0) i = 1; // the crowd view is not part of the hand
      timer.current = window.setTimeout(next, s.hold);
    };
    next();
  }, [steps, params]);

  // The keyboard eggs (8-9-3, kanpai, the Konami code), as the app installs them.
  useEffect(() => installEggs({ console: false }), []);

  useEffect(() => {
    if (params.has('play')) play();
    // Lab keys sit behind Alt (Option) so typing 893 or kanpai reaches the eggs.
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const n = Number(e.code.replace('Digit', ''));
      if (n >= 1 && n <= NAMES.length) pick(NAMES[n - 1]!);
      if (e.code === 'KeyP') play();
      if (e.code === 'KeyG') setGuides((g) => !g);
      if (e.code === 'KeyH') setHud((h) => !h);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pick, play, params]);

  return (
    <>
      <TableScene view={view} quality={quality} cat={params.has('cat') ? params.get('cat') !== '0' : undefined} />
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
              ⌥{i + 1} {n}
            </button>
          ))}
          <button onClick={play} style={btn(name.startsWith('▶'))}>
            ⌥P play {name.startsWith('▶') ? name.slice(2) : ''}
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
