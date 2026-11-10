# 893 Hold'em — design

> 8-9-3, read *ya-ku-za*: the worst hand in an old Japanese card game, and the
> name the yakuza took for themselves. Everybody at this table starts with a
> bad hand. The point is to play it together.

This is the canonical spec. Code, copy, and art all answer to it.

---

## 1. The pitch

A co-op poker heist for 2 to 6 people. The crew sits in a ring on one side of a
lacquer table in a back-alley bar in Shinjuku. The House sits across, in a mask.
You can see the cards of the two players beside you but never your own, and
nobody may talk. All you get is **one nod a hand**, and the nods that come back
to you.

One link, no accounts. Open a table, send the link, play in a minute.

## 2. Rules

### In four lines

1. **You see the hands of the two players beside you, never your own.** The
   House shows one card and plays its best five with the board.
2. **After the turn, each player may nod at one of the two they can see**:
   "you're good". One nod each per hand, or pass.
3. **After the river, everyone picks In or Out at once.**
4. **Every hand that's In plays the House on its own.** Each one that beats it:
   one step toward the door. Each one that loses: one step toward the sirens. A
   tie moves nothing for that hand. Out: nothing moves, but the clock runs.

Reach the door = clean getaway. Reach the sirens = raid. After 10 hands
("last orders") the night ends as **dawn**, except at Oyabun, where there are
no last orders: a crew still in the boss's room after hand 10 is raided. Track
tuning alone couldn't stop half of Oyabun nights fizzling out at dawn (nearer
sirens just made crews sit Out more), so every night at the boss's table ends
at the door or the sirens.

### Seats

- **The crew** is 2 to 6 seats, humans or bot regulars who fill empty chairs.
  The seats sit in a ring, so everyone has exactly two neighbours. At two or
  three players that is everyone else at the table; from four up, nobody sees
  the whole table.
- **The House** is one masked figure: Okame at Shitamachi, Kitsune at Kabukichō,
  the Okina at Oyabun. It holds two cards at every table, dealt face down except
  the first (`HOUSE_UP = 1`).

### A hand

Phases: `lobby` → `nod` → `call` → `showdown` → next hand (or `over`).

1. **The deal.** Each player gets 2 hole cards, facing out: you see the cards of
   the two seats beside you, and your own are `'back'` in your view until the
   showdown. Everyone else's are hidden too. Spectators see no hole cards at all.
   The flop and the turn (4 board cards, `NOD_BOARD`) are face up.
2. **`nod`.** Each player sends `{ t: 'nod', at: seatId }` for one of their two
   neighbours, or `{ t: 'nod', at: null }` to pass. One per hand. Nods stay hidden
   from others until everyone has nodded, then turn over together; your own is
   always visible to you. Since you only have two neighbours, nobody can receive
   more than two nods.
3. **`call`.** The river comes out (all 5 board cards). Each player sends
   `{ t: 'call', stance: 'in' | 'out' }`. Stances stay hidden until the showdown.
4. **`showdown`.** Every card flips, including your own, for the first time.
   Each hand that's In plays the House's best five (its cards plus the board) on
   its own. `result.moved` is +1 for every In hand that beat the House and −1 for
   every In hand that lost to it; ties and Out hands count 0.
   `result.crewChampions` lists the In hands that won, `result.couldHave` every
   seat (In or Out) whose hand beat the House. The showdown lists which In hands
   won and which lost, and the best winner is the best hand that beat the House.

The tension is the nod, and the trade. A nod says "of the two hands I can see,
this one looks good." One nod, two neighbours: if both look good, you have to
pick, so a neighbour who nodded past you at their other side is telling you
something too. Going In is a step either way, and only your own hand decides
which; sitting out a winner leaves a step on the table.

### Why it works this way

An earlier version let everyone see every hand but their own, and sent only the
best In hand against the House. At three to six players the best hand was
obvious to everyone, every nod landed on it, and the nods carried no real
information. And with only the best hand playing, everyone could just go In
whenever the table looked strong.

Now only your two neighbours know your hand. Their one nod is a forced comparison
between their two neighbours, and since every In hand plays alone, you have to
read your own strength from the nods. The simulator agrees: crews that nod well
get away roughly twice as often as crews that nod at random, and far more often
than crews that never nod.

### The track

One marker starts at 0. The door sits at `door`, the sirens at `-sirens`; both depend
on the table **and** the crew size, because every In hand moves the marker. They
live in `BALANCE` in `crates/engine/src/rules.rs` (mirrored in `src/engine/rules.ts`,
with a test that fails on drift), tuned by the simulator (`crates/sim`) toward the
goal clean rates below.

### Difficulty ("tables")

The House holds two cards everywhere. What changes from table to table is the
track: how far the door and the sirens sit from the start.

| Table | House holds | The track | Goal clean rate |
| --- | --- | --- | --- |
| **Shitamachi** (下町): the corner bar | 2 cards | forgiving, the sirens far off | ~70% |
| **Kabukichō** (歌舞伎町): the neon | 2 cards | the sirens closer | ~50% |
| **Oyabun** (親分): the boss's room | 2 cards | the sirens close, the door far | ~30% |

The goal is for a crew that plays well. The exact distances for each crew size
are in `BALANCE`, and the rules drawer in the game shows the ones for your table.

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

Text on these colours keeps WCAG 2.2 AA contrast (4.5:1 for body text). Washi text on a
vermilion button uses `--shu-button` (`#bd3a25`), one step darker than `--shu`; the faintest
ink is `#676054` on paper and washi at 52% on the night (2026-11-10).

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
