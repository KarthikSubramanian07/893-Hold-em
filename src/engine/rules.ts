// Table info and the numbers that balance a night, mirrored from
// `crates/engine/src/rules.rs` (the source of truth). `rules.test.ts` reads the
// Rust file and fails if the two drift apart.
import type { Difficulty } from './types';

export const MIN_CREW = 2;
export const MAX_CREW = 6;
/** Cards the House shows from the start; the rest stay hidden to the showdown. */
export const HOUSE_UP = 1;
/** Board cards face up while the crew nods: the flop and the turn. */
export const NOD_BOARD = 4;
/** The night ends after this many hands if the marker reached neither end. */
export const LAST_ORDERS = 10;

/** At the boss's table there are no last orders: still in the room when the clock runs out is a raid. */
export function dawnIsARaid(d: Difficulty): boolean {
  return d === 'oyabun';
}

/**
 * How many cards the House holds, per table, for crews of 2 through 6. It plays
 * its best five with the board, and every In hand plays it on its own.
 */
export const HOUSE: Record<Difficulty, readonly number[]> = {
  shitamachi: [2, 2, 2, 2, 2],
  kabukicho: [2, 2, 2, 2, 2],
  oyabun: [2, 2, 2, 2, 2],
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
 * Every In hand that beats the House moves the marker one step toward the
 * door; every In hand that loses, one step toward the sirens.
 */
export const BALANCE: Record<Difficulty, readonly (readonly [number, number])[]> = {
  shitamachi: [
    [4, 4],
    [6, 5],
    [7, 6],
    [9, 7],
    [10, 8],
  ],
  kabukicho: [
    [6, 2],
    [8, 3],
    [10, 4],
    [12, 5],
    [14, 6],
  ],
  oyabun: [
    [8, 2],
    [10, 2],
    [13, 3],
    [16, 3],
    [19, 4],
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
    blurb: 'The corner bar. The sirens are a long way off.',
    house: houseRange('shitamachi'),
    odds: '7 in 10',
  },
  kabukicho: {
    id: 'kabukicho',
    kanji: '歌舞伎町',
    name: 'Kabukichō',
    blurb: 'Neon and noise. The sirens sit closer.',
    house: houseRange('kabukicho'),
    odds: '1 in 2',
  },
  oyabun: {
    id: 'oyabun',
    kanji: '親分',
    name: 'Oyabun',
    blurb: "The boss's room. No last orders: still here at dawn is a raid.",
    house: houseRange('oyabun'),
    odds: '3 in 10',
  },
};

export const DEFAULT_TABLE: Difficulty = 'shitamachi';

/** The four rules, in the plain words used everywhere. */
export const RULES_IN_FOUR: readonly string[] = [
  'You see the hands of the two players beside you, never your own. The House shows one card and plays its best five with the board.',
  'After the turn, nod at one of the two you can see: "you\'re good". Or pass. Every nod turns over at once.',
  'After the river, everyone picks In or Out at once.',
  'Every hand that\'s In plays the House on its own. Each win: a step toward the door. Each loss: a step toward the sirens. Out: nothing moves, but the clock runs.',
];
