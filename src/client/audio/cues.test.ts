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
    cards: ['back', 'back'],
    active: true,
    stake: 1,
    locked: false,
    calls: [null, null, null, null],
    hand: null,
    champion: false,
    ...over,
  };
}

const NO_BOARD: Slot[] = [null, null, null, null, null];
const hv: HandValue = { score: 1, category: 'pair', name: 'Pair of twos', best: ['2s', '2d', '9c', '8h', '4s'] };
const result = (outcome: HandResult['outcome']): HandResult => ({ outcome, take: 0, heat: 0, crewBest: hv, houseBest: hv });

function view(over: Partial<GameView> = {}): GameView {
  return {
    code: 'TEST1',
    phase: 'call',
    config: { difficulty: 'kabukicho', timer: 0 },
    you: 's0',
    seats: [seat(0, { cards: ['Ah', 'Kd'] }), seat(1), seat(2)],
    house: [{ cards: ['back', 'back'], hand: null, champion: false }],
    board: NO_BOARD,
    street: 0,
    hand: 1,
    hands: 6,
    take: 0,
    heat: 0,
    target: 20,
    heatLimit: 8,
    rule: null,
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
    const prev = view({ hand: 0, phase: 'lobby', seats: [seat(0, { cards: [] }), seat(1, { cards: [] })], house: [] });
    const next = view({ rule: 'oni', board: ['Kh', '7s', '7d', null, null], deadline: NOW + 4_200 });
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
    const next = withSeat(view({ deadline: NOW + 3000 }), 's1', { active: false });
    const snap = JSON.stringify([prev, next]);
    soundsFor(prev, next, 's0');
    expect(JSON.stringify([prev, next])).toBe(snap);
  });
});

describe('soundsFor: joining', () => {
  it('stays quiet on the first view, even mid-hand', () => {
    expect(soundsFor(null, FIXTURES.river!, 's0').filter((c) => c.sound !== 'tick')).toEqual([]);
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
    house: [],
  });

  it('deals each new hole card, staggered', () => {
    const next = view({ seats: [seat(0, { cards: ['Ah', 'Kd'] }), seat(1)], house: [] });
    const cues = soundsFor(lobby, next, 's0');
    expect(names(cues)).toEqual(['deal', 'deal', 'deal', 'deal']);
    expect(cues.map((c) => c.delay)).toEqual([0, 1, 2, 3].map((i) => i * TIMING.dealGap));
  });

  it('counts the House masks and caps a big deal', () => {
    const next = view({
      seats: [0, 1, 2, 3, 4, 5].map((i) => seat(i)),
      house: [0, 1, 2].map(() => ({ cards: ['back', 'back'] as Slot[], hand: null, champion: false })),
    });
    expect(count(soundsFor(lobby, next, 's0'), 'deal')).toBe(TIMING.maxDeals);
  });

  it('treats a new hand as a fresh deal even where slots were already filled', () => {
    const showdown = view({
      phase: 'showdown',
      hand: 2,
      seats: [seat(0, { cards: ['Ah', 'Kd'] }), seat(1, { cards: ['2c', '3c'] })],
      house: [],
      result: result('crew'),
    });
    const next = view({ hand: 3, seats: [seat(0, { cards: ['9h', '9d'] }), seat(1)], house: [] });
    const cues = soundsFor(showdown, next, 's0');
    expect(count(cues, 'deal')).toBe(4);
    expect(count(cues, 'flip')).toBe(0);
  });

  it('lands each new board card face up: a deal, then a flip', () => {
    const prev = view();
    const next = view({ street: 1, board: ['Kh', '7s', '7d', null, null] });
    const cues = soundsFor(prev, next, 's0');
    expect(count(cues, 'deal')).toBe(3);
    expect(count(cues, 'flip')).toBe(3);
    const deals = cues.filter((c) => c.sound === 'deal').map((c) => c.delay);
    const flips = cues.filter((c) => c.sound === 'flip').map((c) => c.delay);
    expect(deals).toEqual([0, TIMING.boardGap, 2 * TIMING.boardGap]);
    expect(flips).toEqual(deals.map((d) => d + TIMING.boardFlipAfter));
  });

  it('plays one deal and flip for the turn', () => {
    const prev = view({ street: 1, board: ['Kh', '7s', '7d', null, null] });
    const next = view({ street: 2, board: ['Kh', '7s', '7d', '2c', null] });
    expect(names(soundsFor(prev, next, 's0'))).toEqual(['deal', 'flip']);
  });
});

describe('soundsFor: flips', () => {
  it('flips a card turned face up mid-hand', () => {
    const prev = view({ house: [{ cards: ['back', 'back'], hand: null, champion: false }] });
    const next = view({ house: [{ cards: ['9c', 'back'], hand: null, champion: false }] });
    expect(names(soundsFor(prev, next, 's0'))).toEqual(['flip']);
  });

  it('flips another seat revealing a card', () => {
    const prev = view();
    const next = withSeat(prev, 's1', { cards: ['Qs', 'back'] });
    expect(names(soundsFor(prev, next, 's0'))).toEqual(['flip']);
  });

  it('caps a run of flips outside the showdown', () => {
    const prev = view({ seats: [0, 1, 2, 3].map((i) => seat(i)) });
    const next = view({ seats: [0, 1, 2, 3].map((i) => seat(i, { cards: ['2c', '3c'] })) });
    expect(count(soundsFor(prev, next, 's0'), 'flip')).toBe(TIMING.maxFlips);
  });

  it('does not flip a face card that only changed identity', () => {
    const prev = view();
    const next = withSeat(prev, 's0', { cards: ['Qh', 'Kd'] });
    expect(soundsFor(prev, next, 's0')).toEqual([]);
  });
});

describe('soundsFor: what people do', () => {
  it('folds when a seat goes inactive', () => {
    const prev = view();
    expect(names(soundsFor(prev, withSeat(prev, 's2', { active: false }), 's0'))).toEqual(['fold']);
  });

  it('does not fold a seat that was already out', () => {
    const out = withSeat(view(), 's2', { active: false });
    expect(soundsFor(out, { ...out, now: NOW + 1 }, 's0')).toEqual([]);
    expect(soundsFor(out, withSeat(out, 's1', { active: false }), 's0')).toEqual([{ sound: 'fold', delay: 0 }]);
  });

  it('staggers two folds', () => {
    const prev = view();
    const next = withSeat(withSeat(prev, 's1', { active: false }), 's2', { active: false });
    expect(soundsFor(prev, next, 's0')).toEqual([
      { sound: 'fold', delay: 0 },
      { sound: 'fold', delay: TIMING.foldGap },
    ]);
  });

  it('does not fold when a new hand brings folded seats back', () => {
    const prev = withSeat(view({ phase: 'showdown', result: result('house') }), 's2', { active: false });
    const next = view({ hand: 2 });
    expect(count(soundsFor(prev, next, 's0'), 'fold')).toBe(0);
  });

  it('clacks a chip per step the stake goes up', () => {
    const prev = view();
    const cues = soundsFor(prev, withSeat(prev, 's1', { stake: 3 }), 's0');
    expect(cues).toEqual([
      { sound: 'chip', delay: 0 },
      { sound: 'chip', delay: TIMING.chipGap },
    ]);
  });

  it('caps chips across seats', () => {
    const prev = view();
    const next = view({ seats: prev.seats.map((s) => ({ ...s, stake: 3 })) });
    expect(count(soundsFor(prev, next, 's0'), 'chip')).toBe(TIMING.maxChips);
  });

  it('stays quiet about hidden or falling stakes', () => {
    const prev = view();
    expect(soundsFor(prev, withSeat(prev, 's1', { stake: null }), 's0')).toEqual([]);
    const hidden = withSeat(prev, 's1', { stake: null });
    expect(soundsFor(hidden, withSeat(prev, 's1', { stake: 3 }), 's0')).toEqual([]);
    const high = withSeat(prev, 's1', { stake: 3 });
    expect(soundsFor(high, prev, 's0')).toEqual([]);
  });

  it('does not clack chips when stakes reset for a new hand', () => {
    const prev = withSeat(view({ phase: 'showdown', result: result('crew') }), 's1', { stake: 1 });
    const next = withSeat(view({ hand: 2 }), 's1', { stake: 2 });
    expect(count(soundsFor(prev, next, 's0'), 'chip')).toBe(0);
  });

  it('stamps when you lock in', () => {
    const prev = view();
    expect(soundsFor(prev, withSeat(prev, 's0', { locked: true }), 's0')).toEqual([{ sound: 'stamp', delay: 0 }]);
  });

  it('stamps further off when someone else locks in', () => {
    const prev = view();
    const cues = soundsFor(prev, withSeat(prev, 's1', { locked: true }), 's0');
    expect(names(cues)).toEqual(['stampFar']);
    expect(count(soundsFor(prev, withSeat(prev, 's1', { locked: true }), 's1'), 'stamp')).toBe(1);
  });

  it('caps distant stamps', () => {
    const prev = view({ seats: [0, 1, 2, 3, 4, 5].map((i) => seat(i)) });
    const next = view({ seats: [0, 1, 2, 3, 4, 5].map((i) => seat(i, { locked: true })) });
    const cues = soundsFor(prev, next, 's0');
    expect(count(cues, 'stamp')).toBe(1);
    expect(count(cues, 'stampFar')).toBe(TIMING.maxFarStamps);
  });

  it('gives a spectator only distant stamps', () => {
    const prev = view({ you: null });
    const next = view({ you: null, seats: prev.seats.map((s) => ({ ...s, locked: true })) });
    const cues = soundsFor(prev, next, null);
    expect(count(cues, 'stamp')).toBe(0);
    expect(count(cues, 'stampFar')).toBe(3);
  });

  it('does not stamp when locks carry into a new street or a new phase', () => {
    const prev = view();
    const nextStreet = view({ street: 1, seats: prev.seats.map((s) => ({ ...s, locked: true })) });
    expect(count(soundsFor(prev, nextStreet, 's0'), 'stamp')).toBe(0);
    const toShowdown = view({ phase: 'showdown', seats: prev.seats.map((s) => ({ ...s, locked: true })) });
    expect(count(soundsFor(prev, toShowdown, 's0'), 'stamp')).toBe(0);
  });
});

describe('soundsFor: the House Rule', () => {
  it('turns the rule when it changes', () => {
    const prev = view();
    expect(names(soundsFor(prev, view({ rule: 'oni' }), 's0'))).toEqual(['rule']);
  });

  it('turns the rule after the deal on a new hand, even if the rule repeats', () => {
    const prev = view({ phase: 'showdown', rule: 'oni', result: result('crew'), seats: [seat(0, { cards: [] })], house: [] });
    const next = view({ hand: 2, rule: 'oni', seats: [seat(0)], house: [] });
    const cues = soundsFor(prev, next, 's0');
    expect(names(cues)).toEqual(['deal', 'deal', 'rule']);
    expect(delayOf(cues, 'rule')).toBe(2 * TIMING.dealGap + TIMING.ruleAfter);
  });

  it('stays quiet when the rule is unchanged mid-hand or cleared', () => {
    const prev = view({ rule: 'kagami' });
    expect(soundsFor(prev, view({ rule: 'kagami' }), 's0')).toEqual([]);
    expect(soundsFor(prev, view({ rule: null }), 's0')).toEqual([]);
  });
});

describe('soundsFor: the showdown', () => {
  it('plays the river into the showdown: a few flips, the taiko, then the win', () => {
    const cues = soundsFor(FIXTURES.river!, FIXTURES.showdown!, 's0');
    expect(count(cues, 'flip')).toBe(TIMING.showdownFlips);
    expect(count(cues, 'reveal')).toBe(1);
    expect(count(cues, 'win')).toBe(1);
    // Nobody acted: the folded seat stays folded and stakes hold.
    expect(names(cues).filter((n) => !['flip', 'reveal', 'win'].includes(n))).toEqual([]);
    const reveal = delayOf(cues, 'reveal')!;
    expect(delayOf(cues, 'win')).toBe(reveal + TIMING.revealHit);
    // The flips come before the taiko.
    for (const c of cues.filter((c) => c.sound === 'flip')) expect(c.delay).toBeLessThan(reveal);
  });

  it.each([
    ['crew', 'win'],
    ['house', 'lose'],
    ['tie', 'tie'],
  ] as const)('maps a %s hand to %s after the reveal', (outcome, sound) => {
    const cues = soundsFor(view(), view({ phase: 'showdown', result: result(outcome) }), 's0');
    expect(names(cues)).toEqual(['reveal', sound]);
    expect(delayOf(cues, sound)).toBe(TIMING.revealHit);
  });

  it('skips the taiko when the crew walked', () => {
    const cues = soundsFor(view(), view({ phase: 'showdown', result: result('walked') }), 's0');
    expect(names(cues)).toEqual(['tie']);
  });

  it('plays the showdown only once', () => {
    const show = view({ phase: 'showdown', result: result('crew') });
    expect(soundsFor(show, { ...show, ready: ['s1'] }, 's0')).toEqual([]);
  });

  it('waits for a result before playing an outcome', () => {
    expect(soundsFor(view(), view({ phase: 'showdown', result: null }), 's0')).toEqual([]);
  });
});

describe('soundsFor: the end of the night', () => {
  it.each([
    ['clean', 'stingClean'],
    ['raid', 'stingRaid'],
    ['short', 'stingShort'],
  ] as const)('plays the %s verdict as %s', (verdict, sound) => {
    const show = view({ phase: 'showdown', result: result('crew') });
    expect(names(soundsFor(show, view({ phase: 'over', verdict }), 's0'))).toEqual([sound]);
  });

  it('plays the result before the sting when the last hand goes straight to the verdict', () => {
    const cues = soundsFor(view(), view({ phase: 'over', verdict: 'raid', result: result('house') }), 's0');
    expect(names(cues)).toEqual(['reveal', 'lose', 'stingRaid']);
    expect(delayOf(cues, 'stingRaid')).toBe(TIMING.revealHit + TIMING.stingAfter);
  });

  it('plays just the sting when the verdict arrives without a fresh result', () => {
    expect(names(soundsFor(view(), view({ phase: 'over', verdict: 'short' }), 's0'))).toEqual(['stingShort']);
  });

  it('plays the result, then the sting, across a showdown and the verdict', () => {
    const prev = view();
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

  it('reschedules when a new street opens a new countdown', () => {
    const a = view({ deadline: NOW + 1_000 });
    const b = view({ street: 1, deadline: NOW + 31_000, now: NOW + 1_000 });
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

  it('is false for the same countdown, no countdown, or no call', () => {
    expect(deadlineChanged(view({ deadline: NOW }), view({ deadline: NOW, now: NOW + 1 }))).toBe(false);
    expect(deadlineChanged(view(), view())).toBe(false);
    expect(deadlineChanged(view(), view({ phase: 'over', deadline: NOW + 1_000 }))).toBe(false);
  });
});
