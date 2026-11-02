// Low-level building blocks. Everything takes a BaseAudioContext so the same
// code renders live in the browser and offline in tests and the audio check.

import { type Rng } from './music';

/** A voice draws one sound into `out` starting at `t`, and returns its length in seconds. */
export type Voice = (ctx: BaseAudioContext, out: AudioNode, t: number, rng: Rng) => number;

const SILENT = 0.0001;

// ---------------------------------------------------------------------------
// Pure sample generators (no WebAudio, unit-testable)
// ---------------------------------------------------------------------------

export interface PluckOptions {
  /** Seconds for the note to fall by 60 dB. */
  decay: number;
  /** 0..1: how bright the pick is. Low = soft koto finger, high = shamisen bachi. */
  brightness: number;
  /** 0..0.5: where along the string it is plucked. Shapes the overtones. */
  position: number;
}

/**
 * Karplus-Strong plucked string with first-order allpass fine tuning, so the
 * pitch stays true at high notes where the delay line is short.
 * Returns samples normalized to a peak of 1.
 */
export function karplusStrong(
  sampleRate: number,
  freq: number,
  seconds: number,
  opts: PluckOptions,
  rng: Rng,
): Float32Array {
  const length = Math.max(1, Math.round(seconds * sampleRate));
  const out = new Float32Array(length);
  const period = sampleRate / freq;
  // The two-point average delays half a sample; the allpass covers the rest.
  let n = Math.floor(period - 0.5);
  let frac = period - 0.5 - n;
  if (frac < 0.1) {
    n -= 1;
    frac += 1;
  }
  n = Math.max(2, n);
  const c = (1 - frac) / (1 + frac);

  // Excitation: noise, low-passed by brightness, comb-filtered by pick position.
  const ring = new Float32Array(n);
  const smooth = 1 - Math.min(0.97, Math.max(0, opts.brightness));
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += (1 - smooth) * ((rng() * 2 - 1) - lp);
    ring[i] = lp;
  }
  const pickAt = Math.max(1, Math.round(n * opts.position));
  const excite = Float32Array.from(ring);
  let mean = 0;
  for (let i = 0; i < n; i++) {
    ring[i] = excite[i]! - excite[(i - pickAt + n) % n]!;
    mean += ring[i]!;
  }
  mean /= n;
  for (let i = 0; i < n; i++) ring[i]! -= mean;

  // Loss per round trip so the fundamental takes `decay` seconds to fall 60 dB.
  const loss = 0.001 ** (1 / (freq * Math.max(0.05, opts.decay)));
  let ptr = 0;
  let last = 0;
  let apIn = 0;
  let apOut = 0;
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const s = ring[ptr]!;
    out[i] = s;
    const a = Math.abs(s);
    if (a > peak) peak = a;
    const avg = (s + last) * 0.5 * loss;
    last = s;
    const ap = c * avg + apIn - c * apOut;
    apIn = avg;
    apOut = ap;
    ring[ptr] = ap;
    ptr = ptr + 1 === n ? 0 : ptr + 1;
  }
  if (peak > 0) for (let i = 0; i < length; i++) out[i]! /= peak;
  // Fade the last few milliseconds so a cut-off note never clicks.
  const fade = Math.min(length, Math.round(sampleRate * 0.02));
  for (let i = 0; i < fade; i++) out[length - 1 - i]! *= i / fade;
  return out;
}

export type NoiseColor = 'white' | 'pink' | 'brown';

/** Seconds of noise in the given color, normalized to a peak of 1. */
export function noiseSamples(sampleRate: number, seconds: number, color: NoiseColor, rng: Rng): Float32Array {
  const length = Math.max(1, Math.round(seconds * sampleRate));
  const out = new Float32Array(length);
  // Paul Kellet's economy pink filter; brown is leaky integrated white.
  let b0 = 0, b1 = 0, b2 = 0, brown = 0;
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const w = rng() * 2 - 1;
    let v: number;
    if (color === 'white') v = w;
    else if (color === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      v = b0 + b1 + b2 + w * 0.1848;
    } else {
      brown = (brown + 0.02 * w) * 0.998;
      v = brown;
    }
    out[i] = v;
    if (Math.abs(v) > peak) peak = Math.abs(v);
  }
  if (peak > 0) for (let i = 0; i < length; i++) out[i]! /= peak;
  // Crossfade the ends so the buffer loops without a seam.
  const seam = Math.min(Math.floor(length / 4), Math.round(sampleRate * 0.05));
  for (let i = 0; i < seam; i++) {
    const k = i / seam;
    out[i] = out[i]! * k + out[length - seam + i]! * (1 - k);
  }
  return out.subarray(0, length - seam);
}

// ---------------------------------------------------------------------------
// WebAudio helpers
// ---------------------------------------------------------------------------

export function toBuffer(ctx: BaseAudioContext, samples: Float32Array): AudioBuffer {
  const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buf.getChannelData(0).set(samples);
  return buf;
}

const noiseCache = new WeakMap<BaseAudioContext, Partial<Record<NoiseColor, AudioBuffer>>>();

/** A shared, loopable few seconds of noise per context and color. */
export function noiseBuffer(ctx: BaseAudioContext, color: NoiseColor = 'white'): AudioBuffer {
  let byColor = noiseCache.get(ctx);
  if (!byColor) noiseCache.set(ctx, (byColor = {}));
  let buf = byColor[color];
  if (!buf) {
    // Fixed seed: the noise itself need not vary, only where we read from it.
    let s = 0x893 + color.length;
    const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    buf = byColor[color] = toBuffer(ctx, noiseSamples(ctx.sampleRate, 4, color, rng));
  }
  return buf;
}

/** Noise playing from a random spot for `dur` seconds. */
export function noise(ctx: BaseAudioContext, t: number, dur: number, rng: Rng, color: NoiseColor = 'white'): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, color);
  src.loop = true;
  src.start(t, rng() * src.buffer.duration * 0.9);
  src.stop(t + dur + 0.05);
  return src;
}

/** A gain node shaped as attack-then-exponential-decay. */
export function envelope(ctx: BaseAudioContext, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENT, t);
  g.gain.exponentialRampToValueAtTime(Math.max(SILENT * 2, peak), t + Math.max(0.001, attack));
  g.gain.exponentialRampToValueAtTime(SILENT, t + Math.max(0.001, attack) + decay);
  g.gain.setValueAtTime(0, t + Math.max(0.001, attack) + decay + 0.001);
  return g;
}

export function filter(
  ctx: BaseAudioContext,
  type: BiquadFilterType,
  frequency: number,
  q = 0.707,
  gain = 0,
): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  f.gain.value = gain;
  return f;
}

export function gain(ctx: BaseAudioContext, value: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

export function pan(ctx: BaseAudioContext, value: number): StereoPannerNode {
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, value));
  return p;
}

/** Connect a chain of nodes in order and return the last one. */
export function chain(...nodes: AudioNode[]): AudioNode {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i]!.connect(nodes[i + 1]!);
  return nodes[nodes.length - 1]!;
}

/** A sine (or other) oscillator with an exponential pitch glide. */
export function tone(
  ctx: BaseAudioContext,
  t: number,
  dur: number,
  from: number,
  to = from,
  glide = dur,
  type: OscillatorType = 'sine',
): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + glide);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}
