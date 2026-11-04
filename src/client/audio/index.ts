// The sound of 893 Hold'em. All of it is synthesized at runtime with WebAudio:
// no sample files. Nothing plays until `unlock()` is called from a user
// gesture, and the mute choice survives reloads.
//
//   voices.ts    one-shot sounds (cards, nods, hanko, strings, taiko)
//   ambience.ts  the room: rain, hum, the city, the odd train
//   master.ts    buses, glue compressor, limiter
//   cues.ts      soundsFor(): which sounds a change in the GameView makes
//   dsp.ts       Karplus-Strong, noise, envelopes, small node helpers
//   music.ts     the miyako-bushi scale and seedable randomness

import { useEffect, useRef } from 'react';
import type { GameView, Verdict } from '../../engine/types';
import { type Ambience, startAmbience } from './ambience';
import { type SoundCue, type SoundName, soundsFor } from './cues';
import { type Master, buildMaster } from './master';
import { VOICES, type VoiceName } from './voices';

export { soundsFor, deadlineChanged, TIMING } from './cues';
export type { SoundCue, SoundName } from './cues';
export { VOICES } from './voices';
export type { VoiceName } from './voices';

export interface Sfx {
  /** Call from a user gesture; browsers keep audio locked until then. */
  unlock(): void;
  setMuted(muted: boolean): void;
  muted(): boolean;
  ambience(on: boolean): void;
  click(): void;
  hover(): void;
  deal(): void;
  flip(): void;
  chip(): void;
  stamp(): void;
  reveal(): void;
  win(): void;
  lose(): void;
  tick(): void;
  /** Another seat deciding: a distant, muffled stamp. */
  stampFar(): void;
  /** A tied or walked hand. */
  tie(): void;
  /** The end-of-night sting for a verdict. */
  sting(verdict: Verdict): void;
  /** Play any voice by name. */
  play(name: VoiceName): void;
  /** True once `unlock()` has created an audio context. */
  unlocked(): boolean;
  /** `'locked'` before `unlock()`, then the audio context's state. */
  state(): AudioContextState | 'locked';
}

export const MUTE_KEY = '893:muted';

/** Re-triggers of the same sound closer than this are dropped. */
const MIN_GAP: Partial<Record<VoiceName, number>> = { hover: 0.06, click: 0.03, tick: 0.3 };
const DEFAULT_GAP = 0.012;

function readMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    globalThis.localStorage?.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Private mode or storage disabled: the choice just won't persist.
  }
}

function createSfx(): Sfx {
  let ctx: AudioContext | null = null;
  let master: Master | null = null;
  let isMuted = readMuted();
  let wantAmbience = false;
  let room: Ambience | null = null;
  let feeder: ReturnType<typeof setInterval> | null = null;
  let fedUntil = 0;
  const lastPlayed = new Map<VoiceName, number>();
  const rng = Math.random;

  const startRoom = () => {
    if (!ctx || !master || room || isMuted) return;
    room = startAmbience(ctx, master.ambience, rng);
    fedUntil = ctx.currentTime;
    const feed = () => {
      if (!ctx || !room) return;
      // Skip any span missed while the tab was throttled, rather than bursting.
      const from = Math.max(fedUntil, ctx.currentTime);
      const to = ctx.currentTime + 1.2;
      if (to > from) room.schedule(from, to);
      fedUntil = Math.max(fedUntil, to);
    };
    feed();
    feeder = setInterval(feed, 400);
  };

  const stopRoom = (fade = 1.5) => {
    if (feeder) clearInterval(feeder);
    feeder = null;
    room?.stop(fade);
    room = null;
  };

  /** Resume from 'suspended' or Safari's 'interrupted'; a refusal just means we stay quiet. */
  const wake = () => {
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
  };

  const play = (name: VoiceName) => {
    if (!ctx || !master || isMuted || ctx.state === 'closed') return;
    wake();
    const now = ctx.currentTime;
    const last = lastPlayed.get(name);
    if (last !== undefined && now - last < (MIN_GAP[name] ?? DEFAULT_GAP)) return;
    lastPlayed.set(name, now);
    VOICES[name](ctx, master.sfx, now + 0.005, rng);
  };

  return {
    unlock() {
      if (typeof window === 'undefined') return;
      if (!ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor({ latencyHint: 'interactive' });
        master = buildMaster(ctx);
        master.level.gain.value = isMuted ? 0 : 1;
      }
      if (!isMuted) wake();
      if (wantAmbience) startRoom();
    },
    setMuted(muted) {
      isMuted = muted;
      writeMuted(muted);
      if (!ctx || !master) return;
      const now = ctx.currentTime;
      const level = master.level.gain;
      level.cancelScheduledValues(now);
      level.setValueAtTime(level.value, now);
      level.linearRampToValueAtTime(muted ? 0 : 1, now + 0.15);
      if (muted) {
        stopRoom(0.15);
        const c = ctx;
        setTimeout(() => {
          if (isMuted && c.state === 'running') c.suspend().catch(() => {});
        }, 250);
      } else {
        wake();
        if (wantAmbience) startRoom();
      }
    },
    muted: () => isMuted,
    unlocked: () => !!ctx && ctx.state !== 'closed',
    state: () => ctx?.state ?? 'locked',
    ambience(on) {
      wantAmbience = on;
      if (on) startRoom();
      else stopRoom();
    },
    play,
    click: () => play('click'),
    hover: () => play('hover'),
    deal: () => play('deal'),
    flip: () => play('flip'),
    chip: () => play('chip'),
    stamp: () => play('stamp'),
    reveal: () => play('reveal'),
    win: () => play('win'),
    lose: () => play('lose'),
    tick: () => play('tick'),
    stampFar: () => play('stampFar'),
    tie: () => play('tie'),
    sting: (verdict) => play(verdict === 'clean' ? 'stingClean' : verdict === 'raid' ? 'stingRaid' : 'stingDawn'),
  };
}

export const sfx: Sfx = createSfx();

/** Diff consecutive views and play the right sounds. */
export function useGameSounds(view: GameView | null): void {
  const prev = useRef<GameView | null>(null);
  const ticks = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const pending = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const last = prev.current;
    prev.current = view;
    const clearTicks = () => {
      for (const id of ticks.current) clearTimeout(id);
      ticks.current.clear();
    };
    if (!view) {
      clearTicks();
      return;
    }
    if ((view.phase !== 'nod' && view.phase !== 'call') || last?.deadline !== view.deadline) clearTicks();

    for (const cue of soundsFor(last, view, view.you)) schedule(cue);

    function schedule(cue: SoundCue) {
      const bucket = cue.sound === 'tick' ? ticks.current : pending.current;
      if (cue.delay <= 0) return void playCue(cue.sound);
      const id = setTimeout(() => {
        bucket.delete(id);
        playCue(cue.sound);
      }, cue.delay);
      bucket.add(id);
    }
  }, [view]);

  useEffect(() => {
    const t = ticks.current;
    const p = pending.current;
    return () => {
      for (const id of t) clearTimeout(id);
      for (const id of p) clearTimeout(id);
      t.clear();
      p.clear();
      // Forget the last view, so a remount (or StrictMode's double mount)
      // picks the countdown back up instead of assuming nothing changed.
      prev.current = null;
    };
  }, []);
}

function playCue(name: SoundName): void {
  sfx.play(name);
}
