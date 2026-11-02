// Read-only helpers over a GameView. Pure, so the HUD stays thin and testable.
import type { GameView, HandOutcome, SeatView, Stance, Street, Verdict } from '../../engine/types';
import type { Reaction } from '../../protocol';

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
  crew: 'Clean.',
  house: 'Burned.',
  tie: 'Push.',
  walked: 'Walked.',
};

export const OUTCOME_SUB: Record<HandOutcome, string> = {
  crew: 'The crew takes the pot.',
  house: 'The House wins. The heat climbs.',
  tie: 'Dead even. Nobody moves.',
  walked: 'Everyone folded. Somebody noticed.',
};

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
