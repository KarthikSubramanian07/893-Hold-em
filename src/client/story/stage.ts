// Where the story meets the app. Pure decisions the HUD and the paper pages
// share: which egg lines get said where, where the subtitles sit, and when the
// lobby gets a word from the Master.

import type { GameView, Phase } from '../../engine/types';
import type { EggDetail, EggId } from './eggs';
import type { Line } from './types';

/**
 * Where an egg was found.
 *  - `street`: the paper pages (landing, matchbook, a closed door).
 *  - `door`: a table route that hasn't opened yet (the shoji is still shut).
 *  - `table`: a table that's open, with the narrator on.
 */
export type EggVenue = 'street' | 'door' | 'table';

/** Eggs the table's welcome already speaks for, the moment the doors open. */
const WELCOMED: readonly EggId[] = ['oyabun', 'master', 'cat-name', 'code-893', 'three-am'];

/** The Master's remark for an egg in this venue, or nothing. */
export function eggRemark(egg: EggDetail, venue: EggVenue): Line | null {
  if (!egg.line) return null;
  // Behind the shoji, nobody's listening yet; the welcome will cover the name.
  if (venue === 'door') return null;
  // At the table, 3 a.m. and the 893 code belong to the welcome alone.
  if (venue === 'table' && (egg.id === 'three-am' || egg.id === 'code-893')) return null;
  // Off the table there's no welcome, so every remark is fair.
  if (venue === 'street' && egg.id === 'code-893') return null;
  return egg.line;
}

/** True for the eggs a welcome line covers on its own. */
export function welcomedEgg(id: EggId): boolean {
  return WELCOMED.includes(id);
}

export type SubtitleSlot = 'float' | 'strip' | 'aside';

/**
 * Where the subtitles sit in the HUD for a phase.
 *  - `float`: during a hand, at the top of the scene under the bar, where the
 *    House sits. The bottom of the screen belongs to your cards and the dock.
 *  - `strip`: a strip reserved at the foot of the screen, under the paper
 *    (the lobby card; the receipt on a phone), so a line never lands on it.
 *  - `aside`: at the end of the night on a wide screen, the Master's last
 *    word sits in the column beside the receipt, over the buttons.
 */
export function subtitleSlot(phase: Phase | null | undefined, wide = true): SubtitleSlot {
  if (phase === 'nod' || phase === 'call' || phase === 'showdown') return 'float';
  if (phase === 'over' && wide) return 'aside';
  return 'strip';
}

/**
 * Should this view change count toward the matchbook? Only changes you saw
 * happen: the first view after (re)connecting is where you came in, not
 * something you did, so a reload on the receipt can't count the night twice.
 */
export function witnessed(prev: GameView | null, next: GameView): boolean {
  return prev !== null && prev.code === next.code;
}

/** The Master glances up from the glasses about this often in the lobby. */
export const IDLE_EVERY_MS = 30_000;

/** Is it a quiet moment worth an idle line? Only in the lobby, and not right after someone spoke. */
export function idleDue(view: GameView | null, lastSpokeAt: number, now: number): boolean {
  return view?.phase === 'lobby' && now - lastSpokeAt >= IDLE_EVERY_MS;
}
