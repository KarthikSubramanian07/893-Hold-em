// The only way to talk at this table, in two calm steps. On the flop: tap a
// teammate to nod at them, or pass. On the river: In or Out. A clock ring
// keeps time; everything else stays out of the way.
import { useCallback, useEffect, useState } from 'react';
import type { GameView, SeatView, Stance } from '../../engine/types';
import { sfx } from '../audio';
import { countdown, ringOffset, type Countdown } from '../lib/countdown';
import { dockMode, listNames, mySeat, nodsOn, seatById, stillDeciding, teammates } from '../net/selectors';
import { useTable } from '../net/store';
import { AvatarSeal } from '../ui/avatars';
import { CardPair } from './MiniCard';
import { useNow } from './useNow';

const PICKS: { stance: Stance; kanji: string; label: string; key: string; hint: string }[] = [
  { stance: 'in', kanji: '入', label: 'In', key: 'I', hint: 'Your hand counts. One step for you, win or lose.' },
  { stance: 'out', kanji: '出', label: 'Out', key: 'O', hint: 'Sit this one out. Your hand stays off the table.' },
];

/** The first-night coach: one plain line per step, on hand one only. */
export const COACH = {
  nod: "You can't see your own cards. Nod at the teammate whose hand looks strong.",
  call: 'In or Out? A win moves you toward the door, a loss toward the sirens, one step per player In.',
} as const;

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

export function Dock({ view }: { view: GameView }) {
  const nod = useTable((s) => s.nod);
  const call = useTable((s) => s.call);
  const skew = useTable((s) => s.skew);
  const stepKey = `${view.night}:${view.hand}:${view.phase}`;
  // What you just pressed, before the server echoes it back.
  const [local, setLocal] = useState<{ key: string; nod?: string | null; stance?: Stance } | null>(null);
  const mine = local?.key === stepKey ? local : null;
  const mode = dockMode(view, mine !== null);
  const me = mySeat(view);
  const mates = teammates(view);
  const [armed, setArmed] = useState(false);

  const totalMs = view.config.timer * 1000;
  const now = useNow(view.deadline != null && mode !== 'none', 200);
  const clock = countdown(view.deadline, now, skew, totalMs);

  const nodAt = useCallback(
    (at: string | null) => {
      if (mode !== 'nod') return;
      sfx.unlock();
      sfx.play(at ? 'nod' : 'click');
      setLocal({ key: stepKey, nod: at });
      setArmed(false);
      nod(at);
    },
    [mode, stepKey, nod],
  );

  const pick = useCallback(
    (stance: Stance) => {
      if (mode !== 'call') return;
      sfx.unlock();
      sfx.play(stance === 'in' ? 'lockIn' : 'lockOut');
      setLocal({ key: stepKey, stance });
      call(stance);
    },
    [mode, stepKey, call],
  );

  useEffect(() => {
    if (mode !== 'nod' && mode !== 'call') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || typing(e)) return;
      const k = e.key.toLowerCase();
      if (mode === 'call') {
        if (k === 'i') pick('in');
        else if (k === 'o') pick('out');
        return;
      }
      if (k === 'p') nodAt(null);
      else if (k === 'n') setArmed((a) => !a);
      else if (k === 'escape') setArmed(false);
      else if (/^[1-6]$/.test(k)) {
        const target = mates[Number(k) - 1];
        if (target) nodAt(target.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, mates, nodAt, pick]);

  // Tick in the last five seconds.
  const urgentSecond = clock?.urgent ? clock.seconds : 0;
  useEffect(() => {
    if (urgentSecond > 0 && (mode === 'nod' || mode === 'call')) sfx.tick();
  }, [urgentSecond, mode]);

  if (mode === 'none') return null;

  const waiting = stillDeciding(view);
  const coach = view.hand === 1 && (mode === 'nod' || mode === 'call') ? COACH[mode] : null;

  if (mode === 'spectator') {
    return (
      <section className="dock dock--quiet" aria-label="Watching">
        <p className="dock__quiet">
          <span className="dock__quiet-k" aria-hidden="true">
            観
          </span>
          <span>
            <b>You're watching from the bar.</b>
            <span>Seats open up between nights. Mind the glass.</span>
          </span>
        </p>
        {clock && <Ring clock={clock} />}
      </section>
    );
  }

  const status = <Status view={view} waiting={waiting} mode={mode} />;

  if (mode === 'nod' || mode === 'nodded') {
    const chosen = mine?.nod !== undefined ? mine.nod : me?.locked ? (me.nod ?? null) : undefined;
    return (
      <section className={`dock dock--nod${mode === 'nodded' ? ' is-done' : ''}${armed ? ' is-armed' : ''}`} aria-label="Nod at a teammate">
        <header className="dock__head">
          <p className="dock__step">
            <span className="dock__stepk" aria-hidden="true">
              頷
            </span>
            <span>
              <b>The flop.</b> Nod at one teammate, or pass.
            </span>
          </p>
          {clock ? <Ring clock={clock} /> : null}
        </header>
        {coach && <p className="dock__coach">{coach}</p>}
        <div className="dock__mates" role="group" aria-label="Your teammates">
          {mates.map((s, i) => (
            <MateChip
              key={s.id}
              seat={s}
              index={i}
              chosen={chosen === s.id}
              disabled={mode !== 'nod'}
              onNod={() => nodAt(s.id)}
            />
          ))}
          <button
            type="button"
            className={`pass${chosen === null ? ' is-chosen' : ''}`}
            disabled={mode !== 'nod'}
            aria-keyshortcuts="P"
            onClick={() => nodAt(null)}
          >
            <span>Pass</span>
            <span className="kbd" aria-hidden="true">
              P
            </span>
          </button>
        </div>
        <footer className="dock__foot">
          {mode === 'nodded' ? (
            <p className="dock__done" aria-live="polite">
              <b>{chosen ? `Nodded at ${seatById(view, chosen)?.name ?? 'a teammate'}.` : 'Passed.'}</b> Nods turn over when everyone is in.
            </p>
          ) : (
            <p className="dock__keys" aria-hidden="true">
              Tap a teammate, or press <span className="kbd">1</span>–<span className="kbd">{Math.min(6, mates.length)}</span>
            </p>
          )}
          {status}
        </footer>
      </section>
    );
  }

  // In or Out.
  const chosen = mine?.stance ?? me?.stance ?? null;
  const onMe = me ? nodsOn(view, me.id) : 0;
  return (
    <section className={`dock dock--call${mode === 'called' ? ' is-done' : ''}`} aria-label="In or Out">
      <header className="dock__head">
        <p className="dock__step">
          <span className="dock__stepk" aria-hidden="true">
            決
          </span>
          <span>
            <b>The river.</b> {onMe === 0 ? 'Nobody nodded at you.' : onMe === 1 ? 'One teammate nodded at you.' : `${onMe} teammates nodded at you.`}
          </span>
        </p>
        {clock ? <Ring clock={clock} /> : null}
      </header>
      {coach && <p className="dock__coach">{coach}</p>}
      <div className="dock__picks" role="group" aria-label="Choose In or Out">
        {PICKS.map((p) => {
          const isChosen = chosen === p.stance;
          return (
            <button
              key={p.stance}
              type="button"
              className={`pick pick--${p.stance}${isChosen ? ' is-chosen' : ''}`}
              disabled={mode !== 'call'}
              aria-pressed={mode === 'called' ? isChosen : undefined}
              aria-keyshortcuts={p.key}
              onClick={() => pick(p.stance)}
              onMouseEnter={() => mode === 'call' && sfx.hover()}
            >
              <span className="pick__kanji" aria-hidden="true">
                {p.kanji}
              </span>
              <span className="pick__label">
                {p.label}
                <span className="kbd" aria-hidden="true">
                  {p.key}
                </span>
              </span>
              <span className="pick__hint">{p.hint}</span>
              {mode === 'called' && isChosen && (
                <span className="pick__seal" aria-hidden="true">
                  <span>{p.kanji}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <footer className="dock__foot">
        {mode === 'called' ? (
          <p className="dock__done" aria-live="polite">
            <b>{chosen === 'out' ? "You're Out." : "You're In."}</b> Everyone turns over together.
          </p>
        ) : (
          <p className="dock__keys" aria-hidden="true">
            Press <span className="kbd">I</span> or <span className="kbd">O</span>
          </p>
        )}
        {status}
      </footer>
    </section>
  );
}

function MateChip({
  seat,
  index,
  chosen,
  disabled,
  onNod,
}: {
  seat: SeatView;
  index: number;
  chosen: boolean;
  disabled: boolean;
  onNod: () => void;
}) {
  return (
    <button
      type="button"
      className={`mate${chosen ? ' is-chosen' : ''}${seat.locked ? ' is-locked' : ''}`}
      disabled={disabled}
      aria-pressed={chosen}
      aria-keyshortcuts={String(index + 1)}
      aria-label={`Nod at ${seat.name}`}
      onClick={onNod}
      onMouseEnter={() => !disabled && sfx.hover()}
    >
      <span className="mate__n" aria-hidden="true">
        {index + 1}
      </span>
      <AvatarSeal avatar={seat.avatar} size={26} />
      <span className="mate__name">{seat.name}</span>
      <CardPair cards={seat.cards} size="xs" />
      {chosen && (
        <span className="mate__nod" aria-hidden="true">
          頷
        </span>
      )}
    </button>
  );
}

function Status({ view, waiting, mode }: { view: GameView; waiting: SeatView[]; mode: string }) {
  const done = mode === 'nodded' || mode === 'called';
  return (
    <p className="dock__status" aria-live="polite">
      {waiting.length ? (
        <>Waiting on {listNames(waiting.map((s) => s.name))}</>
      ) : done ? (
        <>Everyone's in. {view.phase === 'nod' ? 'Turning the nods.' : 'Flipping.'}</>
      ) : (
        <>Everyone else has decided.</>
      )}
    </p>
  );
}

export function Ring({ clock }: { clock: Countdown }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className={`ring${clock.urgent ? ' is-urgent' : ''}`} role="timer" aria-label={`${clock.seconds} seconds left`}>
      <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
        <circle cx="28" cy="28" r={r} className="ring__bg" />
        <circle cx="28" cy="28" r={r} className="ring__fg" strokeDasharray={c} strokeDashoffset={ringOffset(clock.fraction, r)} />
      </svg>
      <span className="ring__n" aria-hidden="true">
        {clock.seconds}
      </span>
    </div>
  );
}
