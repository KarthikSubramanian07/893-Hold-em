import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../dev/fixtures';
import type { GameView } from '../../engine/types';
import { deriveSeats, deriveTargets, heatRatio, lastCall, maskMood, orderSeats } from './derive';

const F = (name: string): GameView => structuredClone(FIXTURES[name]!);

describe('orderSeats', () => {
  it('rotates the viewer to the front and keeps seat order around the table', () => {
    const v = F('river');
    const order = orderSeats(v.seats, 's3').map((s) => s.id);
    expect(order).toEqual(['s3', 's4', 's0', 's1', 's2']);
  });

  it('leaves spectators in seat order', () => {
    const v = F('river');
    expect(orderSeats(v.seats, null).map((s) => s.id)).toEqual(['s0', 's1', 's2', 's3', 's4']);
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
    expect(deriveSeats(F('river'))).toHaveLength(5);
  });

  it('lights candles only while calls are open', () => {
    const v = F('preflop');
    expect(deriveSeats(v).filter((s) => s.locked).map((s) => s.key)).toEqual(['s1', 's3']);
    v.phase = 'showdown';
    expect(deriveSeats(v).some((s) => s.locked)).toBe(false);
  });
});

describe('lastCall', () => {
  it('returns the latest revealed call with a stable key', () => {
    const v = F('river');
    expect(lastCall(v.seats[1]!, 3)).toEqual({ street: 2, stance: 'stay', key: '3:2:stay' });
    expect(lastCall(v.seats[2]!, 3)?.stance).toBe('fold');
    expect(lastCall(F('preflop').seats[0]!, 1)).toBeNull();
  });
});

describe('heatRatio', () => {
  it('clamps to 0..1', () => {
    expect(heatRatio({ heat: 4, heatLimit: 8 })).toBe(0.5);
    expect(heatRatio({ heat: 12, heatLimit: 8 })).toBe(1);
    expect(heatRatio({ heat: 1, heatLimit: 0 })).toBe(0);
  });
});

describe('deriveTargets', () => {
  it('hides cards, masks, and the rule in the lobby', () => {
    const t = deriveTargets(F('lobby'));
    expect(t.house).toEqual([]);
    expect(t.heroCards).toEqual([]);
    expect(t.rule).toBeNull();
    expect(t.board.every((b) => b.slot === null)).toBe(true);
  });

  it('hands the viewer their own cards to hold up', () => {
    expect(deriveTargets(F('preflop')).heroCards).toEqual(['Ah', 'Kd']);
  });

  it('marks the champions best five at the showdown', () => {
    const t = deriveTargets(F('showdown'));
    // Board Kh 7s 7d 2c Qh. Crew best: 7h 7s 7d Qs Qh. House best: Kh Kc 7s 7d Qh.
    expect(t.board.map((b) => b.crew)).toEqual([false, true, true, false, true]);
    expect(t.board.map((b) => b.house)).toEqual([true, true, true, false, true]);
    const champ = t.seats.find((s) => s.champion)!;
    expect(champ.key).toBe('s1');
    expect(champ.glow).toEqual([true, true]);
    expect(t.seats.find((s) => s.key === 's0')!.glow).toEqual([false, false]);
    const houseChamp = t.house.find((h) => h.champion)!;
    expect(houseChamp.glow).toEqual([false, true]);
    expect(t.house.find((h) => !h.champion)!.glow).toEqual([false, false]);
  });

  it('turns up the neon and the police lights as heat climbs', () => {
    const cool = F('river');
    cool.heat = 0;
    const hot = F('river');
    hot.heat = 8;
    expect(deriveTargets(hot).neon).toBeGreaterThan(deriveTargets(cool).neon);
    expect(deriveTargets(cool).police).toBe(0);
    expect(deriveTargets(hot).police).toBe(1);
  });

  it('dims the lantern when the crew walks away', () => {
    const v = F('showdown');
    v.result!.outcome = 'walked';
    expect(deriveTargets(v).lantern).toBeLessThan(0.5);
  });

  it('sets the haze and mask moods by outcome', () => {
    const v = F('showdown');
    expect(deriveTargets(v).haze).toBe(0);
    expect(deriveTargets(v).house.every((h) => h.mood === 'retreat')).toBe(true);
    v.result!.outcome = 'house';
    const t = deriveTargets(v);
    expect(t.haze).toBe(1);
    expect(t.house.map((h) => h.mood)).toEqual(['lean', 'flare']);
  });

  it('keeps masks idle outside the showdown', () => {
    expect(maskMood(true, F('river'))).toBe('idle');
  });
});
