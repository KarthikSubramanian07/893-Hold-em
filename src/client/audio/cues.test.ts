import { describe, expect, it } from 'vitest';
import type { GameView, HandResult, HandValue, SeatView, Slot } from '../../engine/types';
import { FIXTURES } from '../dev/fixtures';
import { type SoundCue, type SoundName, TIMING, deadlineChanged, soundsFor } from './cues';

const NOW = 1_700_000_000_000;

function seat(i: number, over: Partial<SeatView> = {}): SeatView {
  return {
    id: `s${i}`,
    name: `P${i}`,
    avatar: 'kitsune',
    bot: false,
    host: i === 0,
    connected: true,
    // You see teammates' cards, never your own.
    cards: i === 0 ? ['back', 'back'] : ['2c', '3c'],
    locked: false,
    nod: null,
    stance: null,
    hand: null,
    champion: false,
    ...over,
  };
}

const NO_BOARD: Slot[] = [null, null, null, null, null];
const FLOP: Slot[] = ['Kh', '7s', '7d', null, null];
const hv: HandValue = { score: 1, category: 'pair', name: 'Pair of twos', best: ['2s', '2d', '9c', '8h', '4s'] };
const result = (outcome: HandResult['outcome']): HandResult => ({
  outcome,
  moved: 0,
  ins: [],
  crewBest: hv,
  houseBest: hv,
  crewChampions: [],
  couldHave: [],
});

function view(over: Partial<GameView> = {}): GameView {
  return {
    code: 'TEST1',
    phase: 'nod',
    config: { difficulty: 'shitamachi', timer: 0 },
    you: 's0',
    seats: [seat(0), seat(1), seat(2)],
    house: { cards: ['9c', 'back', 'back'], hand: null },
    board: FLOP,
    night: 1,
    hand: 1,
    lastOrders: 10,
    meter: 0,
    door: 7,
    sirens: 6,
    deadline: null,
    result: null,
    history: [],
    verdict: null,
    ready: [],
    now: NOW,
    ...over,
  };
}

/** A copy of `v` with one seat changed. */
function withSeat(v: GameView, id: string, over: Partial<SeatView>): GameView {
  return { ...v, seats: v.seats.map((s) => (s.id === id ? { ...s, ...over } : s)) };
}

const names = (cues: SoundCue[]) => cues.map((c) => c.sound);
const count = (cues: SoundCue[], sound: SoundName) => cues.filter((c) => c.sound === sound).length;
const delayOf = (cues: SoundCue[], sound: SoundName) => cues.find((c) => c.sound === sound)?.delay;

describe('soundsFor: shape', () => {
  it('is silent when nothing changed', () => {
    const v = view();
    expect(soundsFor(v, v, 's0')).toEqual([]);
    expect(soundsFor(v, { ...v, now: NOW + 500 }, 's0')).toEqual([]);
  });

  it('returns cues sorted by delay, with whole non-negative delays', () => {
    const prev = view({ hand: 0, phase: 'lobby', seats: [seat(0, { cards: [] }), seat(1, { cards: [] })], house: { cards: [], hand: null }, board: NO_BOARD });
    const next = view({ deadline: NOW + 4_200 });
    const cues = soundsFor(prev, next, 's0');
    expect(cues.length).toBeGreaterThan(5);
    for (const [i, c] of cues.entries()) {
      expect(Number.isInteger(c.delay)).toBe(true);
      expect(c.delay).toBeGreaterThanOrEqual(0);
      if (i > 0) expect(c.delay).toBeGreaterThanOrEqual(cues[i - 1]!.delay);
    }
  });

  it('does not mutate its inputs', () => {
    const prev = view();
    const next = withSeat(view({ deadline: NOW + 3000 }), 's1', { locked: true });
    const snap = JSON.stringify([prev, next]);
    soundsFor(prev, next, 's0');
    expect(JSON.stringify([prev, next])).toBe(snap);
  });
});

describe('soundsFor: joining', () => {
  it('stays quiet on the first view, even mid-hand', () => {
    expect(soundsFor(null, FIXTURES.call!, 's0').filter((c) => c.sound !== 'tick')).toEqual([]);
    expect(soundsFor(null, FIXTURES.showdown!, 's0')).toEqual([]);
    expect(soundsFor(null, FIXTURES.over!, 's0')).toEqual([]);
  });

  it('still picks up the countdown on the first view', () => {
    const cues = soundsFor(null, view({ deadline: NOW + 3_500 }), 's0');
    expect(cues).toEqual([
      { sound: 'tick', delay: 500 },
      { sound: 'tick', delay: 1_500 },
      { sound: 'tick', delay: 2_500 },
    ]);
  });
});

describe('soundsFor: dealing', () => {
  const lobby = view({
    phase: 'lobby',
    hand: 0,
    seats: [seat(0, { cards: [] }), seat(1, { cards: [] })],
    house: { cards: [], hand: null },
    board: NO_BOARD,
  });

  it('deals every hole card, the House, and the flop, staggered', () => {
    const next = view({ seats: [seat(0), seat(1)], house: { cards: ['9c', 'back', 'back'], hand: null } });
    const cues = soundsFor(lobby, next, 's0');
    // 4 hole cards + 3 House cards = 7 deals, then the flop lands face up.
    expect(count(cues, 'deal')).toBe(7 + 3);
    expect(count(cues, 'flip')).toBe(3);
    const holeDeals = cues.filter((c) => c.sound === 'deal').slice(0, 7).map((c) => c.delay);
    expect(holeDeals).toEqual([0, 1, 2, 3, 4, 5, 6].map((i) => i * TIMING.dealGap));
  });

  it('caps a big deal', () => {
    const next = view({ seats: [0, 1, 2, 3, 4, 5].map((i) => seat(i)), board: NO_BOARD });
    expect(count(soundsFor(lobby, next, 's0'), 'deal')).toBe(TIMING.maxDeals);
  });

  it('treats a new hand as a fresh deal even where slots were already filled', () => {
    const showdown = view({
      phase: 'showdown',
      hand: 2,
      seats: [seat(0, { cards: ['Ah', 'Kd'] }), seat(1)],
      house: { cards: ['9c', '9d', '4h'], hand: hv },
      board: ['Kh', '7s', '7d', '2c', 'Qh'],
      result: result('crew'),
    });
    const next = view({ hand: 3, seats: [seat(0), seat(1, { cards: ['Jc', 'Jd'] })], board: NO_BOARD });
    const cues = soundsFor(showdown, next, 's0');
    expect(count(cues, 'deal')).toBe(4 + 3);
    expect(count(cues, 'flip')).toBe(0);
  });

  it('lands the turn and river face up: a deal, then a flip, each', () => {
    const prev = view();
    const next = view({ phase: 'call', board: ['Kh', '7s', '7d', '2c', 'Qh'] });
    const cues = soundsFor(prev, next, 's0');
    expect(count(cues, 'deal')).toBe(2);
    expect(count(cues, 'flip')).toBe(2);
    const deals = cues.filter((c) => c.sound === 'deal').map((c) => c.delay);
    const flips = cues.filter((c) => c.sound === 'flip').map((c) => c.delay);
    expect(deals).toEqual([0, TIMING.boardGap]);
    expect(flips).toEqual(deals.map((d) => d + TIMING.boardFlipAfter));
  });

  it('does not flip a face card that only changed identity', () => {
    const prev = view();
    const next = withSeat(prev, 's1', { cards: ['Qh', 'Kd'] });
    expect(soundsFor(prev, next, 's0')).toEqual([]);
  });
});

describe('soundsFor: nods and calls', () => {
  it('stamps further off when a teammate nods or passes', () => {
    const prev = view();
    expect(names(soundsFor(prev, withSeat(prev, 's1', { locked: true }), 's0'))).toEqual(['stampFar']);
  });

  it('leaves your own nod and call to the dock', () => {
    const prev = view();
    expect(soundsFor(prev, withSeat(prev, 's0', { locked: true, nod: 's1' }), 's0')).toEqual([]);
    const call = view({ phase: 'call', board: ['Kh', '7s', '7d', '2c', 'Qh'] });
    expect(soundsFor(call, withSeat(call, 's0', { locked: true, stance: 'in' }), 's0')).toEqual([]);
  });

  it('caps distant stamps', () => {
    const prev = view({ seats: [0, 1, 2, 3, 4, 5].map((i) => seat(i)) });
    const next = view({ seats: [0, 1, 2, 3, 4, 5].map((i) => seat(i, { locked: true })) });
    expect(count(soundsFor(prev, next, 's0'), 'stampFar')).toBe(TIMING.maxFarStamps);
  });

  it('gives a spectator distant stamps for everyone', () => {
    const prev = view({ you: null });
    const next = view({ you: null, seats: prev.seats.map((s) => ({ ...s, locked: true })) });
    expect(count(soundsFor(prev, next, null), 'stampFar')).toBe(3);
  });

  it('does not stamp when locks carry into a new phase', () => {
    const prev = view();
    const toCall = view({ phase: 'call', seats: prev.seats.map((s) => ({ ...s, locked: true })) });
    expect(count(soundsFor(prev, toCall, 's0'), 'stampFar')).toBe(0);
  });

  it('turns the nods over when the call opens, after the turn and river', () => {
    const prev = view({ seats: [seat(0, { locked: true, nod: 's1' }), seat(1, { locked: true }), seat(2, { locked: true })] });
    const next = view({
      phase: 'call',
      board: ['Kh', '7s', '7d', '2c', 'Qh'],
      seats: [seat(0, { nod: 's1' }), seat(1), seat(2, { nod: 's1' })],
    });
    const cues = soundsFor(prev, next, 's0');
    expect(count(cues, 'nodReveal')).toBe(1);
    expect(delayOf(cues, 'nodReveal')).toBe(2 * TIMING.boardGap + TIMING.nodRevealAfter);
  });

  it('stays quiet about nods when everyone passed', () => {
    const next = view({ phase: 'call', board: ['Kh', '7s', '7d', '2c', 'Qh'] });
    expect(count(soundsFor(view(), next, 's0'), 'nodReveal')).toBe(0);
  });
});

describe('soundsFor: the showdown', () => {
  it('turns your own cards over before the taiko, then the win', () => {
    const cues = soundsFor(FIXTURES.call!, FIXTURES.showdown!, 's0');
    expect(count(cues, 'ownReveal')).toBe(1);
    expect(count(cues, 'reveal')).toBe(1);
    expect(count(cues, 'win')).toBe(1);
    expect(count(cues, 'flip')).toBeLessThanOrEqual(TIMING.showdownFlips);
    const own = delayOf(cues, 'ownReveal')!;
    const reveal = delayOf(cues, 'reveal')!;
    expect(reveal).toBe(own + TIMING.ownRevealLead);
    expect(delayOf(cues, 'win')).toBe(reveal + TIMING.revealHit);
    for (const c of cues.filter((c) => c.sound === 'flip')) expect(c.delay).toBeLessThan(own);
  });

  it('gives a spectator no own-card reveal', () => {
    const prev = { ...FIXTURES.call!, you: null, seats: FIXTURES.call!.seats.map((s) => ({ ...s, cards: ['back', 'back'] as Slot[] })) };
    const cues = soundsFor(prev, { ...FIXTURES.showdown!, you: null }, null);
    expect(count(cues, 'ownReveal')).toBe(0);
    expect(count(cues, 'reveal')).toBe(1);
  });

  it.each([
    ['crew', 'win'],
    ['house', 'lose'],
    ['tie', 'tie'],
  ] as const)('maps a %s hand to %s after the reveal', (outcome, sound) => {
    const cues = soundsFor(view({ phase: 'call' }), view({ phase: 'showdown', result: result(outcome) }), 's0');
    expect(names(cues)).toEqual(['reveal', sound]);
    expect(delayOf(cues, sound)).toBe(TIMING.revealHit);
  });

  it('skips the taiko when everyone sat out', () => {
    const cues = soundsFor(view({ phase: 'call' }), view({ phase: 'showdown', result: result('walked') }), 's0');
    expect(names(cues)).toEqual(['tie']);
  });

  it('plays the showdown only once', () => {
    const show = view({ phase: 'showdown', result: result('crew') });
    expect(soundsFor(show, { ...show, ready: ['s1'] }, 's0')).toEqual([]);
  });

  it('waits for a result before playing an outcome', () => {
    expect(soundsFor(view({ phase: 'call' }), view({ phase: 'showdown', result: null }), 's0')).toEqual([]);
  });
});

describe('soundsFor: the end of the night', () => {
  it.each([
    ['clean', 'stingClean'],
    ['raid', 'stingRaid'],
    ['dawn', 'stingDawn'],
  ] as const)('plays the %s verdict as %s', (verdict, sound) => {
    const show = view({ phase: 'showdown', result: result('crew') });
    expect(names(soundsFor(show, view({ phase: 'over', verdict }), 's0'))).toEqual([sound]);
  });

  it('plays the result before the sting when the last hand goes straight to the verdict', () => {
    const cues = soundsFor(view({ phase: 'call' }), view({ phase: 'over', verdict: 'raid', result: result('house') }), 's0');
    expect(names(cues)).toEqual(['reveal', 'lose', 'stingRaid']);
    expect(delayOf(cues, 'stingRaid')).toBe(TIMING.revealHit + TIMING.stingAfter);
  });

  it('plays just the sting when the verdict arrives without a fresh result', () => {
    expect(names(soundsFor(view(), view({ phase: 'over', verdict: 'dawn' }), 's0'))).toEqual(['stingDawn']);
  });

  it('plays the result, then the sting, across a showdown and the verdict', () => {
    const prev = view({ phase: 'call' });
    const show = view({ phase: 'showdown', result: result('house') });
    const cues = [...soundsFor(prev, show, 's0'), ...soundsFor(show, { ...show, phase: 'over', verdict: 'raid' }, 's0')];
    expect(names(cues)).toEqual(['reveal', 'lose', 'stingRaid']);
  });

  it('works on the real fixtures', () => {
    expect(names(soundsFor(FIXTURES.showdown!, FIXTURES.over!, 's0'))).toEqual(['stingClean']);
  });
});

describe('soundsFor: the clock', () => {
  it('schedules a tick for each of the last five seconds', () => {
    const cues = soundsFor(view(), view({ deadline: NOW + 30_000 }), 's0');
    expect(cues).toEqual([25_000, 26_000, 27_000, 28_000, 29_000].map((delay) => ({ sound: 'tick', delay })));
  });

  it('drops ticks that are already past', () => {
    const cues = soundsFor(view(), view({ deadline: NOW + 2_200 }), 's0');
    expect(cues.map((c) => c.delay)).toEqual([200, 1_200]);
  });

  it('uses the server clock in the view, not the local one', () => {
    const cues = soundsFor(view(), view({ deadline: NOW + 10_000, now: NOW + 4_000 }), 's0');
    expect(cues.map((c) => c.delay)).toEqual([1_000, 2_000, 3_000, 4_000, 5_000]);
  });

  it('does not reschedule while the deadline holds', () => {
    const a = view({ deadline: NOW + 10_000 });
    const b = withSeat({ ...a, now: NOW + 2_000 }, 's1', { locked: true });
    expect(count(soundsFor(a, b, 's0'), 'tick')).toBe(0);
  });

  it('reschedules when the call opens a new countdown', () => {
    const a = view({ deadline: NOW + 1_000 });
    const b = view({ phase: 'call', deadline: NOW + 31_000, now: NOW + 1_000 });
    expect(count(soundsFor(a, b, 's0'), 'tick')).toBe(5);
  });

  it('never ticks with the timer off or outside a call', () => {
    expect(count(soundsFor(view(), view({ deadline: null }), 's0'), 'tick')).toBe(0);
    expect(count(soundsFor(view(), view({ phase: 'showdown', deadline: NOW + 3_000 }), 's0'), 'tick')).toBe(0);
  });
});

describe('deadlineChanged', () => {
  it('is true for a fresh countdown', () => {
    expect(deadlineChanged(null, view({ deadline: NOW + 5_000 }))).toBe(true);
    expect(deadlineChanged(view(), view({ deadline: NOW + 5_000 }))).toBe(true);
    expect(deadlineChanged(view({ phase: 'showdown', deadline: NOW }), view({ deadline: NOW }))).toBe(true);
  });

  it('is true when the same deadline moves from the nod to the call', () => {
    expect(deadlineChanged(view({ deadline: NOW }), view({ phase: 'call', deadline: NOW }))).toBe(true);
  });

  it('is false for the same countdown, no countdown, or outside a hand', () => {
    expect(deadlineChanged(view({ deadline: NOW }), view({ deadline: NOW, now: NOW + 1 }))).toBe(false);
    expect(deadlineChanged(view(), view())).toBe(false);
    expect(deadlineChanged(view(), view({ phase: 'over', deadline: NOW + 1_000 }))).toBe(false);
  });
});
