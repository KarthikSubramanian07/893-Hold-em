import { describe, expect, it } from 'vitest';
import type { GameView, HistoryEntry } from '../../engine/types';
import { fixture, hv, seatOver, withResult } from './fixtures';
import {
  EMPTY_MATCHBOOK,
  type KeyValue,
  MATCHBOOK_KEY,
  STAMPS,
  detectStamps,
  loadMatchbook,
  pressStamps,
  recordTransition,
  saveMatchbook,
} from './stamps';

const EVENING = new Date(2026, 10, 1, 21, 0);
const ctx = { now: EVENING };
const river = () => fixture('river');
const showdown = (edit: (v: GameView) => GameView = (v) => v) => edit(fixture('showdown'));
const detect = (prev: GameView | null, next: GameView, you = 's0', c = ctx) => detectStamps(prev, next, you, c).sort();

function memory(): KeyValue & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

const history = (outcomes: HistoryEntry['outcome'][], take = 4): HistoryEntry[] =>
  outcomes.map((outcome, i) => ({ hand: i + 1, rule: null, outcome, take: outcome === 'crew' ? take : 0, heat: 0, crewBestName: null, houseBestName: 'King high' }));

describe('the stamps', () => {
  it('has around twenty, each with kanji, a name, and a verse', () => {
    expect(STAMPS.length).toBeGreaterThanOrEqual(16);
    expect(STAMPS.length).toBeLessThanOrEqual(21);
    expect(new Set(STAMPS.map((s) => s.id)).size).toBe(STAMPS.length);
    for (const s of STAMPS) {
      expect(s.kanji.length).toBeGreaterThan(0);
      expect(s.kanji.length).toBeLessThanOrEqual(3);
      expect(s.verse).not.toMatch(/!/);
    }
  });
});

describe('detectStamps', () => {
  it('earns nothing for spectators or on a quiet step', () => {
    expect(detect(river(), showdown(), null as unknown as string)).toEqual([]);
    expect(detect(river(), river())).toEqual([]);
  });

  it('presses Ya-ku-za when you win with 8, 9 and 3 between your hand and the board', () => {
    const v = showdown((s) => seatOver({ ...s, board: ['3c', 'Kh', '7s', '2c', 'Qh'] }, 's0', { cards: ['8h', '9d'] }));
    expect(detect(river(), v)).toContain('yakuza');
    // Not when the House took it.
    expect(detect(river(), withResult(v, { outcome: 'house' }))).not.toContain('yakuza');
    // Not when you folded.
    expect(detect(river(), seatOver(v, 's0', { active: false }))).not.toContain('yakuza');
  });

  it('presses Ride or Die when you are paid holding the worst hand at the table', () => {
    // The fixture's s0 (two pair) beats Daichi's pair; give s0 the weakest hand.
    const worst = showdown((s) => seatOver(s, 's0', { hand: hv(1_000_000, 'high', 'Ace high', ['Ah', 'Kd', 'Qh', '7s', '2c']) }));
    expect(detect(river(), worst)).toContain('ride-or-die');
    expect(detect(river(), showdown())).not.toContain('ride-or-die');
    expect(detect(river(), { ...worst, rule: 'gyaku' })).not.toContain('ride-or-die');
  });

  it('presses Lone Rider when you were the only one in, and won', () => {
    const alone = showdown((s) => ({ ...s, seats: s.seats.map((x) => ({ ...x, active: x.id === 's0' })) }));
    expect(detect(river(), alone)).toContain('lone-rider');
  });

  it('presses Royal for the crew’s royal flush, not the House’s', () => {
    const royal = hv(9_000_000, 'straight-flush', 'Royal flush', ['Ah', 'Kh', 'Qh', 'Jh', 'Th']);
    expect(detect(river(), showdown((s) => withResult(s, { crewBest: royal })))).toContain('royal');
    expect(detect(river(), showdown((s) => withResult(s, { outcome: 'house', houseBest: royal })))).not.toContain('royal');
  });

  it('presses Ghosts when everyone walks', () => {
    expect(detect(river(), showdown((s) => withResult(s, { outcome: 'walked', crewBest: null })))).toContain('ghosts');
  });

  it('presses Snakebit and Upside Down for the boss’s favourite rules', () => {
    const same = hv(3_000_000, 'two-pair', 'Two pair', ['Kh', 'Kd', '7s', '7d', 'Ah']);
    expect(detect(river(), showdown((s) => withResult({ ...s, rule: 'hebi' }, { outcome: 'house', crewBest: same, houseBest: same })))).toContain('snakebit');
    expect(detect(river(), showdown((s) => ({ ...s, rule: 'gyaku' })))).toContain('upside-down');
  });

  it('presses You Were Seen when you draw heat on a winning hand', () => {
    expect(detect(river(), showdown((s) => withResult(s, { burned: ['s0'] })))).toContain('seen');
    expect(detect(river(), showdown((s) => withResult(s, { burned: ['s3'] })))).not.toContain('seen');
  });

  it('presses Night Owl only between three and four in the morning', () => {
    expect(detect(river(), showdown(), 's0', { now: new Date(2026, 10, 1, 3, 30) })).toContain('night-owl');
    expect(detect(river(), showdown(), 's0', { now: new Date(2026, 10, 1, 4, 0) })).not.toContain('night-owl');
    expect(detect(null, fixture('lobby'), 's0', { now: new Date(2026, 10, 1, 3, 30) })).not.toContain('night-owl');
  });

  it('presses Full House when six people and no regulars sit down to play', () => {
    const six = fixture('preflop', { seats: Array.from({ length: 6 }, (_, i) => ({ ...fixture('preflop').seats[0]!, id: `s${i}`, bot: false })) });
    expect(detect(fixture('lobby'), six)).toContain('full-house');
    const withBot = { ...six, seats: six.seats.map((s, i) => (i === 5 ? { ...s, bot: true } : s)) };
    expect(detect(fixture('lobby'), withBot)).not.toContain('full-house');
  });

  describe('at the end of the night', () => {
    const end = (over: Partial<GameView>) => detect(fixture('showdown', { hand: 6 }), fixture('over', over));

    it('presses First Night and the chapter stamp for a clean getaway', () => {
      expect(end({})).toEqual(expect.arrayContaining(['first-night', 'neon']));
      expect(end({ config: { difficulty: 'shitamachi', timer: 30 } })).toContain('corner');
      expect(end({ config: { difficulty: 'oyabun', timer: 30 } })).toContain('oyabun');
      expect(end({ verdict: 'short' })).not.toContain('neon');
    });

    it('presses Close Call one heat from the raid', () => {
      expect(end({ heat: 7, heatLimit: 8 })).toContain('close-call');
      expect(end({ heat: 6, heatLimit: 8 })).not.toContain('close-call');
    });

    it('presses Clean Sweep for six wins out of six', () => {
      expect(end({ history: history(['crew', 'crew', 'crew', 'crew', 'crew', 'crew']) })).toContain('sweep');
      expect(end({ history: history(['crew', 'crew', 'tie', 'crew', 'crew', 'crew']) })).not.toContain('sweep');
    });

    it('presses Under the Wire when the last hand covered the debt', () => {
      expect(end({ take: 24, target: 20, history: history(['crew', 'house', 'crew', 'house', 'house', 'crew'], 8) })).toContain('under-the-wire');
      expect(end({ take: 24, target: 20, history: history(['crew', 'crew', 'crew', 'house', 'house', 'house'], 8) })).not.toContain('under-the-wire');
    });

    it('presses The Knock for a raid', () => {
      expect(end({ verdict: 'raid' })).toEqual(expect.arrayContaining(['first-night', 'the-knock']));
    });

    it('presses Regular on the fifth night', () => {
      expect(detectStamps(fixture('showdown', { hand: 6 }), fixture('over'), 's0', { ...ctx, nights: 4 })).toContain('regular');
      expect(detectStamps(fixture('showdown', { hand: 6 }), fixture('over'), 's0', { ...ctx, nights: 3 })).not.toContain('regular');
    });

    it('only once, not on every view of the verdict', () => {
      expect(detect(fixture('over'), { ...fixture('over'), ready: ['s1'] })).toEqual([]);
    });
  });
});

describe('the matchbook', () => {
  it('starts empty and survives a round trip', () => {
    const kv = memory();
    expect(loadMatchbook(kv)).toEqual(EMPTY_MATCHBOOK);
    const { data } = pressStamps(EMPTY_MATCHBOOK, ['royal', 'yakuza'], 1000);
    saveMatchbook({ ...data, nights: 3, cleared: ['kabukicho'] }, kv);
    expect(kv.map.has(MATCHBOOK_KEY)).toBe(true);
    expect(loadMatchbook(kv)).toMatchObject({ stamps: { royal: 1000, yakuza: 1000 }, nights: 3, cleared: ['kabukicho'] });
  });

  it('repairs a damaged or hand-edited copy', () => {
    const kv = memory();
    kv.setItem(MATCHBOOK_KEY, '{not json');
    expect(loadMatchbook(kv)).toEqual(EMPTY_MATCHBOOK);
    kv.setItem(MATCHBOOK_KEY, JSON.stringify({ stamps: { royal: 5, fake: 1, yakuza: 'x' }, cleared: ['oyabun', 'moon', 'oyabun'], nights: -2 }));
    expect(loadMatchbook(kv)).toEqual({ ...EMPTY_MATCHBOOK, stamps: { royal: 5 }, cleared: ['oyabun'] });
  });

  it('works without storage at all', () => {
    expect(loadMatchbook(null)).toEqual(EMPTY_MATCHBOOK);
    expect(() => saveMatchbook(EMPTY_MATCHBOOK, null)).not.toThrow();
    const broken: KeyValue = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } };
    expect(() => saveMatchbook(EMPTY_MATCHBOOK, broken)).not.toThrow();
  });

  it('presses each stamp once and keeps the first date', () => {
    const a = pressStamps(EMPTY_MATCHBOOK, ['royal'], 1);
    const b = pressStamps(a.data, ['royal', 'ghosts', 'ghosts'], 2);
    expect(b.fresh).toEqual(['ghosts']);
    expect(b.data.stamps).toEqual({ royal: 1, ghosts: 2 });
  });

  it('counts nights and clears chapters as views go by', () => {
    let book = EMPTY_MATCHBOOK;
    const step = (prev: GameView | null, next: GameView) => {
      const r = recordTransition(book, prev, next, 's0', ctx);
      book = r.data;
      return r.fresh;
    };
    expect(step(fixture('showdown', { hand: 6 }), fixture('over', { verdict: 'short' }))).toContain('first-night');
    expect(book).toMatchObject({ nights: 1, cleared: [] });
    expect(step(fixture('showdown', { hand: 6 }), fixture('over', { config: { difficulty: 'shitamachi', timer: 30 } }))).toContain('corner');
    expect(book).toMatchObject({ nights: 2, cleared: ['shitamachi'] });
    // The same verdict seen twice is one night.
    step(fixture('over'), { ...fixture('over'), ready: ['s0'] });
    expect(book.nights).toBe(2);
  });
});
