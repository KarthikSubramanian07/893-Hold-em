// What the table should sound like between two views. Pure: given the last
// view and the new one, return the sounds to play and when. The hook that
// plays them lives in index.ts; everything here is unit tested.

import type { Card, GameView, HandOutcome, Phase, SeatView, Slot, Verdict } from '../../engine/types';

export type SoundName =
  | 'deal'
  | 'flip'
  | 'stampFar'
  | 'nodReveal'
  | 'ownReveal'
  | 'reveal'
  | 'win'
  | 'lose'
  | 'tie'
  | 'tick'
  | 'stingClean'
  | 'stingRaid'
  | 'stingDawn';

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
  maxFarStamps: 3,
  farStampGap: 120,
  /** After the turn and river land, the nods turn over. */
  nodRevealAfter: 120,
  /** Your own cards turn over before the taiko starts. */
  ownRevealLead: 700,
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
  dawn: 'stingDawn',
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
    const newHand = next.hand !== prev.hand || next.night !== prev.night;
    const samePhase = !newHand && next.phase === prev.phase;
    const prevSeats = new Map<string, SeatView>(prev.seats.map((s) => [s.id, s]));

    // ---- who decided ---------------------------------------------------------
    // Your own nod and In/Out sound from the dock the moment you press; others
    // land as distant stamps.
    let farStamps = 0;
    for (const seat of next.seats) {
      const before = prevSeats.get(seat.id);
      if (!before || newHand || !samePhase || !inHand(next.phase)) continue;
      if (!before.locked && seat.locked && seat.id !== you && farStamps < TIMING.maxFarStamps) {
        at('stampFar', 40 + TIMING.farStampGap * farStamps++);
      }
    }

    // ---- cards ---------------------------------------------------------------
    let dealt = 0;
    let flipped = 0;
    let mineFlipped = false;
    for (const seat of next.seats) {
      const before = prevSeats.get(seat.id);
      const c = slotChanges(before?.cards ?? [], seat.cards, newHand || !before);
      dealt += c.dealt;
      if (seat.id === you && c.flipped > 0) mineFlipped = true;
      else flipped += c.flipped;
    }
    const house = slotChanges(newHand ? [] : prev.house.cards, next.house.cards, newHand);
    dealt += house.dealt;
    flipped += house.flipped;

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

    // ---- the nods turn over ----------------------------------------------------
    if (prev.phase === 'nod' && next.phase === 'call' && !newHand && next.seats.some((s) => s.nod)) {
      cursor += TIMING.nodRevealAfter;
      at('nodReveal', cursor);
    }

    // The hand resolves when a result first shows up, normally at the showdown,
    // but the last hand may go straight to the verdict.
    const settled = (p: Phase) => p === 'showdown' || p === 'over';
    const resolved = next.result !== null && settled(next.phase) && !settled(prev.phase);
    const flipCap = resolved ? TIMING.showdownFlips : TIMING.maxFlips;
    for (let i = 0; i < Math.min(flipped, flipCap); i++) {
      at('flip', cursor);
      cursor += TIMING.flipGap;
    }

    // ---- the showdown ----------------------------------------------------------
    if (resolved && mineFlipped) {
      at('ownReveal', cursor);
      cursor += TIMING.ownRevealLead;
    }
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

function inHand(p: Phase): boolean {
  return p === 'nod' || p === 'call';
}

/**
 * True when `next` opens a new countdown, so earlier ticks are stale and new
 * ones should be scheduled. Ticks only run while a nod or a call is open.
 */
export function deadlineChanged(prev: GameView | null, next: GameView): boolean {
  if (!inHand(next.phase) || next.deadline === null) return false;
  return !prev || prev.phase !== next.phase || prev.deadline !== next.deadline;
}
