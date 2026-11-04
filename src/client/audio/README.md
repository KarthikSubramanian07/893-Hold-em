# Sound

A quiet bar at 3 a.m., not a casino. Every sound is synthesized at runtime with
WebAudio, and there are no sample files.

```
 game views ──► soundsFor(prev, next, you) ──► [{ sound, delay }] ──► useGameSounds schedules them
                         (pure, tested)                                         │
                                                                                 ▼
  voices.ts ── one-shots ──► sfx bus ──┐                                    sfx.play(name)
  ambience.ts ── the room ─► amb bus ──┴─► level (mute) ─► glue comp ─► limiter ─► out
```

| File | What lives there |
| --- | --- |
| `index.ts` | The public `sfx` engine (unlock, mute persisted as `893:muted`, ambience feeder) and the `useGameSounds` hook. |
| `cues.ts` | `soundsFor()`: diffs two `GameView`s into timed cues. Pure and unit tested. |
| `voices.ts` | Every one-shot sound. Each is `(ctx, out, t, rng) => seconds`, so it renders live or offline. |
| `ambience.ts` | Rain on glass, room tone, 50 Hz city hum, droplets, the odd far-off train and gust. |
| `master.ts` | Buses, a gentle glue compressor, and a fast limiter. |
| `dsp.ts` | Karplus-Strong strings with allpass tuning, coloured noise, envelopes, and node helpers. |
| `music.ts` | The miyako-bushi scale (D, E♭, G, A, B♭) and a seedable random source. |
| `lab.html` | The sound lab: audition each voice, the room, and a scripted hand. |

## The palette

- **Strings.** Karplus-Strong plucks tuned to miyako-bushi. The shamisen is bright,
  with a bachi snap, and plays the showdown answer. The koto is
  round and long, and plays wins, ties, and losses.
- **Table.** The card flick and the softer flip, a knuckle on the lacquer for a
  nod, the hanko thunk when you lock In (lighter for Out), a muffled, panned
  stamp for everyone else deciding, and a wood-block tick for the last five seconds.
- **Nods and the reveal.** A rising run of rin chimes when the nods turn over,
  and an upward koto shimmer when your own cards finally flip at the showdown.
- **Taiko.** A roll that gathers into one big hit at the showdown.
- **Endings.** A koto run and a rin chime for a win. A sour, detuned low pluck and a
  neon tube stuttering at 100 Hz for a loss. Three stings close the night: clean,
  raid, and dawn (last orders).

Each play nudges pitch, timing, level, and pan a little, so repeats never sound
canned.

## Rules

- Nothing makes a sound, and no `AudioContext` exists, until `sfx.unlock()` runs
  inside a user gesture.
- Joining mid-hand is quiet. Only the nod or call countdown is picked up.
- Busy updates are capped and staggered: at most 8 deals, 5 flips (3 at the
  showdown), and 3 distant stamps.

## Checking it without ears

```sh
npm test                                  # soundsFor, string tuning, noise, scale, mute and unlock
node scripts/audio-check.mjs              # render every voice offline in headless Chromium
node scripts/audio-check.mjs --wav out/   # ...and write each render as a .wav to listen to
```

The audio check renders each voice through the real master chain with three
seeds. It fails on non-finite samples, a peak above 0.99, a sound that is silent
or harsh, a length that doesn't match what the voice declares, or two seeds that
sound the same. It also renders 16 seconds of the room to check that it fades in
and stays steady, then plays a scripted hand through `useGameSounds` with the
live engine.

For a listen in the browser, run `npm run dev:web` and open `/src/client/audio/lab.html`.
