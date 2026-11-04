import { describe, expect, it } from 'vitest';
import type { GameView } from '../../engine/types';
import { entry, fixture, hv, seatOver, withResult } from './fixtures';
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
const call = () => fixture('call');
const showdown = (edit: (v: GameView) => GameView = (v) => v) => edit(fixture('showdown'));
const detect = (prev: GameView | null, next: GameView, you = 's0', c = ctx) => detectStamps(prev, next, you, c).sort();

function memory(): KeyValue & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}


describe('the stamps', () => {
  it('has around twenty, each with kanji, a name, and a verse', () => {
    expect(STAMPS.length).toBeGreaterThanOrEqual(16);
    expect(STAMPS.length).toBeLessThanOrEqual(24);
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
    expect(detect(call(), showdown(), null as unknown as string)).toEqual([]);
    expect(detect(call(), call())).toEqual([]);
  });

  it('presses The Nod when you carry a hand you were nodded on', () => {
    // s1 carried with two nods.
    expect(detect(call(), showdown(), 's1')).toContain('the-nod');
    expect(detect(call(), showdown(), 's1')).not.toContain('blind-faith');
  });

  it('presses Blind Faith when you carry with no nods at all', () => {
    const v = showdown((s) => ({ ...s, seats: s.seats.map((x) => ({ ...x, nod: null })) }));
    expect(detect(call(), v, 's1')).toContain('blind-faith');
    expect(detect(call(), v, 's1')).not.toContain('the-nod');
  });

  it('presses Good Eye when your nod went to the carrier', () => {
    expect(detect(call(), showdown(), 's0')).toContain('good-eye');
    expect(detect(call(), showdown(), 's3')).not.toContain('good-eye');
    expect(detect(call(), showdown((s) => withResult(s, { outcome: 'house' })), 's0')).not.toContain('good-eye');
  });

  it('presses Full House In when every stool went In and won', () => {
    expect(detect(call(), showdown((s) => withResult(s, { ins: ['s0', 's1', 's2', 's3'] })))).toContain('all-in');
    expect(detect(call(), showdown())).not.toContain('all-in');
  });

  it('presses Ya-ku-za when you carry with 8, 9 and 3 between your hand and the board', () => {
    const v = showdown((s) => seatOver({ ...s, board: ['3c', 'Kh', '7s', '2c', 'Qh'] }, 's1', { cards: ['8h', '9d'] }));
    expect(detect(call(), v, 's1')).toContain('yakuza');
    expect(detect(call(), withResult(v, { outcome: 'house' }), 's1')).not.toContain('yakuza');
  });

  it('presses Royal for the crew’s royal flush, not the House’s', () => {
    const royal = hv(9_000_000, 'straight-flush', 'Royal flush', ['Ah', 'Kh', 'Qh', 'Jh', 'Th']);
    expect(detect(call(), showdown((s) => withResult(s, { crewBest: royal })), 's1')).toContain('royal');
    expect(detect(call(), showdown((s) => withResult(s, { outcome: 'house', houseBest: royal })), 's1')).not.toContain('royal');
  });

  it('presses Never Knew when your own straight or better turns over', () => {
    expect(detect(call(), showdown(), 's1')).toContain('never-knew');
    expect(detect(call(), showdown(), 's0')).not.toContain('never-knew');
  });

  it('presses So Close when you sat out holding the winner and the crew lost', () => {
    const lost = showdown((s) => withResult(s, { outcome: 'house', couldHave: ['s2'] }));
    expect(detect(call(), lost, 's2')).toContain('so-close');
    expect(detect(call(), showdown((s) => withResult(s, { couldHave: ['s2'] })), 's2')).not.toContain('so-close');
  });

  it('presses Ghosts when everyone sits out', () => {
    expect(detect(call(), showdown((s) => withResult(s, { outcome: 'walked', crewBest: null, ins: [] })))).toContain('ghosts');
  });

  it('presses Night Owl only between three and four in the morning', () => {
    expect(detect(call(), showdown(), 's0', { now: new Date(2026, 10, 1, 3, 30) })).toContain('night-owl');
    expect(detect(call(), showdown(), 's0', { now: new Date(2026, 10, 1, 4, 0) })).not.toContain('night-owl');
    expect(detect(null, fixture('lobby'), 's0', { now: new Date(2026, 10, 1, 3, 30) })).not.toContain('night-owl');
  });

  it('presses Full Bar when six people and no regulars sit down to play', () => {
    const six = fixture('nod', { seats: Array.from({ length: 6 }, (_, i) => ({ ...fixture('nod').seats[0]!, id: `s${i}`, bot: false })) });
    expect(detect(fixture('lobby'), six)).toContain('full-bar');
    const withBot = { ...six, seats: six.seats.map((s, i) => (i === 5 ? { ...s, bot: true } : s)) };
    expect(detect(fixture('lobby'), withBot)).not.toContain('full-bar');
  });

  describe('at the end of the night', () => {
    const end = (over: Partial<GameView>) => detect(fixture('showdown', { hand: 6 }), fixture('over', over));

    it('presses First Night, Clean Getaway and the chapter stamp for a clean getaway', () => {
      expect(end({})).toEqual(expect.arrayContaining(['first-night', 'getaway', 'corner']));
      expect(end({ config: { difficulty: 'kabukicho', timer: 30 } })).toContain('neon');
      expect(end({ config: { difficulty: 'oyabun', timer: 30 } })).toContain('oyabun');
      expect(end({ verdict: 'dawn' })).not.toContain('corner');
      expect(end({ verdict: 'dawn' })).toContain('last-orders');
    });

    it('presses Close Shave after a step from the sirens', () => {
      expect(end({ history: [entry(1, 'house', -7, 4), entry(2, 'crew', 4, 4)] })).toContain('close-shave');
      expect(end({ history: [entry(1, 'house', -6, 4), entry(2, 'crew', 4, 4)] })).not.toContain('close-shave');
    });

    it('presses Clean Sweep for a night with no step toward the sirens', () => {
      expect(end({ history: [entry(1, 'crew', 4, 4), entry(2, 'crew', 4, 4), entry(3, 'crew', 3, 3)] })).toContain('sweep');
      expect(end({})).not.toContain('sweep');
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
    expect(step(fixture('showdown', { hand: 6 }), fixture('over', { verdict: 'dawn' }))).toContain('first-night');
    expect(book).toMatchObject({ nights: 1, cleared: [] });
    expect(step(fixture('showdown', { hand: 6 }), fixture('over', { config: { difficulty: 'shitamachi', timer: 30 } }))).toContain('corner');
    expect(book).toMatchObject({ nights: 2, cleared: ['shitamachi'] });
    // The same verdict seen twice is one night.
    step(fixture('over'), { ...fixture('over'), ready: ['s0'] });
    expect(book.nights).toBe(2);
  });
});
