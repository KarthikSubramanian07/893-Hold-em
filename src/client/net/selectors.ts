// Read-only helpers over a GameView. Pure, so the HUD stays thin and testable.
import type { GameView, HandOutcome, HandValue, SeatView, Stance, Verdict } from '../../engine/types';
import type { Reaction } from '../../protocol';

export function mySeat(view: GameView): SeatView | null {
  return view.you ? (view.seats.find((s) => s.id === view.you) ?? null) : null;
}

export function amHost(view: GameView): boolean {
  return mySeat(view)?.host ?? false;
}

export function seatById(view: GameView, id: string | null | undefined): SeatView | null {
  return id ? (view.seats.find((s) => s.id === id) ?? null) : null;
}

/** Everyone at the table but you. */
export function teammates(view: GameView): SeatView[] {
  return view.seats.filter((s) => s.id !== view.you);
}

/**
 * The teammates you can see this hand, and so may nod at: the two beside
 * you, starting with the one after you round the table.
 */
export function inSight(view: GameView): SeatView[] {
  const at = view.seats.findIndex((s) => s.id === view.you);
  if (at < 0) return [];
  const ring = [...view.seats.slice(at + 1), ...view.seats.slice(0, at)];
  return ring.filter((s) => s.inSight);
}

/** Is a hand being played (nod or call)? */
export function inHand(view: GameView): boolean {
  return view.phase === 'nod' || view.phase === 'call';
}

/** Seat ids that have decided in the current phase. */
export function lockedSeats(view: GameView): string[] {
  return inHand(view) ? view.seats.filter((s) => s.locked).map((s) => s.id) : [];
}

/** Seats (other than you) that have not decided yet in this phase. */
export function stillDeciding(view: GameView): SeatView[] {
  if (!inHand(view)) return [];
  return view.seats.filter((s) => !s.locked && s.id !== view.you);
}

/** Humans who count toward the "next" quorum. */
export function readyQuorum(view: GameView): { ready: number; needed: number } {
  const humans = view.seats.filter((s) => !s.bot && s.connected);
  const ready = humans.filter((s) => view.ready.includes(s.id)).length;
  return { ready, needed: humans.length };
}

/**
 * Your nod this hand: a seat id, `null` if you passed, `undefined` if you have
 * not decided yet (or are not seated).
 */
export function myNod(view: GameView): string | null | undefined {
  const me = mySeat(view);
  if (!me || view.phase === 'lobby') return undefined;
  if (me.nod) return me.nod;
  // Past the nod phase, a seat with no nod passed.
  if (view.phase === 'nod') return me.locked ? null : undefined;
  return null;
}

/** Have every seat's nods been turned over? They are, from the call on. */
export function nodsRevealed(view: GameView): boolean {
  return view.phase === 'call' || view.phase === 'showdown' || view.phase === 'over';
}

/** Seats that nodded at `id` (only known once the nods are revealed, except your own). */
export function noddersOf(view: GameView, id: string): SeatView[] {
  return view.seats.filter((s) => s.nod === id && s.id !== id);
}

/** How many nods `id` received this hand. */
export function nodsOn(view: GameView, id: string): number {
  return noddersOf(view, id).length;
}

/** Every revealed nod as a pair of seat ids. */
export function nodPairs(view: GameView): { from: string; to: string }[] {
  return view.seats.filter((s) => s.nod && s.nod !== s.id).map((s) => ({ from: s.id, to: s.nod! }));
}

/** Your In/Out this hand if you have picked. */
export function myStance(view: GameView): Stance | null {
  return mySeat(view)?.stance ?? null;
}

export interface MeterProgress {
  meter: number;
  door: number;
  sirens: number;
  /** Total steps from sirens to door. */
  span: number;
  /** 0 = at the sirens, 1 = at the door. */
  fraction: number;
  toDoor: number;
  toSirens: number;
  /** 0 = safe, 1 = one step from the sirens. */
  danger: number;
}

export function meterProgress(view: Pick<GameView, 'meter' | 'door' | 'sirens'>): MeterProgress {
  const door = Math.max(1, view.door);
  const sirens = Math.max(1, view.sirens);
  const meter = Math.max(-sirens, Math.min(door, view.meter));
  const span = door + sirens;
  const toSirens = sirens + meter;
  return {
    meter,
    door,
    sirens,
    span,
    fraction: toSirens / span,
    toDoor: door - meter,
    toSirens,
    danger: Math.max(0, Math.min(1, 1 - (toSirens - 1) / Math.max(1, sirens))),
  };
}

export type DockMode = 'nod' | 'nodded' | 'call' | 'called' | 'spectator' | 'none';

/** What the bottom dock should offer you right now. */
export function dockMode(view: GameView, localLocked: boolean): DockMode {
  if (!inHand(view)) return 'none';
  const me = mySeat(view);
  if (!me) return 'spectator';
  const locked = me.locked || localLocked;
  if (view.phase === 'nod') return locked ? 'nodded' : 'nod';
  return locked ? 'called' : 'call';
}

export const OUTCOME_LINE: Record<HandOutcome, string> = {
  crew: 'The crew comes out ahead.',
  house: 'The House comes out ahead.',
  tie: 'Dead even.',
  walked: 'Everyone sat out.',
};

/** "2 of 3 In beat the House", or null if nobody was In. */
export function tallyLine(view: GameView): string | null {
  const r = view.result;
  if (!r || r.ins.length === 0) return null;
  const won = r.crewChampions.length;
  return `${won} of ${r.ins.length} In beat the House`;
}

/** One plain sentence: how far the marker moved and which way. */
export function movedLine(moved: number): string {
  if (moved === 0) return 'The marker stays put.';
  const n = Math.abs(moved);
  const steps = n === 1 ? 'one step' : `${n} steps`;
  return moved > 0 ? `The marker moves ${steps} toward the door.` : `The marker moves ${steps} toward the sirens.`;
}

/** "+2" / "−1" / "±0" for compact lines. */
export function signed(moved: number): string {
  if (moved > 0) return `+${moved}`;
  if (moved < 0) return `−${-moved}`;
  return '±0';
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

const STRONG = new Set<HandValue['category']>(['straight', 'flush', 'full-house', 'quads', 'straight-flush']);

/** Is this a hand worth making a fuss about when it turns over? */
export function isMonster(hand: HandValue | null | undefined): boolean {
  return !!hand && STRONG.has(hand.category);
}

const SHORT: Partial<Record<HandValue['category'], string>> = {
  straight: 'a straight',
  flush: 'a flush',
  'full-house': 'a full house',
  'straight-flush': 'a straight flush',
};

/**
 * A hand as it reads mid-sentence: "a pair of kings", "two pair, kings and
 * sevens", "trip fives", "a flush". Monster hands get their short name so the
 * line stays punchy.
 */
export function handPhrase(hand: HandValue): string {
  if (hand.name === 'Royal flush') return 'a royal flush';
  const short = SHORT[hand.category];
  if (short) return short;
  const name = lowerFirst(hand.name);
  return hand.category === 'pair' ? `a ${name}` : name;
}

/**
 * The reveal: the first time you see your own cards. One plain line, e.g.
 * "You had a flush the whole time." Null for spectators and before the showdown.
 */
export function revealLine(view: GameView): string | null {
  const me = mySeat(view);
  const r = view.result;
  if (!me?.hand || !r) return null;
  const had = handPhrase(me.hand);
  const beat = r.couldHave.includes(me.id);
  if (me.champion) return `You had ${had}, and it beat the House.`;
  if (me.stance === 'in' && r.houseBest.score > me.hand.score) return `You had ${had}. The House had better.`;
  if (beat && me.stance === 'out') return `You had ${had} the whole time. It would have beaten the House.`;
  if (isMonster(me.hand)) return `You had ${had} the whole time.`;
  return `You had ${had}.`;
}

export const VERDICT_LINE: Record<Verdict, string> = {
  clean: 'Clean getaway',
  raid: 'Raid',
  dawn: 'Last orders',
};

export const VERDICT_SUB: Record<Verdict, string> = {
  clean: 'Out the back door before anyone looked up.',
  raid: 'Sirens on the stairs. The night is over.',
  dawn: 'The shutters came down at dawn. Nobody won, nobody was caught.',
};

export function canReact(view: GameView): boolean {
  return view.phase === 'lobby' || view.phase === 'showdown' || view.phase === 'over';
}

export function canStart(view: GameView): boolean {
  return view.phase === 'lobby' && amHost(view) && view.seats.length >= 2;
}

export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}

export type { Reaction };
