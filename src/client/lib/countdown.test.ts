import { describe, expect, it } from 'vitest';
import { countdown, ringOffset } from './countdown';

describe('countdown', () => {
  it('is null with no deadline or no timer', () => {
    expect(countdown(null, 0, 0, 30_000)).toBeNull();
    expect(countdown(10_000, 0, 0, 0)).toBeNull();
  });

  it('counts down in server time', () => {
    // Client clock is 2s behind the server: skew = +2000.
    const c = countdown(32_000, 0, 2_000, 30_000)!;
    expect(c.ms).toBe(30_000);
    expect(c.fraction).toBe(1);
    expect(c.seconds).toBe(30);
  });

  it('rounds seconds up and flags the last five', () => {
    const c = countdown(10_000, 5_100, 0, 30_000)!;
    expect(c.seconds).toBe(5);
    expect(c.urgent).toBe(true);
    expect(countdown(10_000, 0, 0, 30_000)!.urgent).toBe(false);
  });

  it('never goes negative', () => {
    const c = countdown(1_000, 9_000, 0, 30_000)!;
    expect(c.ms).toBe(0);
    expect(c.fraction).toBe(0);
    expect(c.urgent).toBe(false);
  });

  it('clamps when the deadline is beyond the timer', () => {
    expect(countdown(60_000, 0, 0, 30_000)!.fraction).toBe(1);
  });

  it('empties the ring', () => {
    const r = 10;
    expect(ringOffset(1, r)).toBe(0);
    expect(ringOffset(0, r)).toBeCloseTo(2 * Math.PI * r);
    expect(ringOffset(0.5, r)).toBeCloseTo(Math.PI * r);
    expect(ringOffset(2, r)).toBe(0);
  });
});
