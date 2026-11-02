// Pitch and chance: the miyako-bushi scale every string in the bar is tuned
// to, and a small seedable random source so renders can be reproduced.

/** A source of uniform randoms in [0, 1). `Math.random` fits. */
export type Rng = () => number;

/** Mulberry32: tiny, fast, good enough for audio jitter. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform in [lo, hi). */
export const between = (rng: Rng, lo: number, hi: number): number => lo + (hi - lo) * rng();

/** `x` nudged by up to ±`amount` of itself, e.g. vary(rng, 440, 0.02). */
export const vary = (rng: Rng, x: number, amount: number): number => x * (1 + (rng() * 2 - 1) * amount);

/** One of the items, uniformly. */
export const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length) % items.length]!;

/** Cents to a frequency ratio. */
export const cents = (c: number): number => 2 ** (c / 1200);

/** The tonic, D4. */
export const TONIC = 293.66;

/**
 * Miyako-bushi on D: D Eb G A Bb. Semitones above the tonic for each degree.
 * The flat second and flat sixth are where the tension lives.
 */
export const MIYAKO = [0, 1, 5, 7, 8] as const;

/**
 * Frequency of a scale degree. Degrees run on across octaves, so degree 5 is
 * D5, degree -1 is Bb3, and degree 7 is G5.
 */
export function degree(d: number, tonic = TONIC): number {
  const n = MIYAKO.length;
  const octave = Math.floor(d / n);
  const step = MIYAKO[((d % n) + n) % n]!;
  return tonic * 2 ** octave * 2 ** (step / 12);
}
