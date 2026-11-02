import { describe, expect, it } from 'vitest';
import { karplusStrong, noiseSamples } from './dsp';
import { MIYAKO, TONIC, degree, seeded } from './music';

const SR = 48_000;

/** Fundamental by normalized autocorrelation with parabolic peak refinement. */
function pitchOf(x: Float32Array, expected: number): number {
  const seg = x.subarray(Math.round(SR * 0.05), Math.round(SR * 0.35));
  const p = SR / expected;
  const lo = Math.floor(p * 0.6);
  const hi = Math.ceil(p * 1.4);
  const r = (lag: number) => {
    let s = 0;
    for (let i = 0; i + lag < seg.length; i++) s += seg[i]! * seg[i + lag]!;
    return s / (seg.length - lag);
  };
  let best = lo;
  let bestR = -Infinity;
  for (let lag = lo; lag <= hi; lag++) {
    const v = r(lag);
    if (v > bestR) [best, bestR] = [lag, v];
  }
  const a = r(best - 1);
  const c = r(best + 1);
  const shift = (a - c) / (2 * (a - 2 * bestR + c));
  return SR / (best + shift);
}

const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
const centsOff = (f: number, target: number) => 1200 * Math.log2(f / target);

describe('karplusStrong', () => {
  const opts = { decay: 1.5, brightness: 0.8, position: 0.12 };

  it.each([110, 196, 293.66, 466.16, 880, 1567.98])('stays in tune at %d Hz', (freq) => {
    const x = karplusStrong(SR, freq, 0.5, opts, seeded(7));
    expect(Math.abs(centsOff(pitchOf(x, freq), freq))).toBeLessThan(5);
  });

  it('is finite, normalized, and decays', () => {
    const x = karplusStrong(SR, 293.66, 1.5, opts, seeded(1));
    expect(x.length).toBe(SR * 1.5);
    expect(x.every(Number.isFinite)).toBe(true);
    expect(Math.max(...x.map(Math.abs))).toBeCloseTo(1, 5);
    const head = rms(x.subarray(0, SR * 0.1));
    const tail = rms(x.subarray(SR * 1.3, SR * 1.4));
    // About 60 dB over the decay time; allow slack for the excitation's spread.
    expect(20 * Math.log10(tail / head)).toBeLessThan(-35);
    expect(Math.abs(x[x.length - 1]!)).toBe(0);
  });

  it('rings longer with a longer decay', () => {
    const short = karplusStrong(SR, 220, 1, { ...opts, decay: 0.4 }, seeded(3));
    const long = karplusStrong(SR, 220, 1, { ...opts, decay: 2 }, seeded(3));
    const at = (x: Float32Array) => rms(x.subarray(SR * 0.6, SR * 0.7));
    expect(at(long)).toBeGreaterThan(at(short) * 10);
  });

  it('is reproducible by seed and varies between seeds', () => {
    const a = karplusStrong(SR, 440, 0.2, opts, seeded(11));
    const b = karplusStrong(SR, 440, 0.2, opts, seeded(11));
    const c = karplusStrong(SR, 440, 0.2, opts, seeded(12));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('is darker with a softer pick', () => {
    const bright = karplusStrong(SR, 220, 0.3, { ...opts, brightness: 0.9 }, seeded(5));
    const soft = karplusStrong(SR, 220, 0.3, { ...opts, brightness: 0.2 }, seeded(5));
    const edge = (x: Float32Array) => rms(x.map((v, i) => v - (x[i - 1] ?? 0))) / rms(x);
    expect(edge(soft)).toBeLessThan(edge(bright));
  });
});

describe('noiseSamples', () => {
  it.each(['white', 'pink', 'brown'] as const)('makes finite, normalized %s noise', (color) => {
    const x = noiseSamples(SR, 1, color, seeded(2));
    expect(x.every(Number.isFinite)).toBe(true);
    expect(Math.max(...x.map(Math.abs))).toBeLessThanOrEqual(1);
    expect(rms(x)).toBeGreaterThan(0.05);
  });

  it('runs from bright to dark: white, pink, brown', () => {
    const edge = (x: Float32Array) => rms(x.map((v, i) => v - (x[i - 1] ?? 0))) / rms(x);
    const [w, p, b] = (['white', 'pink', 'brown'] as const).map((c) => edge(noiseSamples(SR, 1, c, seeded(4))));
    expect(w).toBeGreaterThan(p!);
    expect(p).toBeGreaterThan(b!);
  });
});

describe('the miyako-bushi scale', () => {
  it('is D Eb G A Bb', () => {
    expect(MIYAKO).toEqual([0, 1, 5, 7, 8]);
    const hz = [0, 1, 2, 3, 4].map((d) => degree(d));
    [293.66, 311.13, 392.0, 440.0, 466.16].forEach((f, i) => expect(hz[i]).toBeCloseTo(f, 0));
  });

  it('runs on across octaves both ways', () => {
    expect(degree(0)).toBe(TONIC);
    expect(degree(5)).toBeCloseTo(TONIC * 2, 6);
    expect(degree(10)).toBeCloseTo(TONIC * 4, 6);
    expect(degree(-5)).toBeCloseTo(TONIC / 2, 6);
    expect(degree(-1)).toBeCloseTo(233.08, 1); // Bb3
  });
});

describe('seeded', () => {
  it('is deterministic and stays in [0, 1)', () => {
    const a = seeded(42);
    const b = seeded(42);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
