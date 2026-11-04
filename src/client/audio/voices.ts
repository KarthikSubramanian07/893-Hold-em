// Every one-shot sound in the bar. Each voice takes any BaseAudioContext and a
// destination, so it plays live through the master chain or renders offline
// for the audio check. Small random nudges keep repeats from sounding canned.

import { type Voice, chain, envelope, filter, gain, karplusStrong, noise, pan, toBuffer, tone } from './dsp';
import { type Rng, between, cents, degree, vary } from './music';

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

export type StringKind = 'shamisen' | 'koto';

interface PluckSpec {
  freq: number;
  kind: StringKind;
  level: number;
  decay?: number;
  pan?: number;
}

/**
 * A plucked string. Shamisen is bright with a bachi snap and a skin-bodied
 * midrange; koto is rounder, longer, and softer at the attack.
 */
export function pluck(ctx: BaseAudioContext, out: AudioNode, t: number, spec: PluckSpec, rng: Rng): number {
  const shamisen = spec.kind === 'shamisen';
  const decay = spec.decay ?? (shamisen ? 1.1 : 2.2);
  const freq = vary(rng, spec.freq, 0.0025);
  const samples = karplusStrong(
    ctx.sampleRate,
    freq,
    decay + 0.1,
    {
      decay,
      brightness: shamisen ? between(rng, 0.78, 0.9) : between(rng, 0.3, 0.42),
      position: shamisen ? between(rng, 0.08, 0.14) : between(rng, 0.18, 0.26),
    },
    rng,
  );
  const src = ctx.createBufferSource();
  src.buffer = toBuffer(ctx, samples);
  const level = vary(rng, spec.level, 0.08);
  const body = shamisen
    ? chain(src, filter(ctx, 'highpass', 110), filter(ctx, 'peaking', 520, 1.4, 4), filter(ctx, 'peaking', 2800, 1, 3), gain(ctx, level))
    : chain(src, filter(ctx, 'highpass', 70), filter(ctx, 'lowpass', 4200, 0.6), filter(ctx, 'peaking', 260, 1, 2), gain(ctx, level));
  let dest = out;
  if (spec.pan !== undefined) {
    dest = pan(ctx, spec.pan);
    dest.connect(out);
  }
  body.connect(dest);
  src.start(t);

  if (shamisen) {
    // The bachi: a short, dry snap against the skin.
    const snap = noise(ctx, t, 0.03, rng);
    chain(snap, filter(ctx, 'bandpass', vary(rng, 2400, 0.1), 1.6), envelope(ctx, t, level * 0.35, 0.001, 0.025), out);
  }
  return decay;
}

/** A taiko strike. `size` 0..1 runs from a light rim tap to a full centre hit. */
export function taiko(ctx: BaseAudioContext, out: AudioNode, t: number, size: number, rng: Rng): number {
  const s = Math.max(0, Math.min(1, size));
  const ring = 0.25 + 0.75 * s;
  const level = (0.14 + 0.46 * s) * vary(rng, 1, 0.06);
  const pitch = vary(rng, 92 - 18 * s, 0.03);
  // The membrane: a pitched thump that sags as the skin settles.
  chain(tone(ctx, t, ring, pitch * 1.7, pitch, 0.07), envelope(ctx, t, level, 0.003, ring), out);
  chain(tone(ctx, t, ring * 0.7, pitch * 2.6, pitch * 1.5, 0.05), envelope(ctx, t, level * 0.25, 0.002, ring * 0.5), out);
  // Air pushed out of the shell.
  chain(noise(ctx, t, 0.25, rng, 'brown'), filter(ctx, 'lowpass', 260), envelope(ctx, t, level * 0.9, 0.004, 0.18 + 0.2 * s), out);
  // The stick on the skin.
  chain(noise(ctx, t, 0.04, rng), filter(ctx, 'bandpass', vary(rng, 900, 0.1), 0.9), envelope(ctx, t, level * 0.18, 0.001, 0.03), out);
  return ring;
}

/** A soft bell partial cluster, like a small rin bowl across the room. */
function chime(ctx: BaseAudioContext, out: AudioNode, t: number, freq: number, level: number, rng: Rng): number {
  const ratios = [1, 2.76, 5.4, 8.93];
  const levels = [1, 0.45, 0.2, 0.08];
  const dur = 2.4;
  ratios.forEach((r, i) => {
    const f = vary(rng, freq * r, 0.002);
    chain(tone(ctx, t, dur, f), envelope(ctx, t, level * levels[i]!, 0.004, dur / (1 + i * 0.8)), out);
  });
  return dur;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export const click: Voice = (ctx, out, t, rng) => {
  chain(noise(ctx, t, 0.02, rng), filter(ctx, 'bandpass', vary(rng, 3600, 0.08), 2.5), envelope(ctx, t, 0.16, 0.001, 0.012), out);
  chain(tone(ctx, t, 0.04, vary(rng, 1900, 0.03), 1500, 0.03), envelope(ctx, t, 0.05, 0.001, 0.03), out);
  return 0.05;
};

export const hover: Voice = (ctx, out, t, rng) => {
  chain(tone(ctx, t, 0.03, vary(rng, 2900, 0.04)), envelope(ctx, t, 0.018, 0.002, 0.018), out);
  return 0.03;
};

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

/** A card flicked off the deck: a short whoosh, then a crisp landing on felt. */
export const deal: Voice = (ctx, out, t, rng) => {
  const p = pan(ctx, between(rng, -0.35, 0.35));
  p.connect(out);
  const whoosh = filter(ctx, 'bandpass', 900, 0.9);
  whoosh.frequency.setValueAtTime(vary(rng, 700, 0.1), t);
  whoosh.frequency.exponentialRampToValueAtTime(vary(rng, 3200, 0.1), t + 0.06);
  chain(noise(ctx, t, 0.08, rng), whoosh, envelope(ctx, t, 0.07, 0.03, 0.04), p);
  const land = t + vary(rng, 0.065, 0.12);
  chain(noise(ctx, land, 0.05, rng), filter(ctx, 'bandpass', vary(rng, 3000, 0.15), 1.1), envelope(ctx, land, 0.42, 0.001, 0.035), p);
  chain(noise(ctx, land, 0.05, rng, 'pink'), filter(ctx, 'lowpass', 650), envelope(ctx, land, 0.3, 0.001, 0.03), p);
  return 0.13;
};

/** A card turned face up: a lift and a soft slap, gentler than the deal. */
export const flip: Voice = (ctx, out, t, rng) => {
  const lift = filter(ctx, 'bandpass', vary(rng, 1600, 0.1), 0.8);
  chain(noise(ctx, t, 0.05, rng), lift, envelope(ctx, t, 0.08, 0.008, 0.03), out);
  const slap = t + vary(rng, 0.045, 0.15);
  chain(noise(ctx, slap, 0.05, rng), filter(ctx, 'lowpass', vary(rng, 2200, 0.1)), envelope(ctx, slap, 0.26, 0.001, 0.04), out);
  return 0.11;
};

/** Lacquered tokens clacking together: the sake cups at kanpai. */
export const chip: Voice = (ctx, out, t, rng) => {
  // Modal synthesis: a small lacquered disc rings at a few inharmonic modes
  // for a few dozen milliseconds, struck by a tiny click.
  const clack = (at: number, level: number, tune: number) => {
    const p = pan(ctx, between(rng, -0.3, 0.3));
    p.connect(out);
    for (const [f, l, d] of [[1720, 1, 0.05], [2890, 0.6, 0.035], [4150, 0.3, 0.022]] as const) {
      chain(tone(ctx, at, d + 0.02, vary(rng, f * tune, 0.01)), envelope(ctx, at, level * l, 0.0006, d), p);
    }
    chain(noise(ctx, at, 0.015, rng), filter(ctx, 'bandpass', 3200 * tune, 1.2), envelope(ctx, at, level * 0.5, 0.0004, 0.006), p);
  };
  const tune = vary(rng, 1, 0.05);
  clack(t, vary(rng, 0.26, 0.1), tune);
  clack(t + between(rng, 0.045, 0.075), vary(rng, 0.16, 0.15), tune * cents(between(rng, -60, 60)));
  if (rng() < 0.4) clack(t + between(rng, 0.11, 0.15), vary(rng, 0.08, 0.2), tune * cents(between(rng, -90, 90)));
  return 0.2;
};

/** The hanko coming down on the call: weight, wood, and a breath of paper. */
export const stamp: Voice = (ctx, out, t, rng) => stampAt(ctx, out, t, rng, 1);

/** Someone else at the table sealing their call: the same stamp, further off. */
export const stampFar: Voice = (ctx, out, t, rng) => {
  const seat = pan(ctx, between(rng, -0.6, 0.6));
  chain(seat, filter(ctx, 'lowpass', 1400), out);
  return stampAt(ctx, seat, t, rng, 0.35);
};

function stampAt(ctx: BaseAudioContext, out: AudioNode, t: number, rng: Rng, weight: number): number {
  const level = weight * vary(rng, 1, 0.05);
  chain(tone(ctx, t, 0.4, vary(rng, 120, 0.05), 46, 0.09), envelope(ctx, t, 0.6 * level, 0.002, 0.32), out);
  chain(noise(ctx, t, 0.12, rng, 'brown'), filter(ctx, 'lowpass', 420), envelope(ctx, t, 0.8 * level, 0.001, 0.09), out);
  chain(noise(ctx, t, 0.03, rng), filter(ctx, 'bandpass', vary(rng, 1300, 0.1), 1.2), envelope(ctx, t, 0.22 * level, 0.0008, 0.022), out);
  chain(noise(ctx, t, 0.08, rng), filter(ctx, 'highpass', 2600), envelope(ctx, t + 0.004, 0.06 * level, 0.002, 0.06), out);
  // Lifting the seal off the paper.
  const peel = t + vary(rng, 0.2, 0.1);
  chain(noise(ctx, peel, 0.1, rng), filter(ctx, 'bandpass', 3800, 0.8), envelope(ctx, peel, 0.025 * level, 0.02, 0.06), out);
  return 0.42;
}

/** A nod: a soft knuckle on the lacquer and one low koto harmonic. Quiet, private. */
export const nod: Voice = (ctx, out, t, rng) => {
  chain(noise(ctx, t, 0.05, rng, 'brown'), filter(ctx, 'lowpass', 520), envelope(ctx, t, 0.5, 0.001, 0.05), out);
  chain(tone(ctx, t, 0.12, vary(rng, 210, 0.04), 150, 0.05), envelope(ctx, t, 0.18, 0.002, 0.09), out);
  pluck(ctx, out, t + 0.03, { freq: degree(5) * 2, kind: 'koto', level: 0.14, decay: 1.1, pan: between(rng, -0.2, 0.2) }, rng);
  return 1.15;
};

/** Locking In: the hanko lands with a warm string under it. */
export const lockIn: Voice = (ctx, out, t, rng) => {
  stampAt(ctx, out, t, rng, 1);
  pluck(ctx, out, t + 0.02, { freq: degree(3), kind: 'koto', level: 0.2, decay: 1.4 }, rng);
  return 1.4;
};

/** Locking Out: a lighter stamp and a low, settling note. */
export const lockOut: Voice = (ctx, out, t, rng) => {
  stampAt(ctx, out, t, rng, 0.7);
  pluck(ctx, out, t + 0.03, { freq: degree(-2), kind: 'koto', level: 0.16, decay: 1.2 }, rng);
  return 1.2;
};

/** A wood block for the last five seconds of a call. */
export const tick: Voice = (ctx, out, t, rng) => {
  const f = vary(rng, 1180, 0.025);
  chain(tone(ctx, t, 0.08, f * 1.04, f, 0.006, 'triangle'), filter(ctx, 'bandpass', f, 6), gain(ctx, 3), envelope(ctx, t, 0.1, 0.001, 0.055), out);
  chain(noise(ctx, t, 0.01, rng), filter(ctx, 'bandpass', f * 2.3, 3), envelope(ctx, t, 0.06, 0.0005, 0.008), out);
  return 0.07;
};

// ---------------------------------------------------------------------------
// Music
// ---------------------------------------------------------------------------

/** The showdown: a taiko roll that gathers into one big hit and a shamisen answer. */
export const reveal: Voice = (ctx, out, t, rng) => {
  const strikes = 11;
  let at = t;
  for (let i = 0; i < strikes; i++) {
    const k = i / (strikes - 1);
    taiko(ctx, out, at, 0.12 + 0.32 * k * k, rng);
    at += vary(rng, 0.13 - 0.07 * k, 0.08);
  }
  const hit = at + 0.06;
  taiko(ctx, out, hit, 1, rng);
  pluck(ctx, out, hit + 0.01, { freq: degree(0), kind: 'shamisen', level: 0.5, decay: 1.2, pan: -0.2 }, rng);
  pluck(ctx, out, hit + 0.02, { freq: degree(3), kind: 'shamisen', level: 0.35, decay: 1.2, pan: 0.2 }, rng);
  return hit - t + 1.2;
};

/** The nods turn over: one soft rin per nod, rising, then a breath. */
export const nodReveal: Voice = (ctx, out, t, rng) => {
  const run = [2, 4, 5];
  let at = t;
  run.forEach((d, i) => {
    chime(ctx, out, at, degree(d + 7), 0.05 - i * 0.008, rng);
    at += vary(rng, 0.12, 0.08);
  });
  return at - t + 2.4;
};

/** Your own cards, at last: a quick upward shimmer, brighter for a big hand. */
export const ownReveal: Voice = (ctx, out, t, rng) => {
  flip(ctx, out, t, rng);
  flip(ctx, out, t + 0.22, rng);
  const run = [0, 3, 5, 7, 10];
  let at = t + 0.3;
  run.forEach((d, i) => {
    pluck(ctx, out, at, { freq: degree(d + 5), kind: 'koto', level: 0.22 - i * 0.02, decay: 1.6, pan: -0.3 + i * 0.15 }, rng);
    at += vary(rng, 0.05, 0.1);
  });
  chime(ctx, out, at + 0.05, degree(15), 0.05, rng);
  return at - t + 2.4;
};

/** The crew takes the hand: a warm koto run upward and a chime. */
export const win: Voice = (ctx, out, t, rng) => {
  const run = [0, 2, 3, 5, 7];
  let at = t;
  run.forEach((d, i) => {
    pluck(ctx, out, at, { freq: degree(d), kind: 'koto', level: 0.36, decay: 2 + i * 0.15, pan: -0.3 + i * 0.15 }, rng);
    at += vary(rng, 0.09, 0.08);
  });
  chime(ctx, out, at + 0.02, degree(10), 0.07, rng);
  return at - t + 2.4;
};

/** The House takes it: a low, sour pluck and a neon sign stuttering outside. */
export const lose: Voice = (ctx, out, t, rng) => {
  pluck(ctx, out, t, { freq: degree(-5), kind: 'koto', level: 0.5, decay: 2 }, rng);
  pluck(ctx, out, t + 0.012, { freq: degree(-5) * cents(between(rng, 22, 32)), kind: 'koto', level: 0.35, decay: 1.8 }, rng);
  pluck(ctx, out, t + 0.16, { freq: degree(-4), kind: 'koto', level: 0.22, decay: 1.6 }, rng);
  neon(ctx, out, t + 0.05, 1.1, 0.03, rng);
  return 2.1;
};

/** A tie or a walk: two strings left hanging, unresolved. */
export const tie: Voice = (ctx, out, t, rng) => {
  pluck(ctx, out, t, { freq: degree(2), kind: 'koto', level: 0.3, decay: 1.8, pan: -0.2 }, rng);
  pluck(ctx, out, t + vary(rng, 0.14, 0.1), { freq: degree(3), kind: 'koto', level: 0.26, decay: 1.8, pan: 0.2 }, rng);
  return 2;
};

/** A fluorescent tube buzzing at twice Tokyo's 50 Hz mains, flickering. */
function neon(ctx: BaseAudioContext, out: AudioNode, t: number, dur: number, level: number, rng: Rng): void {
  const flicker = ctx.createGain();
  flicker.gain.setValueAtTime(0, t);
  let at = t;
  while (at < t + dur) {
    const on = rng() < 0.7;
    flicker.gain.setTargetAtTime(on ? level * between(rng, 0.6, 1) : 0, at, 0.004);
    at += between(rng, 0.03, 0.12);
  }
  flicker.gain.setTargetAtTime(0, t + dur, 0.02);
  chain(tone(ctx, t, dur + 0.2, 100, 100, dur, 'sawtooth'), filter(ctx, 'bandpass', 1200, 0.7), filter(ctx, 'lowpass', 3000), flicker, out);
}

// ---------------------------------------------------------------------------
// End of the night
// ---------------------------------------------------------------------------

/** The night ends clean: a full hit and the run all the way up. */
export const stingClean: Voice = (ctx, out, t, rng) => {
  taiko(ctx, out, t, 1, rng);
  const run = [0, 2, 3, 5, 6, 7, 8, 10];
  let at = t + 0.18;
  run.forEach((d, i) => {
    pluck(ctx, out, at, { freq: degree(d), kind: 'koto', level: 0.3, decay: 2.2, pan: -0.35 + i * 0.1 }, rng);
    at += vary(rng, 0.085, 0.06);
  });
  chime(ctx, out, at, degree(10), 0.08, rng);
  chime(ctx, out, at + 0.3, degree(13), 0.04, rng);
  return at + 0.3 - t + 2.4;
};

/** A raid: two hard hits, a sour low string, and the sign outside dying. */
export const stingRaid: Voice = (ctx, out, t, rng) => {
  taiko(ctx, out, t, 1, rng);
  taiko(ctx, out, t + 0.22, 0.9, rng);
  pluck(ctx, out, t + 0.24, { freq: degree(-5), kind: 'shamisen', level: 0.45, decay: 1.8 }, rng);
  pluck(ctx, out, t + 0.25, { freq: degree(-4), kind: 'shamisen', level: 0.3, decay: 1.8 }, rng);
  neon(ctx, out, t + 0.3, 1.6, 0.035, rng);
  return 2.3;
};

/** Last orders: the shutters come down at dawn. A slow fall down the scale. */
export const stingDawn: Voice = (ctx, out, t, rng) => {
  const fall = [4, 3, 2, 1, 0];
  let at = t;
  fall.forEach((d, i) => {
    pluck(ctx, out, at, { freq: degree(d), kind: 'koto', level: 0.32 - i * 0.03, decay: 1.8 }, rng);
    at += vary(rng, 0.2 + i * 0.03, 0.06);
  });
  return at - t + 1.8;
};

/** Every one-shot, by name. */
export const VOICES = {
  click,
  hover,
  deal,
  flip,
  chip,
  stamp,
  stampFar,
  nod,
  lockIn,
  lockOut,
  tick,
  reveal,
  nodReveal,
  ownReveal,
  win,
  lose,
  tie,
  stingClean,
  stingRaid,
  stingDawn,
} as const satisfies Record<string, Voice>;

export type VoiceName = keyof typeof VOICES;
