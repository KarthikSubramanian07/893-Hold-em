// Dev-only scene lab, served at /scene.html by `vite`. Never built.
// Alt+1–5 pick a fixture, Alt+P plays a scripted hand, Alt+G toggles the HUD
// guides (Alt, so typing 8 9 3 or kanpai reaches the easter eggs instead).
// URL params: ?fixture=<name>&quality=low|high&meter=<n>&outcome=crew|house|tie|walked
//             &verdict=clean|raid|dawn&table=shitamachi|kabukicho|oyabun&crew=<2..6>

import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HOUSE_CARDS } from '../../engine/rules';
import type { GameView, HandOutcome, Slot } from '../../engine/types';
import { FIXTURES } from '../dev/fixtures';
import { installEggs } from '../story/eggs';
import { TableScene } from './index';

const clone = (v: GameView): GameView => structuredClone(v);

/** A hand from an empty lobby to the showdown, so every transition can be watched. */
function script(): { name: string; view: GameView; hold: number }[] {
  const lobby = clone(FIXTURES.lobby!);
  const nod = clone(FIXTURES.nod!);
  const call = clone(FIXTURES.call!);
  const show = clone(FIXTURES.showdown!);
  const fresh = nod.seats.map((s) => ({ ...s, locked: false, nod: null, stance: null }));
  const deal: GameView = { ...nod, seats: fresh, board: [null, null, null, null, null] };
  const lobbyFull: GameView = { ...lobby, seats: deal.seats.map((s) => ({ ...s, cards: [] })) };
  const flop: GameView = { ...nod, seats: fresh };
  const nodding: GameView = { ...nod, seats: fresh.map((s, i) => ({ ...s, locked: i !== 2 })) };
  const river: GameView = { ...call, hand: nod.hand, seats: call.seats.map((s) => ({ ...s, locked: false })) };
  const locked: GameView = { ...river, meter: -5, seats: river.seats.map((s, i) => ({ ...s, locked: i % 2 === 0 })) };
  // Six seats at Oyabun, five House cards, the marker one step from the sirens: the busiest table.
  const names = ['Karthik', 'Mio', 'Ren', 'Daichi', 'Sora', 'Yuki'];
  const crowd: GameView = {
    ...river,
    config: { ...river.config, difficulty: 'oyabun' },
    meter: -7,
    door: 12,
    sirens: 8,
    seats: names.map((n, i) => ({
      ...river.seats[1]!,
      id: `s${i}`,
      name: n,
      avatar: (['kitsune', 'koi', 'tora', 'tanuki', 'tsuru', 'karasu'] as const)[i]!,
      cards: i === 0 ? ['back', 'back'] : (['Qs', 'Qd'] as Slot[]),
      locked: i % 2 === 1,
      connected: i !== 5,
      nod: i === 0 ? null : `s${(i + 1) % 6}`,
    })),
    house: { cards: ['9c', 'back', 'back', 'back', 'back'], hand: null },
  };
  return [
    { name: 'crowd', view: crowd, hold: 3000 },
    { name: 'lobby', view: lobby, hold: 2200 },
    { name: 'lobby (full)', view: lobbyFull, hold: 2200 },
    { name: 'deal', view: deal, hold: 3200 },
    { name: 'flop', view: flop, hold: 3000 },
    { name: 'nodding', view: nodding, hold: 2600 },
    { name: 'river (nods revealed)', view: river, hold: 3600 },
    { name: 'call (locking)', view: locked, hold: 3000 },
    { name: 'showdown', view: show, hold: 7000 },
  ];
}

function applyParams(view: GameView, params: URLSearchParams): GameView {
  const v = clone(view);
  const meter = params.get('meter');
  if (meter !== null) v.meter = Number(meter);
  const outcome = params.get('outcome') as HandOutcome | null;
  if (outcome && v.result) v.result.outcome = outcome;
  const verdict = params.get('verdict');
  if (verdict === 'clean' || verdict === 'raid' || verdict === 'dawn') v.verdict = verdict;
  const table = params.get('table');
  if (table === 'shitamachi' || table === 'kabukicho' || table === 'oyabun') {
    v.config.difficulty = table;
    if (v.phase !== 'lobby') {
      const n = HOUSE_CARDS[table];
      v.house = { ...v.house, cards: Array.from({ length: n }, (_, i) => v.house.cards[i] ?? (v.phase === 'showdown' ? '2c' : 'back')) };
    }
  }
  const crewParam = Number(params.get('crew') ?? 0);
  if (crewParam && v.phase !== 'lobby') {
    const names = ['Karthik', 'Mio', 'Ren', 'Daichi', 'Sora', 'Yuki'];
    const avatars = ['kitsune', 'koi', 'tora', 'tanuki', 'tsuru', 'karasu'] as const;
    const template = v.seats[v.seats.length - 1]!;
    v.seats = Array.from({ length: Math.min(6, crewParam) }, (_, i) => v.seats[i] ?? { ...structuredClone(template), id: `s${i}`, name: names[i]!, avatar: avatars[i]!, champion: false });
  }
  return v;
}

const NAMES = ['lobby', 'nod', 'call', 'showdown', 'over'];

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
