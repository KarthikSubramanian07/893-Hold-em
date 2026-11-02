// The room at 3 a.m.: rain on the window, the fridge hum of the bar, the city
// a long way off, and now and then a late train or a gust down the alley.
//
// The beds are continuous nodes. The scattered events (droplets, trains,
// gusts) are scheduled in windows, so live playback can feed them a little
// ahead of time and an offline render can schedule a whole span at once.

import { chain, envelope, filter, gain, noise, pan, tone } from './dsp';
import { type Rng, between, vary } from './music';

export interface AmbienceOptions {
  /** Seconds to fade in. */
  fadeIn?: number;
  /** Guarantee a train and a gust early on (the audio check uses this). */
  eventful?: boolean;
}

export interface Ambience {
  /** Schedule scattered sounds for the span [from, to) in context time. */
  schedule(from: number, to: number): void;
  /** Fade out over `fade` seconds and release every node. */
  stop(fade?: number): void;
}

export function startAmbience(ctx: BaseAudioContext, out: AudioNode, rng: Rng, opts: AmbienceOptions = {}): Ambience {
  const t0 = ctx.currentTime;
  const fadeIn = opts.fadeIn ?? 2.5;
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0, t0);
  bus.gain.linearRampToValueAtTime(1, t0 + fadeIn);
  bus.connect(out);

  const sources: AudioScheduledSourceNode[] = [];
  const forever = 60 * 60 * 24;
  const bed = (color: 'white' | 'pink' | 'brown') => {
    const n = noise(ctx, t0, forever, rng, color);
    sources.push(n);
    return n;
  };
  const lfo = (rate: number, depth: number, target: AudioParam) => {
    const o = tone(ctx, t0, forever, rate);
    sources.push(o);
    const amount = gain(ctx, depth);
    o.connect(amount);
    amount.connect(target);
  };

  // Rain on glass: a fine hiss, and a heavier wash that slowly swells and eases.
  const hiss = gain(ctx, 0.05);
  chain(bed('white'), filter(ctx, 'highpass', 1800), filter(ctx, 'lowpass', 7000), hiss, bus);
  lfo(0.031, 0.012, hiss.gain);
  const wash = gain(ctx, 0.07);
  chain(bed('pink'), filter(ctx, 'bandpass', 800, 0.45), filter(ctx, 'lowpass', 2400), wash, bus);
  lfo(0.047, 0.025, wash.gain);

  // Room tone: the low air of a small bar.
  chain(bed('brown'), filter(ctx, 'lowpass', 160), gain(ctx, 0.11), bus);

  // The city: traffic murmur and the 50 Hz mains every building in Tokyo hums at.
  const traffic = gain(ctx, 0.05);
  chain(bed('brown'), filter(ctx, 'bandpass', 220, 0.6), traffic, bus);
  lfo(0.019, 0.02, traffic.gain);
  for (const [f, level] of [[50, 0.006], [100, 0.004], [150, 0.0015]] as const) {
    const o = tone(ctx, t0, forever, f);
    sources.push(o);
    chain(o, gain(ctx, level), bus);
  }

  // ---- scattered events ----------------------------------------------------

  let nextTrain = t0 + (opts.eventful ? 1.5 : between(rng, 25, 70));
  let nextGust = t0 + (opts.eventful ? 6 : between(rng, 12, 40));

  const droplet = (t: number) => {
    const p = pan(ctx, between(rng, -0.8, 0.8));
    p.connect(bus);
    const f = between(rng, 1800, 4800);
    const level = between(rng, 0.004, 0.022);
    chain(tone(ctx, t, 0.03, f, f * 0.62, 0.02), envelope(ctx, t, level, 0.0008, between(rng, 0.008, 0.02)), p);
    chain(noise(ctx, t, 0.01, rng), filter(ctx, 'highpass', 3000), envelope(ctx, t, level * 0.6, 0.0005, 0.005), p);
  };

  const train = (t: number) => {
    const dur = between(rng, 9, 13);
    const rumble = ctx.createGain();
    rumble.gain.setValueAtTime(0, t);
    rumble.gain.linearRampToValueAtTime(0.09, t + dur * 0.45);
    rumble.gain.linearRampToValueAtTime(0, t + dur);
    chain(noise(ctx, t, dur, rng, 'brown'), filter(ctx, 'lowpass', 300), rumble, bus);
    // Wheels over rail joints: ta-tan, ta-tan, far away.
    const clatter = filter(ctx, 'lowpass', 380);
    clatter.connect(bus);
    let at = t + 0.8;
    const gap = vary(rng, 0.75, 0.08);
    while (at < t + dur - 0.8) {
      const swell = Math.sin(Math.PI * ((at - t) / dur));
      for (const off of [0, 0.13]) {
        chain(noise(ctx, at + off, 0.06, rng, 'brown'), envelope(ctx, at + off, 0.08 * swell, 0.004, 0.05), clatter);
      }
      at += gap;
    }
  };

  const gust = (t: number) => {
    const dur = between(rng, 4, 6);
    const howl = filter(ctx, 'bandpass', 300, 1.4);
    howl.frequency.setValueAtTime(between(rng, 260, 340), t);
    howl.frequency.linearRampToValueAtTime(between(rng, 600, 820), t + dur * 0.5);
    howl.frequency.linearRampToValueAtTime(between(rng, 260, 340), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + dur * 0.45);
    g.gain.linearRampToValueAtTime(0, t + dur);
    chain(noise(ctx, t, dur, rng, 'pink'), howl, g, bus);
  };

  return {
    schedule(from, to) {
      // Droplets land a few per second, in little clusters.
      let t = from + between(rng, 0, 0.3);
      while (t < to) {
        droplet(t);
        t += rng() < 0.25 ? between(rng, 0.02, 0.08) : between(rng, 0.12, 0.45);
      }
      while (nextTrain < to) {
        if (nextTrain >= from) train(nextTrain);
        nextTrain += between(rng, 60, 140);
      }
      while (nextGust < to) {
        if (nextGust >= from) gust(nextGust);
        nextGust += between(rng, 20, 55);
      }
    },
    stop(fade = 1.5) {
      const t = ctx.currentTime;
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(bus.gain.value, t);
      bus.gain.linearRampToValueAtTime(0, t + fade);
      for (const s of sources) s.stop(t + fade + 0.05);
      setTimeout(() => bus.disconnect(), (fade + 0.2) * 1000);
    },
  };
}
