# hachi-sim

The balancing simulator for 893 Hold'em. It plays whole nights with a regular
(bot) in every chair, for every table and crew size, and does two jobs:

- **Tune** the track: how many steps from the start to the door, per table and
  crew size (`BALANCE` in `crates/engine/src/rules.rs`).
- **Probe** the game: compare the regulars with weaker crews on the same deals,
  to check that nodding and reading nods are what wins.

Seeds are fixed, so reruns are reproducible and two settings are compared on
the same deals. Nights run in parallel across cores (`THREADS=n` caps it).
`TABLE=kabukicho` limits a run to one table, and `CREWS=2,4,6` to some crew
sizes, which helps when you're only retuning one corner.

## Build

```sh
cargo build --release -p hachi-sim
```

Always use `--release`: a debug build is roughly 30 times slower.

## Tune the track

```sh
./target/release/hachi-sim [nights=300] [samples=200]
```

For each table and crew size:

1. **The sirens** sit a fixed distance away: the crew size plus three at
   Shitamachi, plus one at Kabukichō, and just the crew size at Oyabun
   (`sirens_for` in `src/main.rs`). At Oyabun that is about one bad hand with
   everyone In.
2. **The door** is bisected until the regulars get away clean closest to
   70% (Shitamachi), 50% (Kabukichō) or 30% (Oyabun) of nights. Every
   candidate is played at its own numbers, because the regulars weigh each
   step by how far the door and the sirens are.
3. **Confirm** the chosen numbers on fresh deals.

It ends with a Rust table to paste into `BALANCE`, and the TypeScript mirror
in `src/engine/rules.ts` must match it (a test checks).

## Probe

```sh
./target/release/hachi-sim probe [nights=300] [samples=200]
```

Plays every cell at the numbers in `BALANCE` with five crews:

| Crew | Nods | Reads nods | In or Out |
|---|---|---|---|
| regulars | at whichever of its two neighbours is likelier to win | yes | weighs the marker |
| random nod | at one of its two neighbours, at random | yes | weighs the marker |
| no nods | never | yes | weighs the marker |
| deaf | at whichever of its two neighbours is likelier to win | no | weighs the marker |
| always in | never | no | always In |

Columns: clean, raid and dawn rates; hands per night; how often players went
In and nodded; **convert** (of hands someone could have won, how many the crew
won); **hit%** (of hands that went In, how many beat the House); and
**comeback** (nights won from the sirens' side, or lost from the door's side).

If the regulars don't clearly beat "no nods" and "deaf", the nod isn't doing
its job, and that's a rules problem, not a bot problem.

## Knobs

`KNOBS="nod_min=0.25,caution=0.5"` overrides the regulars' policy
(`KNOBS` in `crates/engine/src/bot.rs`):

| Knob | Meaning |
|---|---|
| `nod_min` | Nod only at a neighbour who beats the House at least this often |
| `nod_trust` | How reliably a nod points at the stronger of the two hands it sees |
| `caution` | Extra weight on steps toward the sirens, the closer they are |
| `urgency` | Extra weight on steps toward the door, the fewer hands are left |
| `in_margin` | How much better In must look than Out |
| `jitter` | Noise on every call, so regulars aren't clockwork |

## Cost

Each decision builds a strength table from the board as it stands at the nod,
the flop and the turn (about 40 deals, every two-card hand scored on each),
and then samples a few hundred completions. A regular can't see its own hand
or the hands across the table, so every sample deals those too, along with
the House's hidden card and the river. One to two milliseconds natively. A full tune is a few thousand nights per
table; run it with `THREADS=2` under `nice` on a shared machine.
