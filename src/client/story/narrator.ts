// The narrator: turns one change in the GameView into a few subtitles.
//
//   narrate(prev, next, you) ──► Line[]   (pure; at most three, usually none)
//
// Every line is chosen with `pick(bank, code, hand, event)`, so two clients
// that see the same pair of views read the same words. The only personal
// lines are the welcome (first visit or not, your own name) and they're marked
// in the event key so they never collide with shared ones.
//
// Restraint is the design. Silence is the default; a line has to earn its place.

import type { GameView, SeatView } from '../../engine/types';
import { RULES, TABLES } from '../../engine/rules';
import {
  burned,
  classifyShowdown,
  foxSeat,
  heatCrossed,
  is893Code,
  nameEgg,
} from './analysis';
import { chance, fill, listNames, pick } from './hash';
import {
  CHAPTERS,
  CLEAN_SWEEP,
  CLOSE_CALL,
  HEAT,
  IDLE,
  IDLE_CAT,
  JOIN,
  JOIN_OYABUN,
  KITSUNE_ANON,
  LAST_HAND,
  REGULAR_MOMENTS,
  RULE_LINES,
  SHOWDOWN,
  TAKE,
  WELCOME,
  type Bank,
} from './lines';
import { isPracticeCode } from '../net/practice';
import { maskFor } from './masks';
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
function regularMoment(view: GameView, moment: 'heat' | 'last' | 'take' | 'walked' | 'yakuza'): { who: RegularName; bank: Bank } | null {
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

  // The night starts: the chapter, then the first mask sits down.
  const nightStart = next.phase === 'call' && next.hand === 1 && (prev.phase === 'lobby' || prev.phase === 'over' || prev.hand !== 1);
  if (nightStart) {
    const ch = CHAPTERS[table];
    out.push(line(next, `night:${table}`, { speaker: 'master', text: choose(next, ch.intro, `night:${table}`), kanji: ch.kanji, mood: 'calm', hold: 5200 }));
  }

  // A new hand after the first.
  const newHand = next.phase === 'call' && next.hand > 1 && next.hand !== prev.hand;
  if (newHand) {
    const h = handLine(next);
    if (h) out.push(h);
  }

  // The House Rule turns over.
  const ruleTurned = next.phase === 'call' && next.rule !== null && (nightStart || newHand || prev.rule !== next.rule);
  if (ruleTurned) out.push(ruleLine(next));

  // The showdown.
  const resolved = next.result !== null && (prev.result === null || prev.hand !== next.hand);
  if (resolved) {
    const said = showdownLine(next);
    if (said) out.push(said);
  }

  // The verdict ends the night; it speaks for the counters too.
  const verdict = next.verdict !== null && (prev.verdict === null || prev.phase !== 'over');
  if (verdict) return [...out.slice(0, 1), ...verdictLines(next)];

  // The debt is covered.
  if (prev.take < next.target && next.take >= next.target) {
    const gin = regularMoment(next, 'take');
    out.push(
      gin && chance(0.5, seedOf(next), next.hand, 'take:who')
        ? line(next, 'take', { speaker: gin.who, text: choose(next, gin.bank, 'take:regular'), mood: 'gold' })
        : line(next, 'take', { speaker: 'master', text: choose(next, TAKE, 'take'), kanji: '円', mood: 'gold' }),
    );
  }

  // The street is getting warm.
  const mark = heatCrossed(prev.heat, next.heat, next.heatLimit);
  if (mark) {
    const taka = mark !== 'half' ? regularMoment(next, 'heat') : null;
    out.push(
      taka
        ? line(next, `heat:${mark}`, { speaker: taka.who, text: choose(next, taka.bank, `heat:regular`), kanji: '熱', mood: 'danger' })
        : line(next, `heat:${mark}`, { speaker: 'master', text: choose(next, HEAT[mark], `heat:${mark}`), kanji: '熱', mood: 'danger' }),
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
  if (view.hand === view.hands) {
    const nao = regularMoment(view, 'last');
    if (nao && chance(0.4, seedOf(view), view.hand, 'last:who')) {
      return line(view, 'hand:last', { speaker: nao.who, text: choose(view, nao.bank, 'last:regular'), mood: 'wry' });
    }
    const need = view.target - view.take;
    const hot = view.heat >= view.heatLimit - 1;
    const kind = hot ? 'hot' : need > 0 ? 'short' : 'made';
    return line(view, 'hand:last', {
      speaker: 'master',
      text: choose(view, LAST_HAND[kind], `last:${kind}`, { need }),
      kanji: '六',
      mood: hot ? 'danger' : 'calm',
    });
  }
  // Any other hand speaks only through its House Rule, if it has one.
  return null;
}

function ruleLine(view: GameView): Line {
  const rule = view.rule!;
  const info = RULES[rule];
  const event = `rule:${rule}`;
  if (rule === 'oni') {
    const oni = maskFor(view.config.difficulty, view.house.length - 1, 'oni', view.house.length);
    return line(view, event, { speaker: oni.id, text: choose(view, oni.lines.intro, 'mask:oni'), kanji: info.kanji, mood: 'danger' });
  }
  if (rule === 'kitsune') {
    const fox = foxSeat(view);
    return line(view, event, {
      speaker: 'master',
      text: fox ? choose(view, RULE_LINES.kitsune, event, { name: fox.name }) : choose(view, KITSUNE_ANON, event),
      kanji: info.kanji,
      mood: 'wry',
    });
  }
  const mood: Mood = info.kind === 'boon' ? 'warm' : info.kind === 'bane' ? 'cold' : 'wry';
  return line(view, event, { speaker: 'master', text: choose(view, RULE_LINES[rule], event), kanji: info.kanji, mood });
}

const SHOWDOWN_STYLE: Record<ShowdownKind, { mood: Mood; kanji?: string }> = {
  crew: { mood: 'gold' },
  house: { mood: 'danger' },
  tie: { mood: 'hush' },
  walked: { mood: 'hush', kanji: '空' },
  royal: { mood: 'gold', kanji: '王' },
  yakuza: { mood: 'gold', kanji: '八九三' },
  'bad-beat': { mood: 'cold' },
  serpent: { mood: 'cold', kanji: '蛇' },
  reversal: { mood: 'gold', kanji: '逆' },
  'quiet-champion': { mood: 'warm' },
  'trash-rider': { mood: 'warm' },
  seen: { mood: 'wry', kanji: '見' },
};

/** A line for the rare showdowns only; the panel already covers the ordinary ones. */
function showdownLine(view: GameView): Line | null {
  const { kind, seat } = classifyShowdown(view);
  const r = view.result!;
  const event = `showdown:${kind}`;
  const style = SHOWDOWN_STYLE[kind];
  const names = listNames(burned(view).map((id) => view.seats.find((s) => s.id === id)?.name ?? '').filter(Boolean));
  const handName = seat?.hand?.name ?? r.crewBest?.name ?? 'nothing';
  const vars = {
    name: seat?.name ?? '',
    hand: kind === 'trash-rider' ? handName.toLowerCase() : lowerFirst(handName),
    Hand: handName,
    names,
  };
  const master = (bank: Bank = SHOWDOWN[kind]) =>
    line(view, event, { speaker: 'master', text: choose(view, bank, event, vars), mood: style.mood, ...(style.kanji ? { kanji: style.kanji } : {}) });

  if (kind === 'yakuza') {
    const sumi = regularMoment(view, 'yakuza');
    if (sumi && chance(0.35, seedOf(view), view.hand, 'yakuza:who')) {
      return line(view, event, { speaker: sumi.who, text: choose(view, sumi.bank, 'yakuza:regular'), kanji: '八九三', mood: 'gold' });
    }
    return master();
  }
  if (kind === 'walked' && SHOWDOWN.walked.length) {
    const mame = regularMoment(view, 'walked');
    if (mame && chance(0.5, seedOf(view), view.hand, 'walked:who')) {
      return line(view, event, { speaker: mame.who, text: choose(view, mame.bank, 'walked:regular'), mood: 'hush' });
    }
    return master();
  }
  if (kind === 'crew' || kind === 'house') {
    const said = regularAfterHand(view, kind);
    if (said) return said;
  }
  if (SHOWDOWN[kind].length === 0) return null;
  return master();
}

/**
 * Now and then, a bot regular has a word about an ordinary hand: the one whose
 * cards carried the crew, or one the House just burned. About one hand in three,
 * so the table has voices without turning into chatter.
 */
function regularAfterHand(view: GameView, kind: 'crew' | 'house'): Line | null {
  const r = view.result!;
  const ids = (kind === 'crew' ? r.crewChampions : burned(view)) ?? [];
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
    const sweep = view.history.length >= view.hands && view.history.every((h) => h.outcome === 'crew');
    if (sweep) out.push(line(view, 'coda:sweep', { speaker: 'master', text: choose(view, CLEAN_SWEEP, 'coda:sweep'), kanji: '総', mood: 'gold' }));
    else if (view.heat === view.heatLimit - 1) {
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
