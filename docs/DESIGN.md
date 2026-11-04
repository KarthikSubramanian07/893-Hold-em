# 893 Hold'em — design

> 8-9-3, read *ya-ku-za*: the worst hand in an old Japanese card game, and the
> name the yakuza took for themselves. Everybody at this table starts with a
> bad hand. The point is to play it together.

This is the canonical spec. Code, copy, and art all answer to it.

---

## 1. The pitch

A co-op poker heist for 2 to 6 people. The crew sits on one side of a lacquer
table in a back-alley bar in Shinjuku. The House sits across, in a mask.
You can see every teammate's cards but never your own, and nobody may talk.
All you get is **one nod a hand**, and the nods that come back to you.

One link, no accounts. Open a table, send the link, play in a minute.

## 2. Rules

### In four lines

1. **Everyone sees every hand but their own.** The House shows one card. It holds 3
   cards at Shitamachi, 4 at Kabukichō, 5 at Oyabun, and plays its best five with
   the board.
2. **After the flop, each player may nod at one teammate**: "you're good". One nod
   each per hand, or pass.
3. **After the river, everyone picks In or Out at once.**
4. **The best hand that's In faces the House.** Win: the marker moves one step
   toward the door per player In. Lose: one step toward the sirens per player In.
   Tie: no move. Everyone Out: no move, but the clock runs.

Reach the door = clean getaway. Reach the sirens = raid. After 10 hands
("last orders") the night ends as **dawn**.

### Seats

- **The crew** is 2 to 6 seats, humans or bot regulars who fill empty chairs.
- **The House** is one masked figure: Okame at Shitamachi, Kitsune at Kabukichō,
  the Okina at Oyabun. Its cards (`HOUSE_CARDS`: 3, 4, 5) are dealt face down
  except the first (`HOUSE_UP = 1`).

### A hand

Phases: `lobby` → `nod` → `call` → `showdown` → next hand (or `over`).

1. **The deal.** Each player gets 2 hole cards, facing out: everyone sees their
   teammates' cards; your own are `'back'` in your view until the showdown.
   Spectators see no hole cards at all. The flop (3 board cards) is face up.
2. **`nod`.** Each player sends `{ t: 'nod', at: seatId }` or `{ t: 'nod', at: null }`
   to pass. One per hand. Nods stay hidden from others until everyone has nodded;
   your own is always visible to you.
3. **`call`.** The turn and the river turn together (all 5 board cards). Each
   player sends `{ t: 'call', stance: 'in' | 'out' }`. Stances stay hidden until the
   showdown.
4. **`showdown`.** Every card flips, including your own, for the first time. The
   best hand among the players In faces the House's best five (its cards plus the
   board). `result.moved` is +1 per player In on a win, −1 per player In on a loss,
   0 on a tie, −1 if everyone was Out. `result.couldHave` lists every seat (In or
   Out) whose hand beat the House.

The tension is the nod, and the trade. A nod says "I can see your hand, and it
looks strong." Going In adds a step either way; sitting out a winner leaves steps on
the table.

### The track

One marker starts at 0. The door sits at `door`, the sirens at `-sirens`; both depend
on the table **and** the crew size, because every player In moves the marker. They
live in `BALANCE` in `crates/engine/src/rules.rs` (mirrored in `src/engine/rules.ts`,
with a test that fails on drift), tuned by the simulator (`crates/sim`) toward the
goal clean rates below.

### Difficulty ("tables")

| Table | House holds | Goal clean rate |
| --- | --- | --- |
| **Shitamachi** (下町): the corner bar | 3 cards | ~70% |
| **Kabukichō** (歌舞伎町) | 4 cards | ~50% |
| **Oyabun** (親分): the boss's room | 5 cards | ~30% |

Shitamachi is the default table.

### Timing

- Decision timer: 30s by default, per step (nod, then call). The host can choose 15s,
  30s, 60s, or off. When it runs out, you pass on the nod and sit out the call.
- After the showdown, the next hand starts when every connected human taps
  **Next**, or after 10s.
- A disconnected human never blocks the table. They can rejoin with the same link
  and reclaim their seat.

### Silence

The whole game is built so nobody needs to talk about their cards. The only
signal is the nod. Besides that there are a few **reactions** (a sake clink, a
sigh of smoke, a wink), sent only in the lobby and after the showdown, never
during a hand.

## 3. Art direction

**"3 a.m. in a Golden Gai bar, printed as a risograph."**

Two worlds:

1. **The paper world** (landing, lobby, rules). Warm washi paper, sumi ink,
   vermilion hanko seals. Editorial serif type, monospace microcopy, handwritten
   margin notes. It should feel like a matchbook from a bar that has no website.
2. **The night world** (the table). A single paper lantern over a black urushi
   table with a gold maki-e rim. Rain on the window behind the House, neon kanji
   bleeding through it. The House's mask catches the lantern light. Cards are ivory
   stock printed in ink and shu red; your own float near the camera, backs out,
   each marked with a "?". Nods are gold silk threads; In and Out are stamped
   washi slips.

Moving from the paper world to the night world is the signature moment: the
paper burns away or slides open like a shoji, and the lantern flickers on.

### Palette

| Token | Hex | Use |
| --- | --- | --- |
| `--washi` | `#efe8da` | paper background |
| `--washi-2` | `#e6dcc8` | paper shade |
| `--sumi` | `#1b1a17` | ink, the night |
| `--sumi-2` | `#2a2824` | raised ink surfaces |
| `--shu` | `#d2412a` | vermilion, hanko, In, hearts and diamonds |
| `--kin` | `#c9a45c` | gold leaf, the maki-e rim, nods, the door |
| `--ai` | `#2d4a6b` | indigo, sparingly |
| `--matcha` | `#7d8b5a` | win states, sparingly |
| `--neon` | `#ff4f6d` | neon signage, the sirens |

### Type

- **Shippori Mincho B1**: display and kanji. Big, high-contrast, editorial.
- **JetBrains Mono**: microcopy, numbers, the track, labels. Uppercase, tracked out.
- **Caveat**: handwritten margin notes, the bartender's chalk. Use it rarely.

### Sound

Everything is synthesized with WebAudio. No sample files.

- Rain on glass and a low room hum for ambience.
- Plucked-string reveals (Karplus-Strong, shamisen-ish).
- Card flicks, a knuckle knock for a nod, a heavy hanko *thunk* on In (lighter for Out).
- A rising run of rin chimes when the nods turn over, and a koto shimmer when your own cards flip.
- A rising taiko roll for the showdown.

### Copy voice

Short, dry, and a little noir. No exclamation points. The House is polite and
dangerous. Errors read like a bartender talking: "That table's closed. Try another door."
