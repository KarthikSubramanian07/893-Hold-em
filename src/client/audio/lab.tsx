// The sound lab: a dev page to audition every voice live, and an offline
// renderer the audio check drives headlessly. Open it at
// /src/client/audio/lab.html under `npm run dev:web`.

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { GameView } from '../../engine/types';
import { FIXTURES } from '../dev/fixtures';
import { startAmbience } from './ambience';
import { sfx, useGameSounds } from './index';
import { buildMaster } from './master';
import { seeded } from './music';
import { VOICES, type VoiceName } from './voices';

const SAMPLE_RATE = 48_000;
/** Silence before each voice starts, so the attack is never clipped by the render. */
const LEAD = 0.05;
/** Below this a sample counts as silence (about -66 dBFS). */
const FLOOR = 10 ** (-66 / 20);

export interface RenderStats {
  name: string;
  seed: number;
  /** The length the voice says it has, in seconds. */
  declared: number;
  sampleRate: number;
  nonFinite: number;
  peak: number;
  /** RMS over the audible part, in dBFS. */
  rmsDb: number;
  /** Loudest 50 ms window, in dBFS. */
  maxWindowDb: number;
  /** Seconds from the start until the sound falls under the floor for good. */
  audible: number;
  /** Peak over the last half second of the render: should be silence. */
  tailPeak: number;
  dc: number;
  /** RMS of the first difference over RMS: a cheap high-frequency share. */
  brightness: number;
  /** 1-second RMS levels in dBFS (ambience only). */
  seconds?: number[];
  wav?: string;
}

const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

function analyse(name: string, seed: number, declared: number, buf: AudioBuffer, from: number, wav: boolean, perSecond: boolean): RenderStats {
  const sr = buf.sampleRate;
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const n = buf.length;
  const mono = new Float32Array(n);
  let nonFinite = 0;
  let peak = 0;
  let last = 0;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (const ch of chans) {
      const v = ch[i]!;
      if (!Number.isFinite(v)) nonFinite++;
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a > FLOOR) last = i;
      m += v;
    }
    mono[i] = m / chans.length;
  }
  const start = Math.round(from * sr);
  const end = Math.max(start + 1, last + 1);
  let sum = 0, sumD = 0, mean = 0;
  for (let i = start; i < end; i++) {
    const v = mono[i]!;
    sum += v * v;
    mean += v;
    const d = v - (mono[i - 1] ?? 0);
    sumD += d * d;
  }
  const count = end - start;
  const rms = Math.sqrt(sum / count);
  const win = Math.round(sr * 0.05);
  let maxWin = 0;
  for (let i = start; i + win <= Math.max(end, start + win); i += win >> 1) {
    let s = 0;
    for (let j = i; j < i + win && j < n; j++) s += mono[j]! * mono[j]!;
    maxWin = Math.max(maxWin, Math.sqrt(s / win));
  }
  let tailPeak = 0;
  for (let i = Math.max(0, n - Math.round(sr * 0.5)); i < n; i++) {
    for (const ch of chans) tailPeak = Math.max(tailPeak, Math.abs(ch[i]!));
  }
  const stats: RenderStats = {
    name,
    seed,
    declared,
    sampleRate: sr,
    nonFinite,
    peak,
    rmsDb: db(rms),
    maxWindowDb: db(maxWin),
    audible: end / sr - from,
    tailPeak,
    dc: mean / count,
    brightness: rms > 0 ? Math.sqrt(sumD / count) / rms : 0,
  };
  if (perSecond) {
    stats.seconds = [];
    for (let s = 0; (s + 1) * sr <= n; s++) {
      let acc = 0;
      for (let i = s * sr; i < (s + 1) * sr; i++) acc += mono[i]! * mono[i]!;
      stats.seconds.push(Math.round(db(Math.sqrt(acc / sr)) * 10) / 10);
    }
  }
  if (wav) stats.wav = encodeWav(chans, sr);
  return stats;
}

/** Render one voice through the real master chain. */
export async function renderVoice(name: VoiceName, seed = 1, wav = false): Promise<RenderStats> {
  const seconds = 7;
  const ctx = new OfflineAudioContext(2, SAMPLE_RATE * seconds, SAMPLE_RATE);
  const master = buildMaster(ctx);
  const declared = VOICES[name](ctx, master.sfx, LEAD, seeded(seed));
  const buf = await ctx.startRendering();
  return analyse(name, seed, declared, buf, LEAD, wav, false);
}

/** Render a stretch of the room, with a train and a gust guaranteed. */
export async function renderAmbience(seconds = 16, seed = 1, wav = false): Promise<RenderStats> {
  const ctx = new OfflineAudioContext(2, SAMPLE_RATE * seconds, SAMPLE_RATE);
  const master = buildMaster(ctx);
  const room = startAmbience(ctx, master.ambience, seeded(seed), { eventful: true, fadeIn: 2 });
  room.schedule(0, seconds);
  const buf = await ctx.startRendering();
  return analyse('ambience', seed, seconds, buf, 0, wav, true);
}

/** Largest sample difference between two seeds of the same voice, relative to its peak. */
export async function variation(name: VoiceName, a = 1, b = 2): Promise<number> {
  const render = async (seed: number) => {
    const ctx = new OfflineAudioContext(1, SAMPLE_RATE * 4, SAMPLE_RATE);
    VOICES[name](ctx, ctx.destination, LEAD, seeded(seed));
    return (await ctx.startRendering()).getChannelData(0);
  };
  const [x, y] = await Promise.all([render(a), render(b)]);
  let diff = 0;
  let peak = 0;
  for (let i = 0; i < x.length; i++) {
    diff = Math.max(diff, Math.abs(x[i]! - y[i]!));
    peak = Math.max(peak, Math.abs(x[i]!));
  }
  return peak > 0 ? diff / peak : 0;
}

function encodeWav(chans: Float32Array[], sr: number): string {
  const frames = chans[0]!.length;
  const bytes = new DataView(new ArrayBuffer(44 + frames * chans.length * 2));
  const str = (o: number, s: string) => [...s].forEach((ch, i) => bytes.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  bytes.setUint32(4, 36 + frames * chans.length * 2, true);
  str(8, 'WAVEfmt ');
  bytes.setUint32(16, 16, true);
  bytes.setUint16(20, 1, true);
  bytes.setUint16(22, chans.length, true);
  bytes.setUint32(24, sr, true);
  bytes.setUint32(28, sr * chans.length * 2, true);
  bytes.setUint16(32, chans.length * 2, true);
  bytes.setUint16(34, 16, true);
  str(36, 'data');
  bytes.setUint32(40, frames * chans.length * 2, true);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (const ch of chans) {
      bytes.setInt16(o, Math.max(-1, Math.min(1, ch[i]!)) * 0x7fff, true);
      o += 2;
    }
  }
  let bin = '';
  const u8 = new Uint8Array(bytes.buffer);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}

declare global {
  interface Window {
    __audioLab?: {
      names: VoiceName[];
      renderVoice: typeof renderVoice;
      renderAmbience: typeof renderAmbience;
      variation: typeof variation;
      /** Every voice the live engine has played, in order. */
      played: string[];
      demoSteps: number;
      sfx: typeof sfx;
    };
  }
}

const played: string[] = [];
const play = sfx.play;
sfx.play = (name) => {
  played.push(name);
  play(name);
};

window.__audioLab = { names: Object.keys(VOICES) as VoiceName[], renderVoice, renderAmbience, variation, played, demoSteps: 0, sfx };

// ---- a hand, played through the real hook ------------------------------------------

/** The fixtures as one hand, rebased to now so the countdown ticks. */
function demoHand(): { view: GameView; hold: number }[] {
  const now = Date.now();
  const lockOne = (v: GameView, id: string): GameView => ({ ...v, seats: v.seats.map((s) => (s.id === id ? { ...s, locked: true } : s)) });
  const pre = { ...FIXTURES.preflop!, hand: 1, rule: 'oni' as const, seats: FIXTURES.preflop!.seats.map((s) => ({ ...s, locked: false })) };
  const at = (v: GameView, offset: number, deadline: number | null): GameView => ({ ...v, now: now + offset, deadline: deadline === null ? null : now + deadline });
  const river = FIXTURES.river!;
  return [
    { view: at(FIXTURES.lobby!, 0, null), hold: 600 },
    { view: at(pre, 600, 6_400), hold: 1_200 },
    { view: at(lockOne(pre, 's1'), 1_800, 6_400), hold: 900 },
    { view: at(lockOne(lockOne(pre, 's1'), 's0'), 2_700, 6_400), hold: 4_300 },
    // Same hand number throughout, so the river reads as the hand moving on, not a new deal.
    { view: at({ ...river, hand: 1, rule: 'kagami', seats: river.seats.map((s) => ({ ...s, locked: false })) }, 7_000, 11_500), hold: 4_800 },
    { view: at({ ...FIXTURES.showdown!, hand: 1 }, 11_800, null), hold: 3_200 },
    { view: at(FIXTURES.over!, 15_000, null), hold: 0 },
  ];
}

function Demo() {
  const [view, setView] = useState<GameView | null>(null);
  const [running, setRunning] = useState(false);
  useGameSounds(view);
  useEffect(() => {
    if (!running) return;
    const steps = demoHand();
    const timers: ReturnType<typeof setTimeout>[] = [];
    let at = 0;
    steps.forEach(({ view: v, hold }, i) => {
      timers.push(
        setTimeout(() => {
          setView(v);
          window.__audioLab!.demoSteps = i + 1;
          if (i === steps.length - 1) setRunning(false);
        }, at),
      );
      at += hold;
    });
    return () => timers.forEach(clearTimeout);
  }, [running]);
  return (
    <button
      id="play-hand"
      aria-pressed={running}
      onClick={() => {
        sfx.unlock();
        setView(null);
        setRunning(true);
      }}
    >
      play a hand
    </button>
  );
}

const demo = document.getElementById('demo');
if (demo) createRoot(demo).render(<Demo />);

// ---- live audition ------------------------------------------------------------

const grid = document.getElementById('voices');
for (const name of Object.keys(VOICES) as VoiceName[]) {
  const b = document.createElement('button');
  b.textContent = name;
  b.addEventListener('click', () => {
    sfx.unlock();
    sfx.play(name);
  });
  b.addEventListener('pointerenter', () => sfx.hover());
  grid?.append(b);
}

const amb = document.getElementById('ambience');
amb?.addEventListener('click', () => {
  sfx.unlock();
  const on = amb.getAttribute('aria-pressed') !== 'true';
  amb.setAttribute('aria-pressed', String(on));
  sfx.ambience(on);
});

const mute = document.getElementById('mute');
mute?.setAttribute('aria-pressed', String(sfx.muted()));
mute?.addEventListener('click', () => {
  sfx.unlock();
  sfx.setMuted(!sfx.muted());
  mute.setAttribute('aria-pressed', String(sfx.muted()));
});
