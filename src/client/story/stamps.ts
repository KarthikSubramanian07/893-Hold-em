// Hanko stamps: the bar's achievements, pressed into a matchbook you keep.
//
//   detectStamps(prev, next, you) ──► StampId[]      pure, per local player
//   matchbook (localStorage '893:matchbook')         stamps, chapters, nights
//   useMatchbook                                     zustand: observe(), award(), toasts
//
// Stamps never gate play. Clearing a chapter unlocks its story in the matchbook,
// nothing more.

import { create } from 'zustand';
import type { Difficulty, GameView } from '../../engine/types';
import { burned, classifyShowdown, isRoyal, playedYakuza } from './analysis';
import { MATCHBOOK_KEY } from './firstVisit';

export { MATCHBOOK_KEY };

export type StampId =
  | 'first-night'
  | 'corner'
  | 'neon'
  | 'oyabun'
  | 'yakuza'
  | 'ride-or-die'
  | 'lone-rider'
  | 'sweep'
  | 'ghosts'
  | 'royal'
  | 'close-call'
  | 'under-the-wire'
  | 'night-owl'
  | 'full-house'
  | 'snakebit'
  | 'upside-down'
  | 'seen'
  | 'the-knock'
  | 'regular'
  | 'cat'
  | 'buta';

export interface Stamp {
  id: StampId;
  kanji: string;
  name: string;
  /** One line, a little like a poem. Doubles as the hint. */
  verse: string;
  /** Secret stamps show as blank until found. */
  secret?: boolean;
  shape: 'square' | 'round';
}

export const STAMPS: readonly Stamp[] = [
  { id: 'first-night', kanji: '初', name: 'First Night', verse: 'Everyone has a first stool.', shape: 'round' },
  { id: 'corner', kanji: '下町', name: 'Small Debts', verse: 'The corner table, paid in full.', shape: 'square' },
  { id: 'neon', kanji: '歌舞伎', name: 'Every Sign Is Lying', verse: 'Out of Kabukichō with money. People don’t.', shape: 'square' },
  { id: 'oyabun', kanji: '親分', name: 'Oyabun’s Favor', verse: 'He bowed. He has never bowed.', shape: 'square' },
  { id: 'yakuza', kanji: '八九三', name: 'Ya-ku-za', verse: 'Eight, nine, three. The worst hand, and it paid.', shape: 'square' },
  { id: 'ride-or-die', kanji: '道連', name: 'Ride or Die', verse: 'Paid, holding the worst hand at the table.', shape: 'round' },
  { id: 'lone-rider', kanji: '一騎', name: 'Lone Rider', verse: 'Everyone else folded. You went anyway, and won.', shape: 'round' },
  { id: 'sweep', kanji: '総取', name: 'Clean Sweep', verse: 'Six hands. Six wins. Tell no one.', shape: 'square' },
  { id: 'ghosts', kanji: '幽霊', name: 'Ghosts', verse: 'Every hand on the felt. The street noticed anyway.', shape: 'round' },
  { id: 'royal', kanji: '王', name: 'Royal', verse: 'Ten to the ace, one suit, our side.', shape: 'round' },
  { id: 'close-call', kanji: '紙一重', name: 'Close Call', verse: 'Clean, by the width of a sheet of paper.', shape: 'square' },
  { id: 'under-the-wire', kanji: '滑込', name: 'Under the Wire', verse: 'Short until the sixth hand. Then not.', shape: 'round' },
  { id: 'night-owl', kanji: '梟', name: 'Night Owl', verse: 'Played at three in the morning. The real one.', shape: 'round' },
  { id: 'full-house', kanji: '満席', name: 'Full House', verse: 'Six stools, six people, no regulars.', shape: 'square' },
  { id: 'snakebit', kanji: '蛇', name: 'Snakebit', verse: 'A tie, under the Serpent. A loss with manners.', shape: 'round' },
  { id: 'upside-down', kanji: '逆', name: 'Upside Down', verse: 'The worst hand won. The boss smiled.', shape: 'round' },
  { id: 'seen', kanji: '見', name: 'You Were Seen', verse: 'They got paid. You got remembered.', shape: 'round' },
  { id: 'the-knock', kanji: '踏込', name: 'The Knock', verse: 'Everyone hears it once. Out the back.', shape: 'square' },
  { id: 'regular', kanji: '常連', name: 'Regular', verse: 'Five nights. The stool knows your shape.', shape: 'square' },
  { id: 'cat', kanji: '九', name: 'Kyū', verse: 'The cat let you pet her. She is the nine.', secret: true, shape: 'round' },
  { id: 'buta', kanji: '豚', name: 'Buta', verse: 'The card that isn’t in the deck. Twenty counts as nothing.', secret: true, shape: 'square' },
];

export const STAMP: Record<StampId, Stamp> = Object.fromEntries(STAMPS.map((s) => [s.id, s])) as Record<StampId, Stamp>;

const CHAPTER_STAMP: Record<Difficulty, StampId> = { shitamachi: 'corner', kabukicho: 'neon', oyabun: 'oyabun' };

export interface DetectContext {
  /** Local time, for the night owl. */
  now?: Date;
  /** Nights finished before this one, for the regular. */
  nights?: number;
}

/** The stamps `you` earned in the step from `prev` to `next`. May include ones you already have. */
export function detectStamps(prev: GameView | null, next: GameView, you: string | null, ctx: DetectContext = {}): StampId[] {
  if (!you) return [];
  const me = next.seats.find((s) => s.id === you);
  if (!me) return [];
  const out = new Set<StampId>();
  const playing = next.phase === 'call' || next.phase === 'showdown';

  if (playing && (ctx.now ?? new Date()).getHours() === 3) out.add('night-owl');

  // The night starts with six people and no bots.
  const started = next.phase === 'call' && next.hand === 1 && (!prev || prev.phase === 'lobby' || prev.phase === 'over');
  if (started && next.seats.length === 6 && next.seats.every((s) => !s.bot)) out.add('full-house');

  // A hand resolves.
  const resolved = next.result !== null && (!prev || prev.result === null || prev.hand !== next.hand);
  if (resolved) {
    const r = next.result!;
    const { kind } = classifyShowdown(next);
    if (r.outcome === 'walked') out.add('ghosts');
    if (me.active) {
      if (r.outcome === 'crew') {
        if (playedYakuza(me, next.board)) out.add('yakuza');
        if (isRoyal(r.crewBest) && next.rule !== 'gyaku') out.add('royal');
        if (next.rule === 'gyaku') out.add('upside-down');
        if (next.seats.filter((s) => s.active).length === 1) out.add('lone-rider');
        if (next.rule !== 'gyaku' && worstAtTable(next, you)) out.add('ride-or-die');
        if (burned(next).includes(you)) out.add('seen');
      }
      if (kind === 'serpent') out.add('snakebit');
    }
  }

  // The night ends.
  const ended = next.verdict !== null && (!prev || prev.verdict === null || prev.phase !== 'over');
  if (ended) {
    out.add('first-night');
    if ((ctx.nights ?? 0) + 1 >= 5) out.add('regular');
    if (next.verdict === 'raid') out.add('the-knock');
    if (next.verdict === 'clean') {
      out.add(CHAPTER_STAMP[next.config.difficulty]);
      if (next.heat === next.heatLimit - 1) out.add('close-call');
      if (next.history.length >= next.hands && next.history.every((h) => h.outcome === 'crew')) out.add('sweep');
      const last = next.history[next.history.length - 1];
      if (last && last.take > 0 && next.take - last.take < next.target) out.add('under-the-wire');
    }
  }
  return [...out];
}

/** Your hand was the weakest of every crew hand on the table, and the crew had more than one. */
function worstAtTable(view: GameView, you: string): boolean {
  const hands = view.seats.filter((s) => s.hand);
  const me = hands.find((s) => s.id === you);
  if (!me || hands.length < 2) return false;
  return hands.every((s) => s.id === you || s.hand!.score > me.hand!.score);
}

// ---------------------------------------------------------------------------
// The matchbook: what persists
// ---------------------------------------------------------------------------

export interface MatchbookData {
  v: 1;
  /** When each stamp was first pressed, epoch ms. */
  stamps: Partial<Record<StampId, number>>;
  /** Tables with at least one clean getaway, in the order they were cleared. */
  cleared: Difficulty[];
  /** Nights played to a verdict. */
  nights: number;
  /** Has the cold open played? */
  coldOpen: boolean;
  /** Easter eggs found, by id. */
  eggs: string[];
}

export const EMPTY_MATCHBOOK: MatchbookData = { v: 1, stamps: {}, cleared: [], nights: 0, coldOpen: false, eggs: [] };

/** Anything with getItem and setItem: localStorage, or a map in tests. */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storage(): KeyValue | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const STAMP_IDS = new Set<string>(STAMPS.map((s) => s.id));
const TABLE_IDS = new Set<string>(['shitamachi', 'kabukicho', 'oyabun']);

/** Read the matchbook, repairing anything a hand-edited or older copy got wrong. */
export function loadMatchbook(kv: KeyValue | null = storage()): MatchbookData {
  let raw: unknown;
  try {
    raw = JSON.parse(kv?.getItem(MATCHBOOK_KEY) ?? 'null');
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== 'object') return structuredClone(EMPTY_MATCHBOOK);
  const o = raw as Partial<MatchbookData>;
  const stamps: MatchbookData['stamps'] = {};
  for (const [k, v] of Object.entries(o.stamps ?? {})) if (STAMP_IDS.has(k) && typeof v === 'number') stamps[k as StampId] = v;
  return {
    v: 1,
    stamps,
    cleared: Array.isArray(o.cleared) ? [...new Set(o.cleared.filter((t) => TABLE_IDS.has(t)))] : [],
    nights: typeof o.nights === 'number' && o.nights >= 0 ? Math.floor(o.nights) : 0,
    coldOpen: o.coldOpen === true,
    eggs: Array.isArray(o.eggs) ? o.eggs.filter((e): e is string => typeof e === 'string') : [],
  };
}

export function saveMatchbook(data: MatchbookData, kv: KeyValue | null = storage()): void {
  try {
    kv?.setItem(MATCHBOOK_KEY, JSON.stringify(data));
  } catch {
    // Private mode or a full disk: the matchbook just won't survive the tab.
  }
}

/** Press stamps into a matchbook. Returns the new book and the ids that were new. */
export function pressStamps(data: MatchbookData, ids: readonly StampId[], at = Date.now()): { data: MatchbookData; fresh: StampId[] } {
  const fresh = ids.filter((id, i) => !data.stamps[id] && ids.indexOf(id) === i);
  if (fresh.length === 0) return { data, fresh };
  const stamps = { ...data.stamps };
  for (const id of fresh) stamps[id] = at;
  return { data: { ...data, stamps }, fresh };
}

/** Fold one view transition into the matchbook: nights, chapters cleared, stamps. */
export function recordTransition(
  data: MatchbookData,
  prev: GameView | null,
  next: GameView,
  you: string | null,
  ctx: { now?: Date } = {},
): { data: MatchbookData; fresh: StampId[] } {
  const ids = detectStamps(prev, next, you, { now: ctx.now, nights: data.nights });
  let book = data;
  const ended = you && next.verdict !== null && (!prev || prev.verdict === null || prev.phase !== 'over');
  if (ended) {
    book = { ...book, nights: book.nights + 1 };
    const table = next.config.difficulty;
    if (next.verdict === 'clean' && !book.cleared.includes(table)) book = { ...book, cleared: [...book.cleared, table] };
  }
  return pressStamps(book, ids, (ctx.now ?? new Date()).getTime());
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

export interface MatchbookState {
  data: MatchbookData;
  /** Stamps waiting to be shown, oldest first. */
  toasts: StampId[];
  observe(prev: GameView | null, next: GameView, you: string | null): StampId[];
  award(id: StampId): boolean;
  found(egg: string): void;
  sawColdOpen(): void;
  dismiss(): void;
  reset(): void;
}

export const useMatchbook = create<MatchbookState>((set, get) => {
  const commit = (data: MatchbookData, fresh: StampId[] = []) => {
    saveMatchbook(data);
    set((s) => ({ data, toasts: fresh.length ? [...s.toasts, ...fresh] : s.toasts }));
  };
  return {
    data: loadMatchbook(),
    toasts: [],
    observe(prev, next, you) {
      const { data, fresh } = recordTransition(get().data, prev, next, you);
      if (data !== get().data) commit(data, fresh);
      return fresh;
    },
    award(id) {
      const { data, fresh } = pressStamps(get().data, [id]);
      if (fresh.length) commit(data, fresh);
      return fresh.length > 0;
    },
    found(egg) {
      const d = get().data;
      if (!d.eggs.includes(egg)) commit({ ...d, eggs: [...d.eggs, egg] });
    },
    sawColdOpen() {
      if (!get().data.coldOpen) commit({ ...get().data, coldOpen: true });
    },
    dismiss() {
      set((s) => ({ toasts: s.toasts.slice(1) }));
    },
    reset() {
      commit(structuredClone(EMPTY_MATCHBOOK));
      set({ toasts: [] });
    },
  };
});
