# hachi-sim

The balancing simulator for 893 Hold'em. It plays whole nights with a regular
(bot) in every chair, for every table and crew size, and tunes two things:

- the **regulars' policy knobs** (`KNOBS` in `crates/engine/src/bot.rs`), and
- the **balance numbers** (`BALANCE` in `crates/engine/src/rules.rs`): a heat
  limit and a take target per table × crew size.

Nights run with the heat limit switched off (`Game::endless`), so every
night's final take and heat are both seen. Heat only ever rises, so any
candidate (heat limit H, target T) can be scored offline from one batch:
clean if `heat < H && take >= T`, raid if `heat >= H`, short otherwise.

Nights run in parallel across all cores (`THREADS=n` caps it). Seeds are fixed,
so reruns are reproducible and two knob settings are compared on the same deals.

## Build

```sh
cargo build --release -p hachi-sim
```

Always use `--release`: a debug build is roughly 30 times slower.

## Tune the balance numbers

```sh
./target/release/hachi-sim [nights=600] [samples=300] [rounds=2]
```

For each cell:

1. **Heat limit, anchored to autopilot.** 800+ nights of a crew that always
   stays. The limit is the heat that autopilot reaches 45% (Shitamachi), 60%
   (Kabukichō) or 75% (Oyabun) of the time, so the limit doesn't move when the
   regulars change.
2. **Target, tuned to the regulars.** The regulars pace themselves against the
   target they see, so every candidate is played at its own numbers. Starting
   from the target in `BALANCE`, play `nights` regular nights, score them, and
   bisect toward a 70% / 50% / 30% clean rate (clean rate falls as the target
   rises), for up to `rounds` candidates. Keep the candidate closest to the goal.
3. **Confirm** the chosen numbers on `nights` fresh deals.
4. Report the regulars' clean / raid / short rates, their fold, raise and walk
   rates, and how always-stay and always-raise crews fare on the same numbers.

It ends with a Rust table to paste into `BALANCE`.

`rounds=0` skips tuning and **probes** the numbers already in `rules.rs`:

```sh
./target/release/hachi-sim 600 300 0
```

## Search the policy knobs

```sh
./target/release/hachi-sim search [nights=100] [samples=200] [sweeps=3]
```

The heat limits are anchored to autopilot as above, and the targets are fixed at
autopilot's median take, so every candidate is scored on the same numbers. A
coordinate search then tries each knob a step up and a step down. A move is
kept if it improves the objective by more than 0.2 points. When a sweep finds no
move, the steps are halved. The objective is the mean clean rate over all 15
cells, minus penalties for playing outside a human-looking band: walks over 5%
of hands, raises outside 10–25% of calls, or folds outside 15–40% of calls.
The search prints the per-seat, per-hand take and heat moments it measured.
Those are what the `take_*` and `heat_*` knobs model.

Start a search from a different point, or try a single setting, with `KNOBS`:

```sh
KNOBS="walk_cost=2,signal=0" ./target/release/hachi-sim search 60 200 0
```

With `sweeps=0` the search only scores the starting point.

## Cost

One decision is one Monte Carlo pass (300–500 samples, with all of the
House's and teammates' hands dealt each time), well under a millisecond
natively. A 600-night run across all cells takes a few minutes on an idle
8-core machine. On a shared machine, search with 100–200 nights per cell, then
confirm with 600 or more.
