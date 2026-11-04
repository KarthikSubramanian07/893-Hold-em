// A playing card at HUD size: paper, ink, a red suit where it belongs. Backs
// carry a small "?" so your own hand reads as the one thing you can't see.
import type { CSSProperties } from 'react';
import type { Slot } from '../../engine/types';

const SUIT_GLYPH = { s: '♠', h: '♥', d: '♦', c: '♣' } as const;
const SUIT_WORD = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' } as const;
const RANK_WORD: Record<string, string> = {
  T: '10',
  J: 'jack',
  Q: 'queen',
  K: 'king',
  A: 'ace',
};

export function cardLabel(slot: Slot): string {
  if (!slot) return 'no card';
  if (slot === 'back') return 'face down';
  const r = slot[0]!;
  const s = slot[1] as keyof typeof SUIT_WORD;
  return `${RANK_WORD[r] ?? r} of ${SUIT_WORD[s]}`;
}

export function MiniCard({
  slot,
  size = 'sm',
  flip = false,
  delay = 0,
}: {
  slot: Slot;
  size?: 'xs' | 'sm' | 'lg';
  /** Start face down and turn over (the showdown reveal). */
  flip?: boolean;
  delay?: number;
}) {
  if (!slot) return <span className={`mc mc--${size} mc--empty`} aria-hidden="true" />;
  const back = slot === 'back';
  const rank = back ? '' : slot[0] === 'T' ? '10' : slot[0]!;
  const suit = back ? null : (slot[1] as keyof typeof SUIT_GLYPH);
  const red = suit === 'h' || suit === 'd';
  const style = { '--delay': `${delay}ms` } as CSSProperties;
  const face = (
    <span className={`mc__face${red ? ' is-red' : ''}`}>
      <b>{rank}</b>
      <i>{suit ? SUIT_GLYPH[suit] : ''}</i>
    </span>
  );
  const backFace = (
    <span className="mc__back">
      <span>?</span>
    </span>
  );
  return (
    <span
      className={`mc mc--${size}${back ? ' is-back' : ''}${flip ? ' is-flip' : ''}`}
      style={style}
      role="img"
      aria-label={cardLabel(slot)}
    >
      {flip ? (
        <span className="mc__inner">
          {backFace}
          {face}
        </span>
      ) : back ? (
        backFace
      ) : (
        face
      )}
    </span>
  );
}

export function CardPair({ cards, size = 'sm' }: { cards: Slot[]; size?: 'xs' | 'sm' | 'lg' }) {
  return (
    <span className="mc-pair">
      {cards.map((c, i) => (
        <MiniCard key={i} slot={c} size={size} />
      ))}
    </span>
  );
}
