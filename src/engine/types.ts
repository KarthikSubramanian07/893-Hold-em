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

export type Stance = 'in' | 'out';

export type Phase =
  | 'lobby' // seats filling, host configuring
  | 'nod' // the turn is out; each player may nod at one of the two beside them
  | 'call' // the river is out; each player picks In or Out
  | 'showdown' // hand resolved, results on the table, waiting for "next"
  | 'over'; // the night is over, verdict shown

/** clean: the marker reached the door. raid: it reached the sirens. dawn: last orders came first. */
export type Verdict = 'clean' | 'raid' | 'dawn';

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
// During a hand you see the cards of the two players beside you, never your
// own; spectators see no hole cards at all.
// ---------------------------------------------------------------------------

export interface SeatView {
  /** Stable seat id (index 0..5 as a string, e.g. "s0"). */
  id: string;
  name: string;
  avatar: Avatar;
  bot: boolean;
  host: boolean;
  connected: boolean;
  /** Hole cards: real cards for the two beside you (and everyone at the showdown); `'back'` for your own, for teammates out of sight, and for spectators. */
  cards: Slot[];
  /** You can see this seat's cards this hand, so you may nod at it: the two beside you (at two or three players, everyone else). */
  inSight: boolean;
  /** Has this seat decided in the current phase (nodded or passed during `nod`, picked In/Out during `call`)? */
  locked: boolean;
  /** Seat id this seat nodded at. Others' nods are hidden (null) until every nod is in; your own is always visible. */
  nod: string | null;
  /** In or Out. Hidden (null) for others until the showdown; your own locked choice is visible to you. */
  stance: Stance | null;
  /** At the showdown: this seat's evaluated hand. */
  hand: HandValue | null;
  /** At the showdown: this seat was In and beat the House. */
  champion: boolean;
}

export interface HouseView {
  /** The House's cards (3, 4 or 5 by table). The first is face up; the rest are `'back'` until the showdown. Empty in the lobby. */
  cards: Slot[];
  /** At the showdown. */
  hand: HandValue | null;
}

export type HandOutcome = 'crew' | 'house' | 'tie' | 'walked';

export interface HandResult {
  outcome: HandOutcome;
  /** Steps the marker moved: +1 for every In hand that beat the House, -1 for every In hand that lost to it. */
  moved: number;
  /** Seat ids that were In. */
  ins: string[];
  /** The best hand that was In. */
  crewBest: HandValue | null;
  houseBest: HandValue;
  /** Seat ids that were In and beat the House. */
  crewChampions: string[];
  /** Seat ids (In or Out) whose hand beat the House. */
  couldHave: string[];
}

export interface HistoryEntry {
  hand: number;
  outcome: HandOutcome;
  moved: number;
  /** How many were In. */
  ins: number;
  /** How many of those beat the House, and how many lost to it. */
  won: number;
  lost: number;
  crewBestName: string | null;
  houseBestName: string;
  /** Name of the seat with the best hand that beat the House, if any. */
  carrier: string | null;
  /** Nods that seat received that hand. */
  carrierNods: number;
}

export interface GameView {
  code: string;
  phase: Phase;
  config: TableConfig;
  /** Which seat id the viewer holds, or null for a spectator. */
  you: string | null;
  seats: SeatView[];
  house: HouseView;
  /** Always five slots: four face up during `nod` (the flop and the turn), five from `call` on. */
  board: Slot[];
  /** Nights started at this table: 0 before the first, then 1, 2, … */
  night: number;
  /** 1-based hand number; 0 in the lobby. */
  hand: number;
  /** The night ends after this many hands if neither end of the track is reached. */
  lastOrders: number;
  /** The marker: 0 at the start; reaching `door` escapes, reaching `-sirens` is a raid. */
  meter: number;
  door: number;
  sirens: number;
  /** Epoch ms when the current decision times out, or null. */
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
