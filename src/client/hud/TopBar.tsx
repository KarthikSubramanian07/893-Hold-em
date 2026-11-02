// The calm strip across the top: where you are, how the night is going.
import { useEffect, useRef, useState } from 'react';
import { RULES } from '../../engine/rules';
import type { GameView } from '../../engine/types';
import { sfx } from '../audio';
import { IconCopy, IconSound } from '../ui/icons';
import { Seal } from '../ui/Seal';
import { copyInvite } from './invite';

export function TopBar({
  view,
  muted,
  onMute,
  onRules,
}: {
  view: GameView;
  muted: boolean;
  onMute: () => void;
  onRules: () => void;
}) {
  const inNight = view.phase !== 'lobby';
  return (
    <header className="top">
      <div className="top__left">
        <Seal chars="八九三" shape="tall" size={16} seed={4} />
        <span className="top__code" aria-label={`Table code ${view.code.split('').join(' ')}`}>
          {view.code}
        </span>
        <button type="button" className="top__invite" onClick={() => void copyInvite(view.code)} onMouseEnter={() => sfx.hover()}>
          <IconCopy size={15} />
          <span>Copy invite link</span>
        </button>
      </div>

      {inNight && (
        <div className="top__mid">
          <HandPips hand={view.hand} hands={view.hands} />
          <TakeMeter take={view.take} target={view.target} />
          <HeatMeter heat={view.heat} limit={view.heatLimit} />
        </div>
      )}

      <div className="top__right">
        {view.rule && <RuleChip id={view.rule} />}
        <button
          type="button"
          className="icon-btn top__icon"
          onClick={onMute}
          aria-pressed={muted}
          aria-label={muted ? 'Sound off. Turn sound on' : 'Sound on. Turn sound off'}
        >
          <IconSound muted={muted} />
        </button>
        <button type="button" className="icon-btn top__icon top__q" onClick={onRules} aria-label="House rules">
          ?
        </button>
      </div>
    </header>
  );
}

function HandPips({ hand, hands }: { hand: number; hands: number }) {
  return (
    <div className="pips" role="img" aria-label={`Hand ${hand} of ${hands}`}>
      <span className="top__k">Hand</span>
      <span className="pips__row" aria-hidden="true">
        {Array.from({ length: hands }, (_, i) => (
          <i key={i} className={i + 1 < hand ? 'done' : i + 1 === hand ? 'now' : ''} />
        ))}
      </span>
      <span className="top__v">
        {hand}
        <span className="top__of">/{hands}</span>
      </span>
    </div>
  );
}

function TakeMeter({ take, target }: { take: number; target: number }) {
  const pct = target > 0 ? Math.min(100, (take / target) * 100) : 0;
  return (
    <div className="meter meter--take" role="meter" aria-label="Take" aria-valuemin={0} aria-valuemax={target} aria-valuenow={take} aria-valuetext={`${take} of ${target} yen target`}>
      <span className="top__k">
        Take <span className="meter__kanji">円</span>
      </span>
      <span className="meter__track" aria-hidden="true">
        <span className="meter__fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="top__v">
        {take}
        <span className="top__of">/{target}</span>
      </span>
    </div>
  );
}

function HeatMeter({ heat, limit }: { heat: number; limit: number }) {
  const hot = limit - heat <= 2;
  return (
    <div
      className={`meter meter--heat${hot ? ' is-hot' : ''}`}
      role="meter"
      aria-label="Heat"
      aria-valuemin={0}
      aria-valuemax={limit}
      aria-valuenow={heat}
      aria-valuetext={`${heat} of ${limit}. ${hot ? 'Close to a raid.' : ''}`}
    >
      <span className="top__k">
        Heat <span className="meter__kanji">熱</span>
      </span>
      <span className="heat" aria-hidden="true">
        {Array.from({ length: limit }, (_, i) => (
          <i key={i} className={i < heat ? 'on' : ''} />
        ))}
      </span>
      <span className="top__v">
        {heat}
        <span className="top__of">/{limit}</span>
      </span>
    </div>
  );
}

function RuleChip({ id }: { id: NonNullable<GameView['rule']> }) {
  const r = RULES[id];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="rule" ref={ref}>
      <button
        type="button"
        className={`rule__chip rule__chip--${r.kind}`}
        aria-expanded={open}
        aria-controls="rule-pop"
        onClick={() => {
          sfx.click();
          setOpen((o) => !o);
        }}
      >
        <span className="rule__kanji">{r.kanji}</span>
        <span className="rule__name">{r.name}</span>
      </button>
      {open && (
        <div id="rule-pop" className="rule__pop" role="dialog" aria-label={`House Rule: ${r.name}`}>
          <p className="label rule__k">House Rule · this hand</p>
          <p className="rule__title">
            <span>{r.kanji}</span> {r.name} <span className="rule__romaji">{r.romaji}</span>
          </p>
          <p className="rule__text">{r.text}</p>
          <p className="rule__flavor">“{r.flavor}”</p>
        </div>
      )}
    </div>
  );
}
