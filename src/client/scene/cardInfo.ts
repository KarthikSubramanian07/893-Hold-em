// Pure card vocabulary for the painted textures: labels, kanji, colours, and
// the cache keys the texture painter uses.

import type { Avatar, Card, Rank, Slot, Stance, Suit } from '../../engine/types';
import { PALETTE } from './palette';

export const RANK_LABEL: Record<Rank, string> = {
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  T: '10',
  J: 'J',
  Q: 'Q',
  K: 'K',
  A: 'A',
};

/** A small kanji flourish printed on each card. */
export const RANK_KANJI: Record<Rank, string> = {
  '2': '二',
  '3': '三',
  '4': '四',
  '5': '五',
  '6': '六',
  '7': '七',
  '8': '八',
  '9': '九',
  T: '十',
  J: '侍',
  Q: '姫',
  K: '王',
  A: '壱',
};

export const SUIT_NAME: Record<Suit, string> = { s: 'spade', h: 'heart', d: 'diamond', c: 'club' };

export interface CardInfo {
  rank: Rank;
  suit: Suit;
  label: string;
  kanji: string;
  red: boolean;
  ink: string;
}

export function cardInfo(card: Card): CardInfo {
  const rank = card[0] as Rank;
  const suit = card[1] as Suit;
  const red = suit === 'h' || suit === 'd';
  return { rank, suit, label: RANK_LABEL[rank], kanji: RANK_KANJI[rank], red, ink: red ? PALETTE.shu : PALETTE.sumi };
}

/** Texture cache key for a slot: one per face, one shared back, nothing for undealt. */
export function cardTextureKey(slot: Slot): string | null {
  if (slot === null) return null;
  if (slot === 'back') return 'back';
  return `face:${slot}`;
}

export function isFace(slot: Slot): slot is Card {
  return slot !== null && slot !== 'back';
}

export const STANCE_KANJI: Record<Stance | 'hidden', string> = {
  fold: '降',
  stay: '待',
  raise: '攻',
  hidden: '伏',
};

export const STANCE_INK: Record<Stance | 'hidden', string> = {
  fold: PALETTE.sumi,
  stay: PALETTE.ai,
  raise: PALETTE.shu,
  hidden: PALETTE.sumi2,
};

export const AVATAR_KANJI: Record<Avatar, string> = {
  kitsune: '狐',
  tanuki: '狸',
  koi: '鯉',
  tsuru: '鶴',
  tora: '虎',
  usagi: '兎',
  karasu: '烏',
  hebi: '蛇',
};

/**
 * Text drawn with the troika font must stay inside the glyphs we ship, or
 * troika would fetch a fallback font from a CDN. Keep Latin-1 and swap the rest.
 */
export function plateText(name: string, max = 12): string {
  const safe = Array.from(name)
    .map((ch) => (/^[\u0020-\u007e\u00a0-\u00ff]$/.test(ch) ? ch : '·'))
    .join('')
    .trim();
  const clipped = safe.slice(0, max).trim();
  return clipped || '·';
}
