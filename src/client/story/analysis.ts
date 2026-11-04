// Reading a GameView for story beats. Shared by the narrator (what everyone at
// the table hears) and the stamps (what you, personally, earned). Pure.

import type { Card, GameView, HandValue, HistoryEntry, SeatView, Slot } from '../../engine/types';
import type { MarkerMark, NodKind, ShowdownKind } from './types';

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

const MONSTER: ReadonlySet<HandValue['category']> = new Set(['straight', 'flush', 'full-house', 'quads', 'straight-flush']);

/** A hand worth a fuss when it turns over: a straight or better. */
export function isMonster(hand: HandValue | null | undefined): boolean {
  return !!hand && MONSTER.has(hand.category);
}

/** How many nods `id` received this hand (once the nods are public). */
export function nodsOn(view: GameView, id: string): number {
  return view.seats.filter((s) => s.nod === id && s.id !== id).length;
}

/** Someone who went Out and would have beaten the House. */
export function satOut(view: GameView): SeatView | null {
  const r = view.result;
  if (!r) return null;
  return view.seats.find((s) => s.stance === 'out' && r.couldHave.includes(s.id)) ?? null;
}

/** The single most story-worthy reading of a resolved hand. */
export function classifyShowdown(view: GameView): { kind: ShowdownKind; seat?: SeatView } {
  const r = view.result;
  if (!r) throw new Error('classifyShowdown needs a result');
  const champ = championSeat(view);

  if (isRoyal(r.crewBest) || isRoyal(r.houseBest)) return { kind: 'royal' };
  if (champ && playedYakuza(champ, view.board)) return { kind: 'yakuza', seat: champ };
  if (r.outcome !== 'crew') {
    const out = satOut(view);
    if (out) return { kind: 'sat-out', seat: out };
  }
  if (r.outcome === 'walked') return { kind: 'walked' };
  if (r.outcome === 'house' && r.crewBest && BIG.has(r.crewBest.category)) return { kind: 'bad-beat' };
  if (r.outcome === 'crew') {
    if (r.ins.length >= 2 && r.ins.length === view.seats.length) return { kind: 'all-in', seat: champ ?? undefined };
    if (champ && nodsOn(view, champ.id) === 0 && view.seats.length > 2) return { kind: 'blind-carry', seat: champ };
    if (champ && nodsOn(view, champ.id) > 0) return { kind: 'nodded-carry', seat: champ };
  }
  if (Math.abs(r.moved) >= 4) return { kind: 'big-swing' };
  return { kind: r.outcome };
}

/** What the nods said, if anything worth a word, once they turn over. */
export function nodKind(view: GameView): { kind: NodKind; seats: SeatView[] } | null {
  const nods = view.seats.filter((s) => s.nod && s.nod !== s.id);
  if (nods.length === 0) return view.seats.length >= 2 ? { kind: 'all-pass', seats: [] } : null;
  // Everyone but one seat nodded at that seat.
  for (const who of view.seats) {
    const at = nods.filter((s) => s.nod === who.id).length;
    if (at >= 2 && at === view.seats.length - 1) return { kind: 'pile-on', seats: [who] };
  }
  for (const a of nods) {
    const b = view.seats.find((s) => s.id === a.nod);
    if (b && b.nod === a.id && a.id < b.id) return { kind: 'mutual', seats: [a, b] };
  }
  return null;
}

/** The marker arriving one step from either end (short of the end itself). */
export function markerCrossed(prev: Pick<GameView, 'meter' | 'door' | 'sirens'>, next: Pick<GameView, 'meter' | 'door' | 'sirens'>): MarkerMark | null {
  if (next.meter === prev.meter) return null;
  if (next.meter === next.door - 1 && prev.meter < next.door - 1) return 'door-near';
  if (next.meter === -(next.sirens - 1) && prev.meter > -(next.sirens - 1)) return 'sirens-near';
  return null;
}

/** The lowest the marker went over a night's history (0 if it never dipped). */
export function lowestMeter(history: readonly Pick<HistoryEntry, 'moved'>[]): number {
  let m = 0;
  let low = 0;
  for (const h of history) {
    m += h.moved;
    low = Math.min(low, m);
  }
  return low;
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
