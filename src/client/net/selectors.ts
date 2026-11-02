// Read-only helpers over a GameView. Pure, so the HUD stays thin and testable.
import type { GameView, HandOutcome, SeatView, Stance, Street, Verdict } from '../../engine/types';
import type { Reaction } from '../../protocol';
import { MAX_STAKE } from '../../engine/rules';

export const STREET_NAMES: Record<Street, string> = { 0: 'Pre-flop', 1: 'Flop', 2: 'Turn', 3: 'River' };

export function mySeat(view: GameView): SeatView | null {
  return view.you ? (view.seats.find((s) => s.id === view.you) ?? null) : null;
}

export function amHost(view: GameView): boolean {
  return mySeat(view)?.host ?? false;
}

export function seatById(view: GameView, id: string): SeatView | null {
  return view.seats.find((s) => s.id === id) ?? null;
}

/** Active seats (other than you) that have not locked a call yet. */
export function stillDeciding(view: GameView): SeatView[] {
  if (view.phase !== 'call') return [];
  return view.seats.filter((s) => s.active && !s.locked && s.id !== view.you);
}

/** Humans who count toward the "next" quorum. */
export function readyQuorum(view: GameView): { ready: number; needed: number } {
  const humans = view.seats.filter((s) => !s.bot && s.connected);
  const ready = humans.filter((s) => view.ready.includes(s.id)).length;
  return { ready, needed: humans.length };
}

/** What you called this street, if anything is known. */
export function myCall(view: GameView): Stance | null {
  const me = mySeat(view);
  const c = me?.calls[view.street];
  return c === 'fold' || c === 'stay' || c === 'raise' ? c : null;
}

export type DockMode = 'decide' | 'locked' | 'folded' | 'spectator' | 'none';

export function dockMode(view: GameView, localLocked: boolean): DockMode {
  if (view.phase !== 'call') return 'none';
  const me = mySeat(view);
  if (!me) return 'spectator';
  if (!me.active) return 'folded';
  if (me.locked || localLocked) return 'locked';
  return 'decide';
}

export const OUTCOME_LINE: Record<HandOutcome, string> = {
  crew: 'Paid.',
  house: 'Burned.',
  tie: 'Even.',
  walked: 'Walked.',
};

export const OUTCOME_SUB: Record<HandOutcome, string> = {
  crew: "The crew's best hand beat the House's. Every bet still in gets paid.",
  house: "The House's best hand won. Nobody gets paid this hand.",
  tie: 'The crew and the House tied. Nobody gets paid.',
  walked: 'Everyone folded. Walking away still adds heat.',
};

/**
 * What the hand just did to you, in one plain sentence: whether your bet was
 * paid, and whether the mask watching you beat you (which is what draws
 * heat). Null for spectators and before the showdown.
 */
export function yourHand(view: GameView): string | null {
  const r = view.result;
  const me = mySeat(view);
  if (!r || !me || view.phase === 'lobby') return null;
  if (!me.active) return 'You folded, so this hand cost you nothing.';
  const mult = view.rule === 'homura' ? 2 : 1;
  const bet = (me.stake ?? 1) * mult;
  const mine = me.hand?.name ? me.hand.name.charAt(0).toLowerCase() + me.hand.name.slice(1) : 'hand';
  const paid = r.outcome === 'crew' ? `Your bet of ${bet} was paid` : 'Your bet was not paid';
  const seen = (r.burned ?? []).includes(me.id);
  return seen
    ? `${paid}, and the mask watching you beat your ${mine}: +${bet} heat.`
    : `${paid}, and your ${mine} held against the mask watching you: no heat.`;
}

export const VERDICT_LINE: Record<Verdict, string> = {
  clean: 'Clean getaway',
  raid: 'Raid',
  short: 'Came up short',
};

export const VERDICT_SUB: Record<Verdict, string> = {
  clean: 'Out the back door with the take. Nobody saw a thing.',
  raid: 'Sirens on the stairs. The night is over.',
  short: 'Six hands and not enough to show for it.',
};

export function canReact(view: GameView): boolean {
  return view.phase === 'lobby' || view.phase === 'showdown' || view.phase === 'over';
}

export function canStart(view: GameView): boolean {
  return view.phase === 'lobby' && amHost(view) && view.seats.length >= 2;
}

export type { Reaction };

/** What each call does to you, in plain words, given your current bet. */
export function callHint(stance: Stance, stake: number): string {
  if (stance === 'fold') return 'Sit this one out';
  if (stance === 'stay') return `Keep betting ${stake}`;
  return stake >= MAX_STAKE ? 'At the max' : `Bet ${stake + 1}`;
}
