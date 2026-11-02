// Reading a GameView for story beats. Shared by the narrator (what everyone at
// the table hears) and the stamps (what you, personally, earned). Pure.

import type { Card, GameView, HandValue, RuleId, SeatView, Slot } from '../../engine/types';
import type { HeatMark, ShowdownKind } from './types';

export function realCards(slots: readonly Slot[]): Card[] {
  return slots.filter((s): s is Card => s !== null && s !== 'back');
}

const rankOf = (c: Card) => c[0]!;

/** True when `cards` hold an 8, a 9 and a 3 between them. */
export function has893(cards: readonly Card[]): boolean {
  const r = new Set(cards.map(rankOf));
  return r.has('8') && r.has('9') && r.has('3');
}

/**
 * A seat "played 8-9-3" when its hole cards and the board hold an 8, a 9 and a
 * 3, and at least one of the three is in the hole: the board alone doesn't count.
 * The best five holding all three counts too, whatever the hole cards are.
 */
export function playedYakuza(seat: SeatView, board: readonly Slot[]): boolean {
  if (seat.hand && has893(seat.hand.best)) return true;
  const hole = realCards(seat.cards);
  if (hole.length < 2) return false;
  if (!hole.some((c) => '893'.includes(rankOf(c)))) return false;
  return has893([...hole, ...realCards(board)]);
}

export function isRoyal(hand: HandValue | null | undefined): boolean {
  if (!hand || hand.category !== 'straight-flush') return false;
  const r = new Set(hand.best.map(rankOf));
  return r.has('A') && r.has('K');
}

const BIG: ReadonlySet<HandValue['category']> = new Set(['full-house', 'quads', 'straight-flush']);

export function championSeat(view: GameView): SeatView | null {
  return view.seats.find((s) => s.champion) ?? null;
}

export function houseChampionIndex(view: GameView): number {
  const i = view.house.findIndex((h) => h.champion);
  return i < 0 ? 0 : i;
}

export function burned(view: GameView): string[] {
  return (view.result as { burned?: string[] } | null)?.burned ?? [];
}

const HIGH_RANKS = new Set(['Q', 'K', 'A']);

/**
 * The champion "almost folded": never raised, no pocket pair, nothing above a
 * jack in the hole. Somebody else's raise kept them in, and they carried it.
 */
export function quietChampion(seat: SeatView): boolean {
  if (seat.calls.some((c) => c === 'raise')) return false;
  const hole = realCards(seat.cards);
  if (hole.length < 2) return false;
  if (rankOf(hole[0]!) === rankOf(hole[1]!)) return false;
  return !hole.some((c) => HIGH_RANKS.has(rankOf(c)));
}

/** An active rider, not the champion, with nothing but a high card. */
export function trashRider(view: GameView): SeatView | null {
  return view.seats.find((s) => s.active && !s.champion && s.hand?.category === 'high') ?? null;
}

const LOWBALL: ReadonlySet<RuleId> = new Set(['gyaku']);

/** The single most story-worthy reading of a resolved hand. */
export function classifyShowdown(view: GameView): { kind: ShowdownKind; seat?: SeatView } {
  const r = view.result;
  if (!r) throw new Error('classifyShowdown needs a result');
  const lowball = view.rule !== null && LOWBALL.has(view.rule);
  const champ = championSeat(view);

  if (r.outcome === 'walked') return { kind: 'walked' };
  if (!lowball && (isRoyal(r.crewBest) || isRoyal(r.houseBest))) return { kind: 'royal' };
  if (champ && playedYakuza(champ, view.board)) return { kind: 'yakuza', seat: champ };
  if (!lowball && r.outcome === 'house' && r.crewBest && BIG.has(r.crewBest.category)) return { kind: 'bad-beat' };
  if (view.rule === 'hebi' && r.outcome === 'house' && r.crewBest && r.crewBest.score === r.houseBest.score) {
    return { kind: 'serpent' };
  }
  if (lowball && r.outcome === 'crew') return { kind: 'reversal' };
  if (r.outcome === 'crew') {
    const actives = view.seats.filter((s) => s.active);
    if (champ && actives.length > 1 && quietChampion(champ)) return { kind: 'quiet-champion', seat: champ };
    const rider = lowball ? null : trashRider(view);
    if (rider) return { kind: 'trash-rider', seat: rider };
    if (burned(view).length > 0) return { kind: 'seen' };
  }
  return { kind: r.outcome };
}

/** The heat thresholds for a limit: half, three quarters, and one away. */
export function heatMarks(limit: number): Record<HeatMark, number> {
  return {
    half: Math.ceil(limit / 2),
    'three-quarters': Math.ceil(limit * 0.75),
    'one-away': limit - 1,
  };
}

/** The highest heat mark crossed going from `from` to `to`, short of the raid itself. */
export function heatCrossed(from: number, to: number, limit: number): HeatMark | null {
  if (to <= from || to >= limit) return null;
  const m = heatMarks(limit);
  for (const mark of ['one-away', 'three-quarters', 'half'] as const) {
    if (m[mark] > 0 && from < m[mark] && to >= m[mark]) return mark;
  }
  return null;
}

/**
 * Whose cards the Fox turned over. Everyone sees the same revealed seat face up;
 * if no other seat shows real cards, the exposed one must be the viewer.
 */
export function foxSeat(view: GameView): SeatView | null {
  const shown = view.seats.filter((s) => s.id !== view.you && realCards(s.cards).length > 0);
  if (shown.length === 1) return shown[0]!;
  if (shown.length === 0 && view.you) return view.seats.find((s) => s.id === view.you) ?? null;
  return null;
}

/** "Bar 893" tables: a room code with 8, 9, 3 in a row. */
export function is893Code(code: string): boolean {
  return code.toUpperCase().includes('893');
}

export type NameEgg = 'oyabun' | 'master' | 'cat';

/** Names the bar has opinions about. */
export function nameEgg(name: string): NameEgg | null {
  const n = name.trim().toLowerCase().normalize('NFKC');
  if (['oyabun', '親分', 'おやぶん', 'boss', 'the boss', 'kumicho', 'kumichō', '組長'].includes(n)) return 'oyabun';
  if (['master', 'the master', 'masutā', 'マスター', 'hachikubo', 'saburo', 'saburō'].includes(n)) return 'master';
  if (['kyu', 'kyū', 'kyuu', '九', 'きゅう'].includes(n)) return 'cat';
  return null;
}
