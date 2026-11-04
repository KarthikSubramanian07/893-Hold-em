// The calm strip across the top: where you are, how the night is going.
import type { ReactNode } from 'react';
import { TABLES } from '../../engine/rules';
import type { GameView } from '../../engine/types';
import { sfx } from '../audio';
import { IconCopy, IconSound } from '../ui/icons';
import { Seal } from '../ui/Seal';
import { isPracticeCode } from '../net/practice';
import { meterProgress } from '../net/selectors';
import { copyInvite } from './invite';
import './practice.css';

export function TopBar({
  view,
  muted,
  onMute,
  onRules,
  extra,
}: {
  view: GameView;
  muted: boolean;
  onMute: () => void;
  onRules: () => void;
  /** Anything that lives on the bar itself (on some nights, the cat). */
  extra?: ReactNode;
}) {
  const inNight = view.phase !== 'lobby';
  return (
    <header className="top">
      <div className="top__left">
        <Seal chars="八九三" shape="tall" size={16} seed={4} />
        <span className="top__code" aria-label={`Table code ${view.code.split('').join(' ')}`}>
          {view.code}
        </span>
        {isPracticeCode(view.code) ? (
          <span className="top__practice">
            <b aria-hidden="true">練</b>
            <span>Practice</span>
          </span>
        ) : (
          <button type="button" className="top__invite" onClick={() => void copyInvite(view.code)} onMouseEnter={() => sfx.hover()}>
            <IconCopy size={15} />
            <span>Copy invite link</span>
          </button>
        )}
      </div>

      {inNight && (
        <div className="top__mid">
          <HandCount hand={view.hand} lastOrders={view.lastOrders} />
          <Track view={view} />
        </div>
      )}

      <div className="top__right">
        {extra}
        <TableTag view={view} />
        <button
          type="button"
          className="icon-btn top__icon"
          onClick={onMute}
          aria-pressed={muted}
          aria-label={muted ? 'Sound off. Turn sound on' : 'Sound on. Turn sound off'}
        >
          <IconSound muted={muted} />
        </button>
        <button type="button" className="icon-btn top__icon top__q" onClick={onRules} aria-label="How to play">
          ?
        </button>
      </div>
    </header>
  );
}

function HandCount({ hand, lastOrders }: { hand: number; lastOrders: number }) {
  const last = hand >= lastOrders;
  return (
    <div className={`hcount${last ? ' is-last' : ''}`} title={`Hand ${hand}. Last orders after hand ${lastOrders}.`}>
      <span className="top__k">{last ? 'Last orders' : 'Hand'}</span>
      <span className="top__v">
        {hand}
        <span className="top__of">/{lastOrders}</span>
      </span>
    </div>
  );
}

/**
 * The one meter: sirens on the left, the door on the right, the marker
 * somewhere between. One tick per step.
 */
export function Track({ view, size = 'top' }: { view: Pick<GameView, 'meter' | 'door' | 'sirens'>; size?: 'top' | 'big' }) {
  const p = meterProgress(view);
  const ticks = Array.from({ length: p.span + 1 }, (_, i) => i - p.sirens);
  const near = p.toSirens <= 2 ? ' is-hot' : p.toDoor <= 2 ? ' is-close' : '';
  return (
    <div
      className={`track track--${size}${near}`}
      role="meter"
      aria-label="The marker"
      aria-valuemin={-p.sirens}
      aria-valuemax={p.door}
      aria-valuenow={p.meter}
      aria-valuetext={`${p.toDoor} ${p.toDoor === 1 ? 'step' : 'steps'} to the door, ${p.toSirens} to the sirens.`}
      title={`${p.toDoor} to the door, ${p.toSirens} to the sirens`}
    >
      <span className="track__end track__end--sirens" aria-hidden="true">
        <b>警</b>
        <span>{p.toSirens}</span>
      </span>
      <span className="track__rail" aria-hidden="true">
        <span className="track__ticks">
          {ticks.map((t) => (
            <i key={t} className={t === 0 ? 'is-start' : t < 0 ? 'is-red' : 'is-gold'} />
          ))}
        </span>
        <span className="track__marker" style={{ left: `${p.fraction * 100}%` }} />
      </span>
      <span className="track__end track__end--door" aria-hidden="true">
        <span>{p.toDoor}</span>
        <b>門</b>
      </span>
    </div>
  );
}

function TableTag({ view }: { view: GameView }) {
  const t = TABLES[view.config.difficulty];
  return (
    <span className="ttag" title={`${t.name}: the House holds ${t.house} cards and shows one.`}>
      <b aria-hidden="true">{t.kanji}</b>
      <span>
        {t.name}
        <small>House holds {t.house}</small>
      </span>
    </span>
  );
}
