// Easter eggs. Nothing else in the app has to know about these: each one is
// announced as a `893:egg` CustomEvent on window and in a tiny store, and
// whoever cares (the neon sign, the lantern, the narrator) listens.
//
//   type 8 9 3 anywhere      the neon flickers; the Master notices
//   ↑ ↑ ↓ ↓ ← → ← → B A      the card that isn't in the deck slides out (豚)
//   type kanpai              a clink, a toast
//   click the lantern 8×     it gutters, and the Master asks you to leave it
//   a code with 893 in it    a different welcome
//   a name like "Oyabun"     a dry remark
//   3 a.m., local            the real hour, noticed
//   some nights              Kyū the cat is on the bar; pet her
//   the console              a hanko, the licence, and the door to the source

import { create } from 'zustand';
import { is893Code, nameEgg } from './analysis';
import { hash, pick } from './hash';
import { CAT, EGG_LINES, WELCOME } from './lines';
import { useMatchbook } from './stamps';
import type { Line } from './types';

export type EggId =
  | 'neon'
  | 'konami'
  | 'kanpai'
  | 'lantern'
  | 'code-893'
  | 'oyabun'
  | 'master'
  | 'cat-name'
  | 'three-am'
  | 'cat'
  | 'console';

export const EGG_EVENT = '893:egg';

export interface EggDetail {
  id: EggId;
  /** What the Master says about it, if anything. */
  line: Line | null;
}

declare global {
  interface WindowEventMap {
    '893:egg': CustomEvent<EggDetail>;
  }
}

// ---------------------------------------------------------------------------
// Key sequences
// ---------------------------------------------------------------------------

export const SEQUENCES = {
  neon: ['8', '9', '3'],
  konami: ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'],
  kanpai: ['k', 'a', 'n', 'p', 'a', 'i'],
} as const satisfies Partial<Record<EggId, readonly string[]>>;

type SequenceEgg = keyof typeof SEQUENCES;

/**
 * Feed it keys, one at a time; it answers with the egg a key completes, if any.
 * Keys are case-insensitive. Pure apart from its own short memory.
 */
export function keyMatcher(sequences: Record<string, readonly string[]> = SEQUENCES): (key: string) => string | null {
  const longest = Math.max(...Object.values(sequences).map((s) => s.length));
  let buffer: string[] = [];
  return (key: string) => {
    buffer = [...buffer, key.toLowerCase()].slice(-longest);
    for (const [id, seq] of Object.entries(sequences)) {
      if (buffer.length >= seq.length && seq.every((k, i) => buffer[buffer.length - seq.length + i] === k)) {
        buffer = [];
        return id;
      }
    }
    return null;
  };
}

/** True on the click that makes `n` within `windowMs`. */
export function clickCounter(n = 8, windowMs = 4000): (at?: number) => boolean {
  let clicks: number[] = [];
  return (at = Date.now()) => {
    clicks = [...clicks.filter((t) => at - t < windowMs), at];
    if (clicks.length >= n) {
      clicks = [];
      return true;
    }
    return false;
  };
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

/** A bar night runs to 6 a.m.: 2:00 on the 10th is still the night of the 9th. */
export function nightOf(date: Date): { key: string; day: number } {
  const d = new Date(date.getTime() - 6 * 3600_000);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { key, day: d.getDate() };
}

/**
 * Is Kyū on the bar tonight? Always on a night with a 9 in the date (she's the
 * nine), and otherwise at about one table in six.
 */
export function catVisits(code: string, date: Date = new Date()): boolean {
  const night = nightOf(date);
  if (String(night.day).includes('9')) return true;
  return hash(`${code}|${night.key}|cat`) % 6 === 0;
}

export function isThreeAm(date: Date = new Date()): boolean {
  return date.getHours() === 3;
}

// ---------------------------------------------------------------------------
// The hidden card
// ---------------------------------------------------------------------------

/** The House Rule card that isn't in any deck. Shown by the Konami code. */
export const BUTA_CARD = {
  kanji: '豚',
  romaji: 'Buta',
  name: 'Pig',
  text: 'Eight, nine, three: twenty, which counts as zero. Nothing changes this hand.',
  flavor: 'The House has never drawn this card. It keeps it in the deck anyway.',
} as const;

// ---------------------------------------------------------------------------
// Announcing
// ---------------------------------------------------------------------------

const LINE_BANK: Partial<Record<EggId, readonly string[]>> = {
  neon: EGG_LINES.neon,
  konami: EGG_LINES.buta,
  kanpai: EGG_LINES.kanpai,
  lantern: EGG_LINES.lantern,
  cat: EGG_LINES.cat,
  // The welcome says these when a table opens; the egg says them anywhere else
  // (a rename mid-lobby, 3 a.m. at the front door).
  oyabun: WELCOME.oyabun,
  master: WELCOME.master,
  'cat-name': WELCOME.cat,
  'three-am': WELCOME.threeAm,
};

export interface EggState {
  /** The most recent egg, for anyone who'd rather subscribe than listen. */
  last: EggDetail | null;
  /** Bumps on every egg, so the same egg twice still changes state. */
  count: number;
  /** Ids found this session. */
  session: EggId[];
}

export const useEggs = create<EggState>(() => ({ last: null, count: 0, session: [] }));

const EGG_KANJI: Partial<Record<EggId, string>> = {
  cat: CAT.kanji,
  'cat-name': CAT.kanji,
  neon: '八九三',
  konami: BUTA_CARD.kanji,
  oyabun: '親分',
  'three-am': '三',
};

/** The Master's line for an egg, varying each time it's found. */
export function eggLine(id: EggId, n = 0): Line | null {
  const bank = LINE_BANK[id];
  if (!bank) return null;
  const text = pick(bank, 'egg', n, id);
  const kanji = EGG_KANJI[id] ?? null;
  return { id: `egg:${id}:${n}`, speaker: 'master', text, mood: 'wry', ...(kanji ? { kanji } : {}), hold: 4200 };
}

function windowTarget(): EventTarget | null {
  return typeof window !== 'undefined' ? window : null;
}

/** Announce an egg: the store, the matchbook, and a `893:egg` event on `target`. */
export function triggerEgg(id: EggId, target: EventTarget | null = windowTarget()): EggDetail {
  const { count, session } = useEggs.getState();
  const detail: EggDetail = { id, line: eggLine(id, count) };
  useEggs.setState({ last: detail, count: count + 1, session: session.includes(id) ? session : [...session, id] });
  const book = useMatchbook.getState();
  book.found(id);
  if (id === 'konami') book.award('buta');
  if (id === 'cat') book.award('cat');
  target?.dispatchEvent(new CustomEvent(EGG_EVENT, { detail }));
  return detail;
}

/** Once per session per egg, for things that would otherwise fire on every view. */
function once(id: EggId, target: EventTarget | null): EggDetail | null {
  return useEggs.getState().session.includes(id) ? null : triggerEgg(id, target);
}

/** Call when the player names themselves. */
export function checkName(name: string, target: EventTarget | null = windowTarget()): EggDetail | null {
  const egg = nameEgg(name);
  if (!egg) return null;
  return once(egg === 'cat' ? 'cat-name' : egg, target);
}

/** Call when a room code is known. */
export function checkCode(code: string, target: EventTarget | null = windowTarget()): EggDetail | null {
  return is893Code(code) ? once('code-893', target) : null;
}

const lantern = clickCounter(8, 4000);
/** Call from the lantern's click handler. */
export function lanternClick(target: EventTarget | null = windowTarget(), at = Date.now()): EggDetail | null {
  return lantern(at) ? triggerEgg('lantern', target) : null;
}

/** Call when the cat is petted. */
export function petCat(target: EventTarget | null = windowTarget()): EggDetail {
  return triggerEgg('cat', target);
}

// ---------------------------------------------------------------------------
// The console
// ---------------------------------------------------------------------------

export const REPO_URL = 'https://github.com/KarthikSubramanian07/893-Hold-em';

const HANKO = [
  '  ┏━━━━━━┓',
  '  ┃  八  ┃',
  '  ┃  九  ┃',
  '  ┃  三  ┃',
  '  ┗━━━━━━┛',
].join('\n');

/** A hanko for anyone who opens the console. Once per page. */
export function greetConsole(out: Pick<Console, 'log'> = console): void {
  const seal = 'color:#d2412a;font:16px/1.25 "JetBrains Mono Variable",ui-monospace,monospace';
  const body = 'color:#c9a45c;font:12px/1.6 "JetBrains Mono Variable",ui-monospace,monospace';
  const dim = 'color:#8a8174;font:11px/1.6 "JetBrains Mono Variable",ui-monospace,monospace';
  out.log(`%c${HANKO}`, seal);
  out.log(
    '%cBar 893 · upstairs · six stools\n%cYou found the back door. The Master doesn’t mind.\nThe whole bar is open source, MIT: %s\n%cTry typing the name of the place.',
    body,
    dim,
    REPO_URL,
    dim,
  );
}

// ---------------------------------------------------------------------------
// Installing
// ---------------------------------------------------------------------------

function typingInField(e: Event): boolean {
  const t = e.target as (HTMLElement & { isContentEditable?: boolean }) | null;
  if (!t || typeof t !== 'object' || !('tagName' in t)) return false;
  const tag = String(t.tagName).toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable === true;
}

export interface InstallOptions {
  /** Where to listen for keys and announce eggs. Defaults to window. */
  target?: EventTarget;
  /** Print the console hanko. Default true. */
  console?: boolean;
  /** Clock for the 3 a.m. check. */
  now?: () => Date;
}

let greeted = false;

/** Listen for the key eggs. Returns a function that stops listening. */
export function installEggs(opts: InstallOptions = {}): () => void {
  const target = opts.target ?? windowTarget();
  if (!target) return () => {};
  if (opts.console !== false && !greeted) {
    greeted = true;
    greetConsole();
  }
  if (isThreeAm((opts.now ?? (() => new Date()))())) once('three-am', target);
  const match = keyMatcher();
  const onKey = (e: Event) => {
    const k = e as KeyboardEvent;
    if (k.repeat || k.metaKey || k.ctrlKey || k.altKey || typingInField(e) || typeof k.key !== 'string') return;
    const id = match(k.key) as SequenceEgg | null;
    if (id) triggerEgg(id, target);
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}
