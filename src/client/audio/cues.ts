// What the table should sound like between two views. Pure: given the last
// view and the new one, return the sounds to play and when. The hook that
// plays them lives in index.ts; everything here is unit tested.

import type { Card, GameView, HandOutcome, SeatView, Slot, Verdict } from '../../engine/types';

export type SoundName =
  | 'deal'
  | 'flip'
  | 'chip'
  | 'stamp'
  | 'stampFar'
  | 'fold'
  | 'reveal'
  | 'rule'
  | 'win'
  | 'lose'
  | 'tie'
  | 'tick'
  | 'stingClean'
  | 'stingRaid'
  | 'stingShort';

export interface SoundCue {
  sound: SoundName;
  /** Milliseconds from now. */
  delay: number;
}

/** Spacing and caps, so a busy update reads as a gesture rather than a pile-up. */
export const TIMING = {
  /** Between consecutive dealt cards. */
  dealGap: 80,
  maxDeals: 8,
  /** A board card lands, then turns. */
  boardFlipAfter: 90,
  boardGap: 160,
  flipGap: 110,
  maxFlips: 5,
  /** At the showdown only a few flips play; the taiko carries the rest. */
  showdownFlips: 3,
  chipGap: 70,
  maxChips: 4,
  foldGap: 90,
  maxFarStamps: 3,
  farStampGap: 120,
  /** Pause after the deal before the House Rule turns. */
  ruleAfter: 250,
  /** From the start of the taiko roll to its big hit, where the result lands. */
  revealHit: 1150,
  /** After the result, before the end-of-night sting. */
  stingAfter: 900,
  /** Ticks play for the last this-many seconds of a call. */
  tickSeconds: 5,
} as const;

const OUTCOME_SOUND: Record<HandOutcome, SoundName> = {
  crew: 'win',
  house: 'lose',
  tie: 'tie',
  walked: 'tie',
};

const VERDICT_SOUND: Record<Verdict, SoundName> = {
  clean: 'stingClean',
  raid: 'stingRaid',
  short: 'stingShort',
};

const isFace = (s: Slot | undefined): s is Card => typeof s === 'string' && s !== 'back';
const isDealt = (s: Slot | undefined): boolean => s !== null && s !== undefined;

interface SlotChanges {
  dealt: number;
  flipped: number;
}

/** Compare two rows of card slots. With `fresh`, every card counts as newly dealt. */
function slotChanges(before: readonly Slot[], after: readonly Slot[], fresh: boolean): SlotChanges {
  let dealt = 0;
  let flipped = 0;
  after.forEach((n, i) => {
    const p = fresh ? null : before[i];
    if (!isDealt(p) && isDealt(n)) dealt++;
    else if (p === 'back' && isFace(n)) flipped++;
  });
  return { dealt, flipped };
}

/**
 * The cues for a change from `prev` to `next`, as seen by seat `you`.
 * With no previous view (just joined or reconnected) only the call timer is
 * picked up: arriving mid-hand should not replay the whole table.
 */
export function soundsFor(prev: GameView | null, next: GameView, you: string | null): SoundCue[] {
  const cues: SoundCue[] = [];
  const at = (sound: SoundName, delay: number) => cues.push({ sound, delay: Math.max(0, Math.round(delay)) });

  if (prev) {
    const newHand = next.hand !== prev.hand;
    const sameStreet = !newHand && next.street === prev.street;
    const prevSeats = new Map<string, SeatView>(prev.seats.map((s) => [s.id, s]));

    // ---- what people did ----------------------------------------------------
    let farStamps = 0;
    let chips = 0;
    let folds = 0;
    for (const seat of next.seats) {
      const before = prevSeats.get(seat.id);
      if (!before || newHand) continue;

      if (sameStreet && next.phase === 'call' && prev.phase === 'call' && !before.locked && seat.locked) {
        if (seat.id === you) at('stamp', 0);
        else if (farStamps < TIMING.maxFarStamps) at('stampFar', 40 + TIMING.farStampGap * farStamps++);
      }
      if (before.stake !== null && seat.stake !== null && seat.stake > before.stake) {
        for (let k = before.stake; k < seat.stake && chips < TIMING.maxChips; k++) at('chip', TIMING.chipGap * chips++);
      }
      if (before.active && !seat.active) at('fold', TIMING.foldGap * folds++);
    }

    // ---- cards ---------------------------------------------------------------
    let dealt = 0;
    let flipped = 0;
    for (const seat of next.seats) {
      const before = prevSeats.get(seat.id);
      const c = slotChanges(before?.cards ?? [], seat.cards, newHand || !before);
      dealt += c.dealt;
      flipped += c.flipped;
    }
    next.house.forEach((mask, i) => {
      const c = slotChanges(prev.house[i]?.cards ?? [], mask.cards, newHand || !prev.house[i]);
      dealt += c.dealt;
      flipped += c.flipped;
    });

    let cursor = 0;
    for (let i = 0; i < Math.min(dealt, TIMING.maxDeals); i++) {
      at('deal', cursor);
      cursor += TIMING.dealGap;
    }

    // Board cards land face up: a flick, then the turn.
    const board = slotChanges(prev.board, next.board, newHand);
    for (let i = 0; i < board.dealt; i++) {
      at('deal', cursor);
      at('flip', cursor + TIMING.boardFlipAfter);
      cursor += TIMING.boardGap;
    }
    flipped += board.flipped;

    // The hand resolves when a result first shows up, normally at the showdown,
    // but the last hand may go straight to the verdict.
    const settled = (p: GameView['phase']) => p === 'showdown' || p === 'over';
    const resolved = next.result !== null && settled(next.phase) && !settled(prev.phase);
    const flipCap = resolved ? TIMING.showdownFlips : TIMING.maxFlips;
    for (let i = 0; i < Math.min(flipped, flipCap); i++) {
      at('flip', cursor);
      cursor += TIMING.flipGap;
    }

    // ---- the House Rule --------------------------------------------------------
    if (next.rule !== null && (next.rule !== prev.rule || newHand)) {
      cursor += dealt > 0 ? TIMING.ruleAfter : 0;
      at('rule', cursor);
      cursor += TIMING.ruleAfter;
    }

    // ---- the showdown ----------------------------------------------------------
    if (resolved && next.result) {
      if (next.result.outcome === 'walked') {
        at(OUTCOME_SOUND.walked, cursor);
        cursor += TIMING.stingAfter;
      } else {
        at('reveal', cursor);
        cursor += TIMING.revealHit;
        at(OUTCOME_SOUND[next.result.outcome], cursor);
        cursor += TIMING.stingAfter;
      }
    }

    // ---- the end of the night --------------------------------------------------
    if (next.phase === 'over' && prev.phase !== 'over' && next.verdict) {
      at(VERDICT_SOUND[next.verdict], cursor);
    }
  }

  // ---- the clock -------------------------------------------------------------
  if (deadlineChanged(prev, next)) {
    for (let k = TIMING.tickSeconds; k >= 1; k--) {
      const delay = next.deadline! - k * 1000 - next.now;
      if (delay >= 0) at('tick', delay);
    }
  }

  return cues.sort((a, b) => a.delay - b.delay);
}

/**
 * True when `next` opens a new countdown, so earlier ticks are stale and new
 * ones should be scheduled. Ticks only run while a call is open.
 */
export function deadlineChanged(prev: GameView | null, next: GameView): boolean {
  if (next.phase !== 'call' || next.deadline === null) return false;
  return !prev || prev.phase !== 'call' || prev.deadline !== next.deadline;
}
