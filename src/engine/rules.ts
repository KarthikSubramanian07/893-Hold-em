// Table info and the numbers that balance a night, mirrored from
// `crates/engine/src/rules.rs` (the source of truth). `rules.test.ts` reads the
// Rust file and fails if the two drift apart.
import type { Difficulty } from './types';

export const MIN_CREW = 2;
export const MAX_CREW = 6;
/** Cards the House shows from the start; the rest stay hidden to the showdown. */
export const HOUSE_UP = 1;
/** The night ends after this many hands if the marker reached neither end. */
export const LAST_ORDERS = 10;

/**
 * How many cards the House holds, per table, for crews of 2 through 6. It plays
 * its best five with the board, so a bigger crew faces a stronger House.
 */
export const HOUSE: Record<Difficulty, readonly number[]> = {
  shitamachi: [3, 3, 4, 4, 4],
  kabukicho: [3, 4, 4, 5, 5],
  oyabun: [4, 4, 5, 5, 5],
};

function crewIndex(crew: number): number {
  return Math.min(MAX_CREW, Math.max(MIN_CREW, Math.round(crew))) - MIN_CREW;
}

/** Cards the House holds at this table for a crew this size. */
export function houseCardsFor(d: Difficulty, crew: number): number {
  return HOUSE[d][crewIndex(crew)]!;
}

/** The House's range at a table, e.g. "3 or 4", for copy that covers every crew size. */
function houseRange(d: Difficulty): string {
  const lo = Math.min(...HOUSE[d]);
  const hi = Math.max(...HOUSE[d]);
  return lo === hi ? `${lo}` : hi - lo === 1 ? `${lo} or ${hi}` : `${lo} to ${hi}`;
}

/**
 * [steps to the door, steps to the sirens] for crews of 2 through 6, per table.
 * A win moves the marker one step toward the door per player In; a loss one
 * step toward the sirens per player In.
 */
export const BALANCE: Record<Difficulty, readonly (readonly [number, number])[]> = {
  shitamachi: [
    [3, 5],
    [5, 7],
    [5, 9],
    [6, 12],
    [7, 14],
  ],
  kabukicho: [
    [4, 3],
    [4, 6],
    [8, 7],
    [6, 10],
    [7, 12],
  ],
  oyabun: [
    [3, 3],
    [5, 4],
    [5, 6],
    [8, 8],
    [10, 10],
  ],
};

function balance(d: Difficulty, crew: number): readonly [number, number] {
  return BALANCE[d][crewIndex(crew)]!;
}

/** Steps from the start to the door (a clean getaway) for this table and crew. */
export function doorFor(d: Difficulty, crew: number): number {
  return balance(d, crew)[0];
}

/** Steps from the start to the sirens (a raid) for this table and crew. */
export function sirensFor(d: Difficulty, crew: number): number {
  return balance(d, crew)[1];
}

export interface TableInfo {
  id: Difficulty;
  kanji: string;
  name: string;
  blurb: string;
  /** Cards the House holds here, across crew sizes, e.g. "3 or 4". */
  house: string;
  /**
   * How often a crew that plays well gets away clean: the design goal the
   * simulator tunes toward.
   */
  odds: string;
}

export const TABLES: Record<Difficulty, TableInfo> = {
  shitamachi: {
    id: 'shitamachi',
    kanji: '下町',
    name: 'Shitamachi',
    blurb: 'The corner bar. The House holds three or four cards.',
    house: houseRange('shitamachi'),
    odds: '7 in 10',
  },
  kabukicho: {
    id: 'kabukicho',
    kanji: '歌舞伎町',
    name: 'Kabukichō',
    blurb: 'Neon and noise. The House holds three to five.',
    house: houseRange('kabukicho'),
    odds: '1 in 2',
  },
  oyabun: {
    id: 'oyabun',
    kanji: '親分',
    name: 'Oyabun',
    blurb: "The boss's room. The House holds four or five.",
    house: houseRange('oyabun'),
    odds: '3 in 10',
  },
};

export const DEFAULT_TABLE: Difficulty = 'shitamachi';

/** The four rules, in the plain words used everywhere. */
export const RULES_IN_FOUR: readonly string[] = [
  "Everyone sees every hand but their own. The House shows one card and plays its best five with the board; it holds more cards the bigger your crew.",
  'After the flop, each player may nod at one teammate: "you\'re good". One nod each per hand, or pass.',
  'After the river, everyone picks In or Out at once.',
  'The best hand that\'s In faces the House. Win: one step toward the door per player In. Lose: one step toward the sirens per player In. Everyone Out: nothing moves, but the clock runs.',
];
