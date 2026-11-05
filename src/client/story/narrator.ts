// The narrator: turns one change in the GameView into a few subtitles.
//
//   narrate(prev, next, you) ──► Line[]   (pure; at most three, usually none)
//
// Every line is chosen with `pick(bank, code, hand, event)`, so two clients
// that see the same pair of views read the same words. The only personal
// lines are the welcome (first visit or not, your own name) and the reveal of
// your own monster hand; both are marked in the event key so they never
// collide with shared ones.
//
// Restraint is the design. Silence is the default; a line has to earn its place.

import type { GameView, SeatView } from '../../engine/types';
import { TABLES } from '../../engine/rules';
import { classifyShowdown, is893Code, isMonster, lowestMeter, markerCrossed, nameEgg, nodKind } from './analysis';
import { chance, fill, listNames, pick } from './hash';
import {
  CHAPTERS,
  CLEAN_SWEEP,
  CLOSE_CALL,
  IDLE,
  IDLE_CAT,
  JOIN,
  JOIN_OYABUN,
  LAST_ORDERS,
  MARKER,
  NODS,
  REGULAR_MOMENTS,
  REVEAL,
  SHOWDOWN,
  SWING,
  WELCOME,
  type Bank,
  type RegularMoment,
} from './lines';
import { isPracticeCode } from '../net/practice';
import { regularFor } from './regulars';
import type { Line, Mood, RegularName, ShowdownKind, Speaker } from './types';

export interface NarrateContext {
  /** Has this browser been to the bar before? Only changes the welcome. */
  returning?: boolean;
  /** Local time, for the 3 a.m. welcome. Defaults to now. */
  now?: Date;
}

/** Lines per transition, the verdict excepted. */
export const MAX_LINES = 3;

/** How long a line stays up after it has typed on: long enough to read twice. */
export function holdFor(text: string): number {
  return Math.round(Math.min(7000, Math.max(2600, 1600 + text.length * 55)));
}

interface Say {
  speaker: Speaker;
  text: string;
  kanji?: string;
  mood?: Mood;
  hold?: number;
}

/**
 * What line choices hash on: the table code, plus the night after the first,
 * so a crew that stays for another night hears it told differently. Every seat
 * shares both values, so everyone still reads the same words.
 */
export function seedOf(view: Pick<GameView, 'code' | 'night'>): string {
  return (view.night ?? 0) > 1 ? `${view.code}~${view.night}` : view.code;
}

function line(view: GameView, event: string, say: Say): Line {
  return {
    id: `${seedOf(view)}:${view.hand}:${event}`,
    speaker: say.speaker,
    text: say.text,
    ...(say.kanji ? { kanji: say.kanji } : {}),
    ...(say.mood ? { mood: say.mood } : {}),
    hold: say.hold ?? holdFor(say.text),
  };
}

const choose = (view: GameView, bank: Bank, event: string, vars?: Record<string, string | number>) =>
  fill(pick(bank, seedOf(view), view.hand, event), vars);

/** A seated bot regular with something to say about this moment, if any. */
function regularMoment(view: GameView, moment: RegularMoment): { who: RegularName; bank: Bank } | null {
  for (const s of view.seats) {
    if (!s.bot) continue;
    const r = regularFor(s.name);
    const bank = r && REGULAR_MOMENTS[r.name]?.[moment];
    if (r && bank) return { who: r.name, bank };
  }
  return null;
}

// ---------------------------------------------------------------------------

export function narrate(prev: GameView | null, next: GameView, you: string | null, ctx: NarrateContext = {}): Line[] {
  if (!prev || prev.code !== next.code) return [welcome(next, you, ctx)];

  const out: Line[] = [];
  const table = next.config.difficulty;

  // Someone new at the table.
  if (next.phase === 'lobby') {
    const joined = joiners(prev, next, you);
    if (joined) out.push(joinLine(next, joined));
  }

  // The night starts: the chapter, then the House sits down.
  const nightStart = next.phase === 'nod' && next.hand === 1 && (prev.phase === 'lobby' || prev.phase === 'over' || prev.hand !== 1);
  if (nightStart) {
    const ch = CHAPTERS[table];
    out.push(line(next, `night:${table}`, { speaker: 'master', text: choose(next, ch.intro, `night:${table}`), kanji: ch.kanji, mood: 'calm', hold: 5200 }));
  }

  // A new hand after the first.
  const newHand = next.phase === 'nod' && next.hand > 1 && next.hand !== prev.hand;
  if (newHand) {
    const h = handLine(next);
    if (h) out.push(h);
  }

  // The nods turn over.
  if (prev.phase === 'nod' && next.phase === 'call' && prev.hand === next.hand) {
    const n = nodsLine(next);
    if (n) out.push(n);
  }

  // The showdown.
  const resolved = next.result !== null && (prev.result === null || prev.hand !== next.hand);
  if (resolved) {
    const said = showdownLine(next);
    if (said) out.push(said);
    const swing = swingLine(next);
    if (swing && out.length < MAX_LINES - 1) out.push(swing);
    const mine = revealLine(next, you);
    if (mine) out.push(mine);
  }

  // The verdict ends the night; it speaks for the counters too.
  const verdict = next.verdict !== null && (prev.verdict === null || prev.phase !== 'over');
  if (verdict) return [...out.slice(0, 1), ...verdictLines(next)];

  // The marker one step from either end.
  const mark = markerCrossed(prev, next);
  if (mark) {
    const who = regularMoment(next, mark === 'door-near' ? 'door' : 'sirens');
    const mood: Mood = mark === 'door-near' ? 'gold' : 'danger';
    const kanji = mark === 'door-near' ? '門' : '警';
    out.push(
      who && chance(0.5, seedOf(next), next.hand, `${mark}:who`)
        ? line(next, `marker:${mark}`, { speaker: who.who, text: choose(next, who.bank, `${mark}:regular`), kanji, mood })
        : line(next, `marker:${mark}`, { speaker: 'master', text: choose(next, MARKER[mark], `marker:${mark}`), kanji, mood }),
    );
  }

  return out.slice(0, MAX_LINES);
}

// ---------------------------------------------------------------------------

function welcome(view: GameView, you: string | null, ctx: NarrateContext): Line {
  const me = view.seats.find((s) => s.id === you);
  const hour = (ctx.now ?? new Date()).getHours();
  const say = (kind: keyof typeof WELCOME, mood: Mood = 'warm', kanji?: string) =>
    line(view, `welcome:${kind}`, { speaker: 'master', text: choose(view, WELCOME[kind], `welcome:${kind}`), mood, ...(kanji ? { kanji } : {}) });

  if (!you || !me) return say('spectator', 'calm');
  if (view.phase !== 'lobby') return say('rejoin', 'calm');
  const egg = nameEgg(me.name);
  if (egg === 'oyabun') return say('oyabun', 'wry', '親分');
  if (egg === 'master') return say('master', 'wry');
  if (egg === 'cat') return say('cat', 'wry', '九');
  if (is893Code(view.code)) return say('code893', 'gold', '八九三');
  if (hour === 3) return say('threeAm', 'hush', '三');
  if (isPracticeCode(view.code)) return say('practice');
  return say(ctx.returning ? 'returning' : 'first');
}

function joiners(prev: GameView, next: GameView, you: string | null): SeatView | null {
  const before = new Map(prev.seats.map((s) => [s.id, s.name]));
  return next.seats.find((s) => s.id !== you && before.get(s.id) !== s.name) ?? null;
}

function joinLine(view: GameView, seat: SeatView): Line {
  const event = `join:${seat.id}:${seat.name}`;
  const regular = seat.bot ? regularFor(seat.name) : null;
  if (regular) {
    return line(view, event, { speaker: regular.name, text: choose(view, regular.intro, event), kanji: regular.kanji, mood: 'warm' });
  }
  const bank = nameEgg(seat.name) === 'oyabun' ? JOIN_OYABUN : JOIN;
  return line(view, event, { speaker: 'master', text: choose(view, bank, event, { name: seat.name }), mood: 'calm' });
}

function handLine(view: GameView): Line | null {
  if (view.hand !== view.lastOrders) return null;
  const nao = regularMoment(view, 'last');
  if (nao && chance(0.4, seedOf(view), view.hand, 'last:who')) {
    return line(view, 'hand:last', { speaker: nao.who, text: choose(view, nao.bank, 'last:regular'), mood: 'wry' });
  }
  const need = view.door - view.meter;
  const hot = view.meter <= -(view.sirens - 2);
  const kind = hot ? 'hot' : need <= 2 ? 'near' : 'far';
  return line(view, 'hand:last', {
    speaker: 'master',
    text: choose(view, LAST_ORDERS[kind], `last:${kind}`, { need }),
    kanji: '終',
    mood: hot ? 'danger' : 'calm',
  });
}

/** The nods turning over. Only the telling patterns get a word. */
function nodsLine(view: GameView): Line | null {
  const n = nodKind(view);
  if (!n) return null;
  const event = `nods:${n.kind}`;
  // Everyone passing is common early on; say it now and then, not every time.
  if (n.kind === 'all-pass' && !chance(0.5, seedOf(view), view.hand, event)) return null;
  const vars = { name: n.seats[0]?.name ?? '', names: listNames(n.seats.map((s) => s.name)) };
  return line(view, event, { speaker: 'master', text: choose(view, NODS[n.kind], event, vars), kanji: '頷', mood: n.kind === 'all-pass' ? 'wry' : 'warm' });
}

const SHOWDOWN_STYLE: Record<ShowdownKind, { mood: Mood; kanji?: string }> = {
  crew: { mood: 'gold' },
  house: { mood: 'danger' },
  tie: { mood: 'hush' },
  walked: { mood: 'hush', kanji: '空' },
  royal: { mood: 'gold', kanji: '王' },
  yakuza: { mood: 'gold', kanji: '八九三' },
  'bad-beat': { mood: 'cold' },
  'sat-out': { mood: 'wry', kanji: '出' },
  'blind-carry': { mood: 'warm', kanji: '入' },
  'nodded-carry': { mood: 'warm', kanji: '頷' },
  'all-in': { mood: 'gold', kanji: '総' },
  'big-swing': { mood: 'gold' },
};

/** A line for the rare showdowns only; the panel already covers the ordinary ones. */
function showdownLine(view: GameView): Line | null {
  const { kind, seat } = classifyShowdown(view);
  const r = view.result!;
  const event = `showdown:${kind}`;
  const style = SHOWDOWN_STYLE[kind];
  const handName = seat?.hand?.name ?? r.crewBest?.name ?? 'nothing';
  const vars = { name: seat?.name ?? '', hand: lowerFirst(handName), Hand: handName };
  const master = (bank: Bank = SHOWDOWN[kind]) =>
    line(view, event, { speaker: 'master', text: choose(view, bank, event, vars), mood: style.mood, ...(style.kanji ? { kanji: style.kanji } : {}) });

  if (kind === 'yakuza') {
    const sumi = regularMoment(view, 'yakuza');
    if (sumi && chance(0.35, seedOf(view), view.hand, 'yakuza:who')) {
      return line(view, event, { speaker: sumi.who, text: choose(view, sumi.bank, 'yakuza:regular'), kanji: '八九三', mood: 'gold' });
    }
    return master();
  }
  if (kind === 'walked') {
    const mame = regularMoment(view, 'walked');
    if (mame && chance(0.5, seedOf(view), view.hand, 'walked:who')) {
      return line(view, event, { speaker: mame.who, text: choose(view, mame.bank, 'walked:regular'), mood: 'hush' });
    }
    return master();
  }
  if (kind === 'crew' || kind === 'house' || kind === 'nodded-carry' || kind === 'big-swing') {
    const said = regularAfterHand(view, r.outcome === 'crew' ? 'crew' : 'house');
    if (said) return said;
  }
  if (SHOWDOWN[kind].length === 0) return null;
  return master();
}

/** A big step one way or the other gets a short word of its own. */
function swingLine(view: GameView): Line | null {
  const r = view.result!;
  if (Math.abs(r.moved) < 4 || view.verdict) return null;
  const dir = r.moved > 0 ? 'up' : 'down';
  return line(view, `swing:${dir}`, { speaker: 'master', text: choose(view, SWING[dir], `swing:${dir}`), mood: dir === 'up' ? 'gold' : 'danger' });
}

/** Personal: your own cards turned over, and they were a monster. Only you hear this one. */
function revealLine(view: GameView, you: string | null): Line | null {
  const me = view.seats.find((s) => s.id === you);
  if (!me?.hand || !isMonster(me.hand) || me.champion) return null;
  const event = `reveal:${me.id}`;
  return line(view, event, {
    speaker: 'master',
    text: choose(view, REVEAL, event, { hand: phrase(me.hand.name, me.hand.category), Hand: me.hand.name.split(',')[0]! }),
    kanji: '見',
    mood: 'gold',
  });
}

function phrase(name: string, category: string): string {
  const short = name.split(',')[0]!.toLowerCase();
  return category === 'quads' || category === 'two-pair' || category === 'trips' ? short : `a ${short}`;
}

/**
 * Now and then, a bot regular has a word about an ordinary hand: the one whose
 * hand beat the House, or one who went In and lost. About one hand in three,
 * so the table has voices without turning into chatter.
 */
function regularAfterHand(view: GameView, kind: 'crew' | 'house'): Line | null {
  const r = view.result!;
  const ids = kind === 'crew' ? r.crewChampions : r.ins;
  const event = `regular:${kind}`;
  if (!chance(0.35, seedOf(view), view.hand, event)) return null;
  for (const id of ids) {
    const seat = view.seats.find((s) => s.id === id);
    const regular = seat?.bot ? regularFor(seat.name) : null;
    if (!regular) continue;
    const bank = kind === 'crew' ? regular.carried : regular.lost;
    return line(view, event, { speaker: regular.name, text: choose(view, bank, event), kanji: regular.kanji, mood: kind === 'crew' ? 'warm' : 'wry' });
  }
  return null;
}

/** "Full house, sevens full of queens" → "full house, sevens full of queens". */
function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function verdictLines(view: GameView): Line[] {
  const table = view.config.difficulty;
  const verdict = view.verdict!;
  const ch = CHAPTERS[table];
  const event = `verdict:${table}:${verdict}`;
  const run = pick(ch.epilogue[verdict], seedOf(view), view.hand, event);
  const mood: Mood = verdict === 'clean' ? 'gold' : verdict === 'raid' ? 'danger' : 'cold';
  const out = run.map((text, i) =>
    line(view, `${event}:${i}`, { speaker: 'master', text, mood, kanji: i === 0 ? ch.kanji : undefined, hold: Math.max(5200, holdFor(text) + 1200) }),
  );
  if (verdict === 'clean') {
    const sweep = view.history.length >= 2 && view.history.every((h) => h.moved > 0);
    if (sweep) out.push(line(view, 'coda:sweep', { speaker: 'master', text: choose(view, CLEAN_SWEEP, 'coda:sweep'), kanji: '総', mood: 'gold' }));
    else if (lowestMeter(view.history) <= -(view.sirens - 1)) {
      out.push(line(view, 'coda:close', { speaker: 'master', text: choose(view, CLOSE_CALL, 'coda:close'), kanji: '紙一重', mood: 'wry' }));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

/**
 * Something to say while the lobby fills, or nothing. Call on a slow timer
 * (every 40 seconds or so) with an increasing `tick`; roughly a third of the
 * ticks stay silent.
 */
export function idleLine(view: GameView, tick: number, opts: { cat?: boolean } = {}): Line | null {
  if (view.phase !== 'lobby') return null;
  if (!chance(0.66, seedOf(view), tick, 'idle:speak')) return null;
  const bank = opts.cat && chance(0.3, seedOf(view), tick, 'idle:cat') ? IDLE_CAT : IDLE;
  const text = fill(pick(bank, seedOf(view), tick, 'idle'));
  return { id: `${view.code}:idle:${tick}`, speaker: 'master', text, mood: 'calm', hold: holdFor(text) };
}

/** The chapter heading for a table, for title cards and the matchbook. */
export function chapterTitle(table: keyof typeof TABLES): string {
  const ch = CHAPTERS[table];
  return `第${ch.number}章 · ${ch.kanji} · ${ch.title}`;
}
