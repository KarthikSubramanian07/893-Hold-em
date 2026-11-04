import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../dev/fixtures';
import type { GameView } from '../../engine/types';
import { dangerRatio, deriveSeats, deriveTargets, houseMask, maskMood, nodThreads, orderSeats } from './derive';

const F = (name: string): GameView => structuredClone(FIXTURES[name]!);

describe('orderSeats', () => {
  it('rotates the viewer to the front and keeps seat order around the table', () => {
    const v = F('call');
    expect(orderSeats(v.seats, 's2').map((s) => s.id)).toEqual(['s2', 's3', 's0', 's1']);
  });

  it('leaves spectators in seat order', () => {
    expect(orderSeats(F('call').seats, null).map((s) => s.id)).toEqual(['s0', 's1', 's2', 's3']);
  });
});

describe('deriveSeats', () => {
  it('shows all six chairs in the lobby with open ones marked empty', () => {
    const seats = deriveSeats(F('lobby'));
    expect(seats).toHaveLength(6);
    expect(seats.filter((s) => !s.empty).map((s) => s.key)).toEqual(['s0', 's1', 's3']);
    expect(seats[0]!.you).toBe(true);
    expect(seats[2]!.empty).toBe(true);
  });

  it('only shows occupied seats once the night starts', () => {
    expect(deriveSeats(F('call'))).toHaveLength(4);
  });

  it('lights candles while a nod or a call is open, and not after', () => {
    const v = F('nod');
    expect(deriveSeats(v).filter((s) => s.locked).map((s) => s.key)).toEqual(['s1', 's3']);
    v.phase = 'showdown';
    expect(deriveSeats(v).some((s) => s.locked)).toBe(false);
  });

  it('counts nods only once they are turned over', () => {
    expect(deriveSeats(F('nod')).every((s) => s.nods === 0)).toBe(true);
    const seats = deriveSeats(F('call'));
    expect(seats.find((s) => s.key === 's1')!.nods).toBe(2);
    expect(seats.find((s) => s.key === 's0')!.nods).toBe(1);
  });

  it('drops a stance slip at the showdown and darkens those who sat out', () => {
    const seats = deriveSeats(F('showdown'));
    const ren = seats.find((s) => s.key === 's2')!;
    expect(ren.stance).toBe('out');
    expect(ren.out).toBe(true);
    expect(ren.slipKey).not.toBe('');
    expect(seats.find((s) => s.key === 's1')!.out).toBe(false);
    expect(deriveSeats(F('call')).every((s) => s.slipKey === '')).toBe(true);
  });
});

describe('dangerRatio', () => {
  it('is calm at or above the start, and full one step from the sirens', () => {
    expect(dangerRatio({ meter: 0, door: 11, sirens: 8 })).toBe(0);
    expect(dangerRatio({ meter: 5, door: 11, sirens: 8 })).toBe(0);
    expect(dangerRatio({ meter: -7, door: 11, sirens: 8 })).toBe(1);
    const mid = dangerRatio({ meter: -4, door: 11, sirens: 8 });
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.8);
  });
});

describe('nodThreads', () => {
  it('draws a thread per revealed nod, never during the nod itself', () => {
    expect(nodThreads(F('nod'))).toEqual([]);
    expect(nodThreads(F('call'))).toEqual([
      { from: 's0', to: 's1' },
      { from: 's2', to: 's1' },
      { from: 's3', to: 's0' },
    ]);
    expect(nodThreads(F('lobby'))).toEqual([]);
  });
});

describe('deriveTargets', () => {
  it('hides cards and the House in the lobby', () => {
    const t = deriveTargets(F('lobby'));
    expect(t.house).toEqual([]);
    expect(t.heroCards).toEqual([]);
    expect(t.board.every((b) => b.slot === null)).toBe(true);
  });

  it('hands the viewer their own cards face down, then face up at the showdown', () => {
    expect(deriveTargets(F('nod')).heroCards).toEqual(['back', 'back']);
    expect(deriveTargets(F('showdown')).heroCards).toEqual(['Ah', 'Kd']);
  });

  it('seats one House with its cards, first face up', () => {
    const t = deriveTargets(F('nod'));
    expect(t.house).toHaveLength(1);
    expect(t.house[0]!.cards).toEqual(['Kc', 'back', 'back']);
    expect(t.house[0]!.mask).toBe('okame');
    expect(t.house[0]!.watches).toEqual(['s0', 's1', 's2', 's3']);
  });

  it('marks the best fives at the showdown', () => {
    const t = deriveTargets(F('showdown'));
    // Board Kh 7s 7d 2c Qh. Crew best: 7h 7s 7d Qs Qh. House best: Kh Kc 7s 7d Qh.
    expect(t.board.map((b) => b.crew)).toEqual([false, true, true, false, true]);
    expect(t.board.map((b) => b.house)).toEqual([true, true, true, false, true]);
    const champ = t.seats.find((s) => s.champion)!;
    expect(champ.key).toBe('s1');
    expect(champ.glow).toEqual([true, true]);
    expect(t.seats.find((s) => s.key === 's0')!.glow).toEqual([false, false]);
    expect(t.house[0]!.glow).toEqual([true, false, false]);
    // The House stares down the hand that beat it.
    expect(t.house[0]!.saw).toEqual(['s1']);
  });

  it('turns up the neon and the police lights as the marker nears the sirens', () => {
    const calm = F('call');
    calm.meter = 2;
    const tight = F('call');
    tight.meter = -7;
    expect(deriveTargets(tight).neon).toBeGreaterThan(deriveTargets(calm).neon);
    expect(deriveTargets(calm).police).toBe(0);
    expect(deriveTargets(tight).police).toBe(1);
    expect(deriveTargets(tight).danger).toBe(1);
  });

  it('dims the lantern when everyone sits out, and at dawn', () => {
    const v = F('showdown');
    v.result!.outcome = 'walked';
    expect(deriveTargets(v).lantern).toBeLessThan(0.5);
    const dawn = F('over');
    dawn.verdict = 'dawn';
    expect(deriveTargets(dawn).lantern).toBeLessThan(1);
  });

  it('sets the haze and the House mood by outcome', () => {
    const v = F('showdown');
    expect(deriveTargets(v).haze).toBe(0);
    expect(deriveTargets(v).house[0]!.mood).toBe('retreat');
    v.result!.outcome = 'house';
    const t = deriveTargets(v);
    expect(t.haze).toBe(1);
    expect(t.house[0]!.mood).toBe('flare');
    expect(t.house[0]!.saw).toEqual(['s0']);
  });

  it('keeps the House idle outside the showdown', () => {
    expect(maskMood(F('call'))).toBe('idle');
  });

  it('gives each table its own House mask', () => {
    expect(houseMask('shitamachi')).toBe('okame');
    expect(houseMask('kabukicho')).toBe('kitsune');
    expect(houseMask('oyabun')).toBe('okina');
  });
});
