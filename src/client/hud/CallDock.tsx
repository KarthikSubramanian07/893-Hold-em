// Three stamps and a clock. The only way to talk at this table.
import { useCallback, useEffect, useState } from 'react';
import { MAX_STAKE } from '../../engine/rules';
import type { GameView, Stance } from '../../engine/types';
import { sfx } from '../audio';
import { countdown, ringOffset } from '../lib/countdown';
import { dockMode, myCall, mySeat, stillDeciding, STREET_NAMES } from '../net/selectors';
import { useTable } from '../net/store';
import { useNow } from './useNow';

const STAMPS: { stance: Stance; kanji: string; label: string; key: string; hint: string }[] = [
  { stance: 'fold', kanji: '降', label: 'Fold', key: 'F', hint: 'Step out of this hand' },
  { stance: 'stay', kanji: '待', label: 'Stay', key: 'S', hint: 'Keep your stake' },
  { stance: 'raise', kanji: '攻', label: 'Raise', key: 'R', hint: 'Stake up by one' },
];

export function CallDock({ view }: { view: GameView }) {
  const send = useTable((s) => s.send);
  const skew = useTable((s) => s.skew);
  const streetKey = `${view.hand}:${view.street}`;
  const [local, setLocal] = useState<{ key: string; stance: Stance } | null>(null);
  const localStance = local?.key === streetKey ? local.stance : null;
  const mode = dockMode(view, localStance !== null);
  const me = mySeat(view);
  const chosen = localStance ?? myCall(view);
  const stake = me?.stake ?? 1;
  const canRaise = stake < MAX_STAKE;

  const totalMs = view.config.timer * 1000;
  const now = useNow(view.deadline != null && mode !== 'none', 200);
  const clock = countdown(view.deadline, now, skew, totalMs);

  const call = useCallback(
    (stance: Stance) => {
      if (mode !== 'decide') return;
      if (stance === 'raise' && !canRaise) return;
      sfx.unlock();
      sfx.stamp();
      setLocal({ key: streetKey, stance });
      send({ t: 'call', stance });
    },
    [mode, canRaise, streetKey, send],
  );

  useEffect(() => {
    if (mode !== 'decide') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'f') call('fold');
      else if (k === 's') call('stay');
      else if (k === 'r') call('raise');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, call]);

  // Tick in the last five seconds.
  const urgentSecond = clock?.urgent ? clock.seconds : 0;
  useEffect(() => {
    if (urgentSecond > 0 && mode === 'decide') sfx.tick();
  }, [urgentSecond, mode]);

  if (mode === 'none') return null;

  const waiting = stillDeciding(view);
  const street = STREET_NAMES[view.street];

  if (mode === 'folded' || mode === 'spectator') {
    return (
      <section className="dock dock--quiet" aria-label="Your call">
        <p className="dock__quiet">
          <span className="dock__quiet-k" aria-hidden="true">
            {mode === 'folded' ? '降' : '観'}
          </span>
          <span>
            <b>{mode === 'folded' ? "You're out this hand." : "You're watching from the bar."}</b>
            <span>
              {mode === 'folded'
                ? 'Sit tight. If the crew wins, they win without you.'
                : 'Seats open up between nights. Mind the glass.'}
            </span>
          </span>
        </p>
        {clock && <Ring clock={clock} />}
      </section>
    );
  }

  return (
    <section className={`dock dock--${mode}`} aria-label={`${street} call`}>
      <div className="dock__meta">
        <p className="label dock__street">
          {street} <span aria-hidden="true">·</span> call
        </p>
        <Stake stake={stake} />
      </div>

      <div className="dock__stamps" role="group" aria-label="Choose your call">
        {STAMPS.map((s) => {
          const disabled = mode !== 'decide' || (s.stance === 'raise' && !canRaise);
          const isChosen = chosen === s.stance;
          return (
            <button
              key={s.stance}
              type="button"
              className={`stamp stamp--${s.stance}${isChosen ? ' is-chosen' : ''}`}
              disabled={disabled}
              aria-pressed={mode === 'locked' ? isChosen : undefined}
              aria-keyshortcuts={s.key}
              title={s.stance === 'raise' && !canRaise ? 'Your stake is at the maximum' : `${s.hint} (${s.key})`}
              onClick={() => call(s.stance)}
              onMouseEnter={() => !disabled && sfx.hover()}
            >
              <span className="stamp__kanji" aria-hidden="true">
                {s.kanji}
              </span>
              <span className="stamp__label">
                {s.label}
                <span className="kbd" aria-hidden="true">
                  {s.key}
                </span>
              </span>
            </button>
          );
        })}
        {mode === 'locked' && chosen && (
          <span className={`hanko hanko--${chosen}`} aria-hidden="true">
            <span>{STAMPS.find((s) => s.stance === chosen)!.kanji}</span>
          </span>
        )}
      </div>

      <div className="dock__side">
        {clock ? <Ring clock={clock} /> : <span className="label dock__notimer">No clock</span>}
        <p className="dock__status" aria-live="polite">
          {mode === 'locked' ? (
            waiting.length ? (
              <>
                <b>Locked.</b> Waiting on {listNames(waiting.map((s) => s.name))}.
              </>
            ) : (
              <>
                <b>Locked.</b> Everyone's in. Flipping.
              </>
            )
          ) : waiting.length ? (
            <>Still deciding: {listNames(waiting.map((s) => s.name))}</>
          ) : (
            <>Everyone else is locked.</>
          )}
        </p>
      </div>
    </section>
  );
}

function Stake({ stake }: { stake: number }) {
  return (
    <div className="stake" role="img" aria-label={`Your stake: ${stake} of ${MAX_STAKE}`}>
      <span className="label">Stake</span>
      <span className="stake__chips" aria-hidden="true">
        {Array.from({ length: MAX_STAKE }, (_, i) => (
          <i key={i} className={i < stake ? 'on' : ''} />
        ))}
      </span>
    </div>
  );
}

function Ring({ clock }: { clock: NonNullable<ReturnType<typeof countdown>> }) {
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

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}
