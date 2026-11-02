// The shared vocabulary of 893 Hold'em. The engine, the rooms server, and the
// client all speak these types. Everything here is plain JSON so it can cross a
// WebSocket untouched.

/** Ranks low to high. `T` is ten. */
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
/** Spades, hearts, diamonds, clubs. */
export const SUITS = ['s', 'h', 'd', 'c'] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
/** A card is two characters: rank then suit, e.g. `As`, `Td`, `7c`. */
export type Card = `${Rank}${Suit}`;

/** A card slot the viewer may not be allowed to see. `null` = not dealt yet, `'back'` = dealt face down. */
export type Slot = Card | 'back' | null;

export type Difficulty = 'shitamachi' | 'kabukicho' | 'oyabun';

export type RuleId =
  | 'kiri'
  | 'kagami'
  | 'oni'
  | 'shizuka'
  | 'homura'
  | 'kizuna'
  | 'hebi'
  | 'kitsune'
  | 'gyaku';

export type Stance = 'fold' | 'stay' | 'raise';

/** 0 pre-flop, 1 flop, 2 turn, 3 river. */
export type Street = 0 | 1 | 2 | 3;

export type Phase =
  | 'lobby' // seats filling, host configuring
  | 'call' // a street is open and crew members are choosing
  | 'showdown' // hand resolved, results on the table, waiting for "next"
  | 'over'; // the night is over, verdict shown

export type Verdict = 'clean' | 'raid' | 'short';

export type HandCategory =
  | 'high'
  | 'pair'
  | 'two-pair'
  | 'trips'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'quads'
  | 'straight-flush';

export interface HandValue {
  /** Totally ordered score: higher beats lower. Compare with `>`. */
  score: number;
  category: HandCategory;
  /** Human name, e.g. "Two pair, kings and sevens". */
  name: string;
  /** The five cards that make the hand, strongest first. */
  best: Card[];
}

export type TimerSetting = 15 | 30 | 60 | 0; // 0 = off

export interface TableConfig {
  difficulty: Difficulty;
  timer: TimerSetting;
}

export type Avatar =
  | 'kitsune'
  | 'tanuki'
  | 'koi'
  | 'tsuru'
  | 'tora'
  | 'usagi'
  | 'karasu'
  | 'hebi';

// ---------------------------------------------------------------------------
// Views: what one viewer is allowed to know. The server builds one per socket.
// ---------------------------------------------------------------------------

export interface SeatView {
  /** Stable seat id (index 0..5 as a string, e.g. "s0"). */
  id: string;
  name: string;
  avatar: Avatar;
  bot: boolean;
  host: boolean;
  connected: boolean;
  /** Hole cards: real cards for the viewer's own seat, revealed seats, and at the showdown; `'back'` otherwise. */
  cards: Slot[];
  /** Still in this hand (has not folded). */
  active: boolean;
  /** Current stake, 1..3. Hidden as `null` under Hush for other seats while calls are open. */
  stake: number | null;
  /** Has this seat locked in a call for the current street? */
  locked: boolean;
  /** The call this seat made on each street so far, `null` where hidden or not yet made. Index = street. */
  calls: (Stance | 'hidden' | null)[];
  /** At the showdown: this seat's evaluated hand (active or not). */
  hand: HandValue | null;
  /** At the showdown: true for the one seat whose hand carried the crew (or tied it). */
  champion: boolean;
}

export interface HouseHandView {
  cards: Slot[];
  /** At the showdown. */
  hand: HandValue | null;
  /** At the showdown: the mask whose hand the crew faced. */
  champion: boolean;
}

export type HandOutcome = 'crew' | 'house' | 'tie' | 'walked';

export interface HandResult {
  outcome: HandOutcome;
  /** Change in take this hand (≥ 0). */
  take: number;
  /** Change in heat this hand (≥ 0). */
  heat: number;
  crewBest: HandValue | null;
  houseBest: HandValue;
  /** Seat ids whose hand was the crew's best (several on a tie). */
  crewChampions: string[];
  /** Indexes into `house` of the House's best hand(s). */
  houseChampions: number[];
  /** Seat ids that stayed in, lost to the House on their own, and drew heat. */
  burned: string[];
}

export interface HistoryEntry {
  hand: number;
  rule: RuleId | null;
  outcome: HandOutcome;
  take: number;
  heat: number;
  crewBestName: string | null;
  houseBestName: string;
}

export interface GameView {
  code: string;
  phase: Phase;
  config: TableConfig;
  /** Which seat id the viewer holds, or null for a spectator. */
  you: string | null;
  seats: SeatView[];
  house: HouseHandView[];
  /** Always five slots. */
  board: Slot[];
  street: Street;
  /** 1-based hand number; 0 in the lobby. */
  hand: number;
  hands: number;
  take: number;
  heat: number;
  target: number;
  heatLimit: number;
  rule: RuleId | null;
  /** Epoch ms when the current call times out, or null. */
  deadline: number | null;
  /** The showdown result for the current hand, once resolved. */
  result: HandResult | null;
  history: HistoryEntry[];
  verdict: Verdict | null;
  /** Seat ids that have pressed "next" during the showdown. */
  ready: string[];
  /** Server time when this view was built, for clock skew correction. */
  now: number;
}
