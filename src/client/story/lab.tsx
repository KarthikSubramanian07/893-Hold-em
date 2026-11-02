// The story lab: preview the cold open, step through a scripted night with the
// narrator, open the matchbook, press stamps, meet the cast, and try the eggs.
// Open /src/client/story/lab.html under `npm run dev:web`.
//
//   ?view=coldopen | narrator | matchbook | stamps | cast | eggs
//   &step=N        narrator: jump to a step of the scripted night
//   &tone=paper    narrator: ink on washi instead of the night table
//   &open=1        matchbook: start open, with a few stamps pressed
//   &toast=<id>    stamps: show this stamp's slip

import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { GameView } from '../../engine/types';
import { sfx } from '../audio';
import {
  BarCat,
  CHAPTERS,
  ColdOpen,
  EGG_EVENT,
  type EggDetail,
  HiddenCard,
  type Line,
  MASKS,
  MASTER,
  Matchbook,
  Narrator,
  REGULARS,
  STAMPS,
  Seal,
  StampToast,
  TABLE_MASKS,
  installEggs,
  lanternClick,
  narrate,
  useMatchbook,
} from './index';
import { scriptedNight } from './fixtures';
import { CAT, speakerInfo } from './lines';
import type { StampId } from './stamps';
import '../styles/fonts.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import '@fontsource/caveat/latin-500.css';
import './lab.css';

type View = 'coldopen' | 'narrator' | 'matchbook' | 'stamps' | 'cast' | 'eggs';
const VIEWS: { id: View; kanji: string; label: string }[] = [
  { id: 'coldopen', kanji: '雨', label: 'Cold open' },
  { id: 'narrator', kanji: '語', label: 'Narrator' },
  { id: 'matchbook', kanji: '帳', label: 'Matchbook' },
  { id: 'stamps', kanji: '印', label: 'Stamps' },
  { id: 'cast', kanji: '面', label: 'Cast' },
  { id: 'eggs', kanji: '卵', label: 'Eggs' },
];

const params = new URLSearchParams(location.search);
const EVENING = new Date(2026, 10, 1, 21, 30);

function useParam<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>((params.get(key) as T) || fallback);
  return [
    v,
    (next: T) => {
      setV(next);
      const p = new URLSearchParams(location.search);
      p.set(key, next);
      history.replaceState(null, '', `?${p}`);
    },
  ];
}

// ---------------------------------------------------------------------------

function ColdOpenLab() {
  const [run, setRun] = useState(0);
  const [done, setDone] = useState(false);
  return (
    <div className="lab-stage lab-stage--full">
      {done ? (
        <div className="lab-center">
          <p className="lab-quiet">The cold open has played. The matchbook remembers.</p>
          <button
            className="lab__btn"
            onClick={() => {
              setDone(false);
              setRun((r) => r + 1);
            }}
          >
            Play it again
          </button>
        </div>
      ) : (
        <ColdOpen key={run} contained onDone={() => setDone(true)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function NarratorLab() {
  const steps = useMemo(() => scriptedNight(), []);
  const [stepParam, setStepParam] = useParam<string>('step', '0');
  const [tone, setTone] = useParam<'night' | 'paper'>('tone', 'night');
  const step = Math.max(0, Math.min(steps.length - 1, Number(stepParam) || 0));
  const lines: Line[] = useMemo(() => {
    const prev: GameView | null = step > 0 ? steps[step - 1]!.view : null;
    return narrate(prev, steps[step]!.view, 's0', { now: EVENING });
  }, [step, steps]);
  const go = (d: number) => setStepParam(String(Math.max(0, Math.min(steps.length - 1, step + d))));
  const v = steps[step]!.view;

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'j') go(1);
      if (e.key === 'ArrowLeft' || e.key === 'k') go(-1);
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });

  return (
    <div className="lab-narrator">
      <div className={`lab-table lab-table--${tone}`}>
        <div className="lab-table__hud">
          <span>手 {v.hand || '—'}/{v.hands}</span>
          <span className="lab-gold">円 {v.take}/{v.target}</span>
          <span className="lab-neon">熱 {v.heat}/{v.heatLimit}</span>
          {v.rule ? <span>{v.rule}</span> : null}
        </div>
        <div className="lab-table__masks" aria-hidden="true">
          {v.house.map((_, i) => {
            const m = TABLE_MASKS[v.config.difficulty][i] ?? 'oni';
            return <MaskFace key={i} id={m} />;
          })}
        </div>
        <div className="lab-table__rim" aria-hidden="true" />
        <Narrator key={`${step}-${tone}`} lines={lines} tone={tone} className="lab-table__narrator" />
      </div>
      <aside className="lab-steps">
        <div className="lab-steps__ctl">
          <button className="lab__btn" onClick={() => go(-1)} aria-label="Previous step">
            ←
          </button>
          <span>
            {step + 1}/{steps.length}
          </span>
          <button className="lab__btn" onClick={() => go(1)} aria-label="Next step">
            →
          </button>
          <button className="lab__btn" onClick={() => setTone(tone === 'night' ? 'paper' : 'night')}>
            {tone === 'night' ? 'Paper' : 'Night'}
          </button>
        </div>
        <ol className="lab-steps__list">
          {steps.map((s, i) => (
            <li key={i} data-current={i === step || undefined}>
              <button onClick={() => setStepParam(String(i))}>{s.label}</button>
              {i === step ? (
                <ul>
                  {lines.length === 0 ? <li className="lab-quiet">(silence)</li> : null}
                  {lines.map((l) => (
                    <li key={l.id}>
                      <b>{speakerInfo(l.speaker).name}</b> {l.text}
                      <code>{l.id}</code>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

/** A flat stand-in for a mask, painted from its palette. The 3D scene does the real thing. */
function MaskFace({ id }: { id: keyof typeof MASKS }) {
  const m = MASKS[id];
  const p = m.palette;
  return (
    <figure className="lab-mask" title={m.name}>
      <svg viewBox="0 0 80 100" width="64" height="80">
        {id === 'oni' || id === 'hannya' ? (
          <>
            <path d="M14 26 L6 2 L26 18 Z" fill={p.trim} />
            <path d="M66 26 L74 2 L54 18 Z" fill={p.trim} />
          </>
        ) : null}
        <ellipse cx="40" cy="52" rx="30" ry="40" fill={p.face} />
        {id === 'tengu' ? <path d="M38 50 L40 86 L44 50 Z" fill={p.face} stroke={p.ink} strokeWidth="1" /> : null}
        <path d={id === 'okame' || id === 'ebisu' || id === 'okina' ? 'M22 44 Q28 40 34 44 M46 44 Q52 40 58 44' : 'M22 46 L34 42 M58 46 L46 42'} stroke={p.ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <ellipse cx="28" cy="50" rx="4" ry={id === 'okina' ? 1.4 : 2.6} fill={p.eyes} />
        <ellipse cx="52" cy="50" rx="4" ry={id === 'okina' ? 1.4 : 2.6} fill={p.eyes} />
        {id === 'okame' ? (
          <>
            <circle cx="20" cy="62" r="6" fill={p.accent} opacity="0.5" />
            <circle cx="60" cy="62" r="6" fill={p.accent} opacity="0.5" />
          </>
        ) : null}
        {id === 'kitsune' ? <path d="M16 38 L28 46 M64 38 L52 46" stroke={p.accent} strokeWidth="3" strokeLinecap="round" /> : null}
        <path d={id === 'hyottoko' ? 'M44 72 q6 -4 8 2 q-4 4 -8 -2' : id === 'hannya' || id === 'oni' ? 'M24 72 Q40 86 56 72 L52 78 Q40 84 28 78 Z' : 'M30 72 Q40 80 50 72'} stroke={p.ink} strokeWidth="2" fill={id === 'hannya' || id === 'oni' ? p.ink : 'none'} />
        {id === 'okina' ? <path d="M24 80 Q40 104 56 80 Q48 90 40 90 Q32 90 24 80 Z" fill={p.trim} /> : null}
      </svg>
      <figcaption>{m.kanji}</figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------

function MatchbookLab() {
  const book = useMatchbook();
  const startOpen = params.get('open') === '1';
  useEffect(() => {
    if (startOpen && Object.keys(useMatchbook.getState().data.stamps).length === 0) pressSome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pressSome = () => {
    const ids: StampId[] = ['first-night', 'corner', 'yakuza', 'ride-or-die', 'close-call', 'night-owl', 'seen', 'the-knock', 'cat'];
    const day = 86_400_000;
    const stamps = Object.fromEntries(ids.map((id, i) => [id, Date.UTC(2026, 9, 20) + i * day]));
    useMatchbook.setState((s) => ({ data: { ...s.data, stamps: { ...s.data.stamps, ...stamps }, cleared: ['shitamachi'], nights: 7 } }));
  };
  const pressAll = () => {
    const stamps = Object.fromEntries(STAMPS.map((s) => [s.id, Date.now()]));
    useMatchbook.setState((s) => ({ data: { ...s.data, stamps, cleared: ['shitamachi', 'kabukicho', 'oyabun'], nights: 23 } }));
  };
  return (
    <div className="lab-paper">
      <Matchbook open={startOpen ? true : undefined} />
      <div className="lab-controls">
        <button className="lab__btn lab__btn--ink" onClick={pressSome}>
          Press a few
        </button>
        <button className="lab__btn lab__btn--ink" onClick={pressAll}>
          Press all
        </button>
        <button className="lab__btn lab__btn--ink" onClick={() => book.reset()}>
          Reset
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function StampsLab() {
  const initial = params.get('toast') as StampId | null;
  const [toast, setToast] = useState<StampId | null>(initial);
  const [n, setN] = useState(0);
  return (
    <div className="lab-paper lab-paper--wide">
      <div className="lab-sealgrid">
        {STAMPS.map((s) => (
          <button
            key={s.id}
            className="lab-sealcard"
            onClick={() => {
              sfx.unlock();
              setToast(s.id);
              setN((x) => x + 1);
            }}
          >
            <Seal text={s.kanji} shape={s.shape} size={72} />
            <strong>{s.name}</strong>
            <span>{s.verse}</span>
            {s.secret ? <em>secret</em> : null}
          </button>
        ))}
      </div>
      <StampToast key={n} stamp={toast} onDone={() => setToast(null)} duration={initial && n === 0 ? 60_000 : 4200} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function CastLab() {
  const tables = Object.entries(TABLE_MASKS) as [keyof typeof TABLE_MASKS, readonly (keyof typeof MASKS)[]][];
  return (
    <div className="lab-cast">
      <section className="lab-cast__master">
        <Seal text={MASTER.kanji} size={72} />
        <div>
          <h2>{MASTER.name}</h2>
          <p>{MASTER.story}</p>
          <p className="lab-quiet">
            On the licence: {MASTER.realKanji} ({MASTER.realName}). The cat is {CAT.name}, {CAT.kanji}.
          </p>
        </div>
      </section>
      {tables.map(([table, ids]) => (
        <section key={table} className="lab-cast__table">
          <h3>
            <span>{CHAPTERS[table].kanji}</span> 第{CHAPTERS[table].number}章 · {CHAPTERS[table].title}
          </h3>
          <div className="lab-cast__row">
            {ids.map((id) => (
              <MaskCard key={id} id={id} />
            ))}
            {table === 'oyabun' ? <MaskCard id="oni" /> : null}
          </div>
        </section>
      ))}
      <section className="lab-cast__table">
        <h3>
          <span>常連</span> The regulars
        </h3>
        <div className="lab-cast__regulars">
          {Object.values(REGULARS).map((r) => (
            <article key={r.name}>
              <Seal text={r.kanji} shape="round" variant="outline" size={46} />
              <div>
                <strong>{r.name}</strong>
                <p>{r.story}</p>
                <q>{r.intro[0]}</q>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function MaskCard({ id }: { id: keyof typeof MASKS }) {
  const m = MASKS[id];
  return (
    <article className="lab-maskcard">
      <header>
        <MaskFace id={id} />
        <div>
          <strong>{m.name}</strong>
          <span lang="ja">{m.kanji}</span>
        </div>
      </header>
      <div className="lab-swatches">
        {Object.entries(m.palette)
          .filter(([, v]) => typeof v === 'string')
          .map(([k, v]) => (
            <span key={k} style={{ background: v as string }} title={`${k} ${v}`} />
          ))}
      </div>
      <p>{m.personality}</p>
      <q>{m.lines.intro[0]}</q>
    </article>
  );
}

// ---------------------------------------------------------------------------

function EggsLab() {
  const [log, setLog] = useState<EggDetail[]>([]);
  const [flicker, setFlicker] = useState(0);
  const [card, setCard] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const on = (e: WindowEventMap['893:egg']) => {
      setLog((l) => [e.detail, ...l].slice(0, 8));
      if (e.detail.id === 'neon') setFlicker((f) => f + 1);
      if (e.detail.id === 'konami') setCard(true);
      if (e.detail.id === 'lantern') {
        setDark(true);
        setTimeout(() => setDark(false), 1400);
      }
      if (e.detail.id === 'kanpai') sfx.chip();
    };
    addEventListener(EGG_EVENT, on);
    return () => removeEventListener(EGG_EVENT, on);
  }, []);
  const lines = useMemo(() => log.map((l) => l.line).filter((l): l is Line => l !== null).slice(0, 1), [log]);
  return (
    <div className="lab-eggs" data-dark={dark || undefined}>
      <div className="lab-eggs__bar">
        <span key={flicker} className="lab-eggs__neon" data-flicker={flicker > 0 || undefined}>
          八九三
        </span>
        <button className="lab-eggs__lantern" onClick={() => lanternClick()} aria-label="The lantern" />
        <BarCat className="lab-eggs__cat" />
        <Narrator lines={lines} className="lab-eggs__narrator" />
      </div>
      <aside className="lab-eggs__list">
        <h3>Try</h3>
        <ul>
          <li>Type <kbd>8</kbd> <kbd>9</kbd> <kbd>3</kbd></li>
          <li><kbd>↑</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd><kbd>←</kbd><kbd>→</kbd><kbd>B</kbd><kbd>A</kbd></li>
          <li>Type <kbd>kanpai</kbd></li>
          <li>Click the lantern eight times, quickly</li>
          <li>Pet the cat</li>
          <li>Open the console</li>
        </ul>
        <h3>Heard</h3>
        <ol>
          {log.length === 0 ? <li className="lab-quiet">nothing yet</li> : null}
          {log.map((e, i) => (
            <li key={i}>
              <code>{e.id}</code> {e.line?.text}
            </li>
          ))}
        </ol>
      </aside>
      <HiddenCard open={card} onClose={() => setCard(false)} />
      <StampToast />
    </div>
  );
}

// ---------------------------------------------------------------------------

function Lab() {
  const [view, setView] = useParam<View>('view', 'narrator');
  useEffect(() => installEggs(), []);
  return (
    <div className="lab">
      <header className="lab__bar" onPointerDown={() => sfx.unlock()}>
        <span className="lab__title">
          <b>八九三</b> story lab
        </span>
        <nav className="lab__nav">
          {VIEWS.map((v) => (
            <button key={v.id} aria-pressed={view === v.id} onClick={() => setView(v.id)}>
              <span>{v.kanji}</span>
              {v.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="lab__main">
        {view === 'coldopen' ? <ColdOpenLab /> : null}
        {view === 'narrator' ? <NarratorLab /> : null}
        {view === 'matchbook' ? <MatchbookLab /> : null}
        {view === 'stamps' ? <StampsLab /> : null}
        {view === 'cast' ? <CastLab /> : null}
        {view === 'eggs' ? <EggsLab /> : null}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
);
