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
import { isMonster, isRoyal, lowestMeter, nodsOn, playedYakuza } from './analysis';
import { MATCHBOOK_KEY } from './firstVisit';

export { MATCHBOOK_KEY };

export type StampId =
  | 'first-night'
  | 'getaway'
  | 'corner'
  | 'neon'
  | 'oyabun'
  | 'the-nod'
  | 'blind-faith'
  | 'good-eye'
  | 'all-in'
  | 'close-shave'
  | 'sweep'
  | 'last-orders'
  | 'never-knew'
  | 'so-close'
  | 'ghosts'
  | 'yakuza'
  | 'royal'
  | 'night-owl'
  | 'full-bar'
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
  { id: 'getaway', kanji: '逃', name: 'Clean Getaway', verse: 'Out the door before the sirens. Any table counts.', shape: 'round' },
  { id: 'corner', kanji: '下町', name: 'Small Debts', verse: 'The corner table, paid in full.', shape: 'square' },
  { id: 'neon', kanji: '歌舞伎', name: 'Every Sign Is Lying', verse: 'Out of Kabukichō clean. People don’t.', shape: 'square' },
  { id: 'oyabun', kanji: '親分', name: 'Oyabun’s Favor', verse: 'His cards, his room, and he still bowed.', shape: 'square' },
  { id: 'the-nod', kanji: '頷', name: 'The Nod', verse: 'They nodded at you. You went In and won.', shape: 'round' },
  { id: 'blind-faith', kanji: '盲信', name: 'Blind Faith', verse: 'No nods. In anyway. Beat the House.', shape: 'round' },
  { id: 'good-eye', kanji: '目利', name: 'Good Eye', verse: 'Your nod went to a hand that beat the House.', shape: 'round' },
  { id: 'all-in', kanji: '総入', name: 'Full House In', verse: 'Every stool In, and the crew came out ahead.', shape: 'square' },
  { id: 'close-shave', kanji: '紙一重', name: 'Close Shave', verse: 'One step from the sirens, then out the door.', shape: 'square' },
  { id: 'sweep', kanji: '総取', name: 'Clean Sweep', verse: 'Not one step toward the sirens all night.', shape: 'square' },
  { id: 'last-orders', kanji: '終', name: 'Last Orders', verse: 'Ten hands, and the shutters came down.', shape: 'round' },
  { id: 'never-knew', kanji: '化物', name: 'Never Knew', verse: 'A straight or better in your hands, unseen until the end.', shape: 'round' },
  { id: 'so-close', kanji: '惜', name: 'So Close', verse: 'Out, holding the winner. Your crew saw it coming.', shape: 'round' },
  { id: 'ghosts', kanji: '幽霊', name: 'Ghosts', verse: 'Everyone Out. The clock didn’t care.', shape: 'round' },
  { id: 'yakuza', kanji: '八九三', name: 'Ya-ku-za', verse: 'Eight, nine, three. The worst hand, and it won.', shape: 'square' },
  { id: 'royal', kanji: '王', name: 'Royal', verse: 'Ten to the ace, one suit, our side.', shape: 'round' },
  { id: 'night-owl', kanji: '梟', name: 'Night Owl', verse: 'Played at three in the morning. The real one.', shape: 'round' },
  { id: 'full-bar', kanji: '満席', name: 'Full Bar', verse: 'Six stools, six people, no regulars.', shape: 'square' },
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
  const playing = next.phase === 'nod' || next.phase === 'call' || next.phase === 'showdown';

  if (playing && (ctx.now ?? new Date()).getHours() === 3) out.add('night-owl');

  // The night starts with six people and no bots.
  const started = next.phase === 'nod' && next.hand === 1 && (!prev || prev.phase === 'lobby' || prev.phase === 'over');
  if (started && next.seats.length === 6 && next.seats.every((s) => !s.bot)) out.add('full-bar');

  // A hand resolves.
  const resolved = next.result !== null && (!prev || prev.result === null || prev.hand !== next.hand);
  if (resolved) {
    const r = next.result!;
    if (r.outcome === 'walked') out.add('ghosts');
    if (isMonster(me.hand)) out.add('never-knew');
    if (me.stance === 'out' && r.couldHave.includes(you) && r.outcome !== 'crew') out.add('so-close');
    if (r.outcome === 'crew') {
      if (r.ins.length >= 2 && r.ins.length === next.seats.length) out.add('all-in');
      if (me.nod && r.crewChampions.includes(me.nod)) out.add('good-eye');
      if (me.champion) {
        if (nodsOn(next, you) > 0) out.add('the-nod');
        else if (next.seats.length > 2) out.add('blind-faith');
        if (playedYakuza(me, next.board)) out.add('yakuza');
        if (isRoyal(r.crewBest)) out.add('royal');
      }
    }
  }

  // The night ends.
  const ended = next.verdict !== null && (!prev || prev.verdict === null || prev.phase !== 'over');
  if (ended) {
    out.add('first-night');
    if ((ctx.nights ?? 0) + 1 >= 5) out.add('regular');
    if (next.verdict === 'raid') out.add('the-knock');
    if (next.verdict === 'dawn') out.add('last-orders');
    if (next.verdict === 'clean') {
      out.add('getaway');
      out.add(CHAPTER_STAMP[next.config.difficulty]);
      if (lowestMeter(next.history) <= -(next.sirens - 1)) out.add('close-shave');
      if (next.history.length >= 2 && next.history.every((h) => h.moved > 0)) out.add('sweep');
    }
  }
  return [...out];
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
