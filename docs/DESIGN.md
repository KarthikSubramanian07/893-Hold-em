# 893 Hold'em — design

> 8-9-3, read *ya-ku-za*: the worst hand in an old Japanese card game, and the
> name the gangs took for themselves. Everybody at this table starts with a
> bad hand. The point is to play it together.

This is the canonical spec. Code, copy, and art all answer to it.

---

## 1. The pitch

A co-op poker heist for 2 to 6 people. The crew sits on one side of a lacquer
table in a back-alley bar in Shinjuku. The House sits across, wearing masks.
You can't talk about your cards. All you can do is **commit**, and everybody
sees what you committed to.

One link, no accounts. Open a table, send the link, play in a minute.

## 2. Rules

### Seats

- **The crew**: 2 to 6 seats, humans or bot "regulars" who fill empty chairs.
- **The House** plays `ceil(crew / 2)` hands at once, one per mask. Two players
  face one mask; five players face three. That keeps the odds honest at every
  table size: when everybody plays, the crew's best hand wins about two times in three.

### A night

A night is **6 hands**. The crew shares two counters:

| Counter | Meaning |
| --- | --- |
| **Take** (yen, 円) | Money won. Reach the night's target to get away clean. |
| **Heat** (熱) | Police attention. Hit the limit and the bar gets raided. You lose immediately. |

The night ends with one of three verdicts:

- **Clean getaway**: all 6 hands are played, take ≥ target, and heat < limit.
- **Raid**: heat reaches the limit at any point.
- **Came up short**: 6 hands are played but take < target.

### A hand

1. **The deal.** Each crew member gets 2 private hole cards. Each House mask gets 2 face-down cards.
2. **The House Rule.** From hand 2 on (from hand 1 on the hardest table), one House Rule card flips. It bends this hand only.
3. **Four calls**: pre-flop, flop (3 board cards), turn (1), river (1). At each call,
   every crew member still in **secretly** picks one of three:
   - **Fold** (降): step out. Your cards no longer count for this hand. You can't come back.
   - **Stay** (待): keep your stake.
   - **Raise** (攻): your stake goes up by 1, to a maximum of 3.

   Every stake starts at 1. When every active player has locked in, or the call
   timer runs out (anyone undecided counts as **Stay**), all calls flip at once.
   That simultaneous flip is the only conversation the crew gets.
4. **The showdown.** The crew's **best** active hand faces the House's **best** hand
   (best 5 of 7 across all masks).
   - Crew wins: **take += sum of every active stake**. Everyone who stayed in gets paid,
     even if their own cards were trash. That's riding the champion.
   - House wins: **heat += sum of every active stake**.
   - Tie: nothing happens. Nobody gets paid and nobody gets burned.
   - Everybody folded: **heat += 1**. Walking away from a job still gets noticed.

The tension comes from the simultaneous flip. A raise says "I'm carrying this
one, pile in." Weak hands should ride a strong raise to multiply the take. And
if the only strong hand folds, the whole crew is exposed.

### House Rules

Each hand after the first draws one card. The difficulty decides which cards are in the deck.

| Id | Kanji | Name | Effect |
| --- | --- | --- | --- |
| `kiri` | 霧 | Fog | The river is dealt face down. It turns over at the showdown. |
| `kagami` | 鏡 | Mirror | Each mask shows one of its hole cards from the start. |
| `oni` | 鬼 | Oni | The House sits one extra hand. |
| `shizuka` | 静 | Hush | Calls are hidden. You see only who's in and who's out until the showdown. |
| `homura` | 炎 | Blaze | Take and heat are doubled. |
| `kizuna` | 絆 | Bond | Stakes are shared. Every raise raises every active stake. |
| `hebi` | 蛇 | Serpent | Ties go to the House. |
| `kitsune` | 狐 | Fox | One random crew member's hole cards are dealt face up for all to see. |
| `gyaku` | 逆 | Reversal | Lowball. The *weakest* hand wins. Oyabun table only. |

### Difficulty ("tables")

| Table | Rules deck | Rule from hand | Heat limit | Target |
| --- | --- | --- | --- | --- |
| **Shitamachi** (下町): the corner bar | kagami, kitsune, homura, kiri | 2 | 9 | tuned by sim |
| **Kabukichō** (歌舞伎町) | all except gyaku | 2 | 8 | tuned by sim |
| **Oyabun** (親分): the boss's room | everything | 1 | 7 | tuned by sim |

Targets scale with crew size: `target = round(perSeat × crew)`. `perSeat` is
tuned in `scripts/simulate.ts` so that a crew of competent bots gets away clean
about 70% of the time on Shitamachi, 50% on Kabukichō, and 30% on Oyabun.

### Timing

- Call timer: 30s by default. The host can choose 15s, 30s, 60s, or off.
- After the showdown, the next hand starts when every connected human taps
  **Next**, or after 12s.
- A disconnected human's calls default to Stay. They can rejoin with the same
  link and reclaim their seat.

### Silence

The whole game is built so nobody needs to talk about their cards. The only
communication besides calls is a few **reactions** (a sake clink, a sigh of
smoke, a slow nod). Reactions can only be sent in the lobby and after the
showdown, never during calls.

## 3. Art direction

**"3 a.m. in a Golden Gai bar, printed as a risograph."**

Two worlds:

1. **The paper world** (landing, lobby, rules). Warm washi paper, sumi ink,
   vermilion hanko seals. Editorial serif type, monospace microcopy, handwritten
   margin notes. It should feel like a matchbook from a bar that has no website.
2. **The night world** (the table). A single paper lantern over a black urushi
   table with a gold maki-e rim. Rain on the window behind the House, neon kanji
   bleeding through it. The masks across the table catch the lantern light. Cards
   are ivory stock printed in ink and shu red. Stakes are lacquer tokens stamped
   with kanji.

Moving from the paper world to the night world is the signature moment: the
paper burns away or slides open like a shoji, and the lantern flickers on.

### Palette

| Token | Hex | Use |
| --- | --- | --- |
| `--washi` | `#efe8da` | paper background |
| `--washi-2` | `#e6dcc8` | paper shade |
| `--sumi` | `#1b1a17` | ink, the night |
| `--sumi-2` | `#2a2824` | raised ink surfaces |
| `--shu` | `#d2412a` | vermilion, hanko, Raise, hearts and diamonds |
| `--kin` | `#c9a45c` | gold leaf, the maki-e rim, Take |
| `--ai` | `#2d4a6b` | indigo, Stay |
| `--matcha` | `#7d8b5a` | win states, sparingly |
| `--neon` | `#ff4f6d` | neon signage, Heat |

### Type

- **Shippori Mincho B1**: display and kanji. Big, high-contrast, editorial.
- **JetBrains Mono**: microcopy, numbers, counters, labels. Uppercase, tracked out.
- **Caveat**: handwritten margin notes, the bartender's chalk. Use it rarely.

### Sound

Everything is synthesized with WebAudio. No sample files.

- Rain on glass and a low room hum for ambience.
- Plucked-string reveals (Karplus-Strong, shamisen-ish).
- Card flicks, the clack of lacquer tokens, a heavy hanko *thunk* on lock-in.
- A rising taiko roll for the showdown.

### Copy voice

Short, dry, and a little noir. No exclamation points. The House is polite and
dangerous. Errors read like a bartender talking: "That table's closed. Try another door."
