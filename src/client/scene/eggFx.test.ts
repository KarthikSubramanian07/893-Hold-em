import { describe, expect, it } from 'vitest';
import { kanpaiGlint, kanpaiLift, lanternGutter, neonEgg, swingStep } from './eggFx';

describe('neonEgg', () => {
  it('rests before and after', () => {
    expect(neonEgg(Infinity)).toEqual({ gate: 1, surge: 0 });
    expect(neonEgg(-1)).toEqual({ gate: 1, surge: 0 });
    expect(neonEgg(5)).toEqual({ gate: 1, surge: 0 });
  });

  it('stutters dark first, then surges and decays', () => {
    const gates = Array.from({ length: 14 }, (_, i) => neonEgg(i / 14).gate);
    expect(gates.some((g) => g < 0.5)).toBe(true);
    expect(neonEgg(1.05).surge).toBeGreaterThan(neonEgg(3).surge);
  });
});

describe('lanternGutter', () => {
  it('dips and comes back to full', () => {
    expect(lanternGutter(Infinity)).toBe(1);
    expect(Math.min(...Array.from({ length: 30 }, (_, i) => lanternGutter(0.5 + i * 0.1)))).toBeLessThan(0.5);
    expect(lanternGutter(3.7)).toBe(1);
  });
});

describe('kanpai', () => {
  it('lifts the cups to meet and sets them down again', () => {
    expect(kanpaiLift(Infinity)).toBe(0);
    expect(kanpaiLift(1)).toBe(1);
    expect(kanpaiLift(2.7)).toBe(0);
  });

  it('glints only at the touch', () => {
    expect(kanpaiGlint(0.2)).toBe(0);
    expect(kanpaiGlint(0.72)).toBeGreaterThan(0.8);
    expect(kanpaiGlint(2)).toBe(0);
  });
});

describe('swingStep', () => {
  it('swings when pushed and settles back to rest', () => {
    let [a, v] = swingStep(0, 0, 1 / 60, 0.4);
    let peak = 0;
    for (let i = 0; i < 60 * 12; i++) {
      [a, v] = swingStep(a, v, 1 / 60);
      peak = Math.max(peak, Math.abs(a));
    }
    expect(peak).toBeGreaterThan(0.02);
    expect(Math.abs(a)).toBeLessThan(0.01);
  });

  it('never swings past half a radian', () => {
    const [a] = swingStep(0.49, 50, 0.05);
    expect(a).toBeLessThanOrEqual(0.5);
  });
});
