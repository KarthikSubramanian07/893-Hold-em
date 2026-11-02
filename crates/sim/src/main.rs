//! Balancing simulator.
//!
//! Plays full nights where every chair is a regular, for every table and crew
//! size, with the heat limit switched off so each night's final take and heat
//! are both observed. Heat only ever rises, so for any candidate (heat limit H,
//! target T) a night gets away clean exactly when `heat < H && take >= T`.
//! That lets one batch of nights score every (H, T) pair offline.
//!
//! Three modes (see `crates/sim/README.md`):
//!
//! ```text
//! hachi-sim [nights=600] [samples=300] [rounds=6]      # tune BALANCE (rounds=0: probe it)
//! hachi-sim search [nights=100] [samples=200] [sweeps=3] # tune the regulars' KNOBS
//! ```
//!
//! Tuning: the heat limit of each cell is anchored to autopilot (a crew that
//! always stays gets raided 45% / 60% / 75% of nights on the three tables), so
//! it doesn't depend on how the regulars play. The target is then the one that
//! gets regulars away clean closest to 70% / 50% / 30%, found by bisection
//! with each candidate played at its own numbers (the regulars pace
//! themselves against the target they see), and confirmed on fresh deals.
//!
//! Env: `KNOBS="signal=0.2,fold_losing=0.3"` overrides policy knobs;
//! `THREADS=4` caps worker threads.

use std::sync::atomic::{AtomicU64, Ordering};

use hachi_engine::bot::{KNOBS, Knobs, Temperament, decide};
use hachi_engine::card::Rng;
use hachi_engine::game::{Game, Outcome, Phase, Stance};
use hachi_engine::rules::{Difficulty, RuleId, heat_limit_for, target_for};
use hachi_engine::view::view_for;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Policy {
    Regulars,
    AlwaysStay,
    AlwaysRaise,
}

#[derive(Default, Clone, Copy)]
struct Stats {
    hands: u64,
    crew_wins: u64,
    ties: u64,
    walked: u64,
    stake_sum: u64,
    folds: u64,
    raises: u64,
    calls: u64,
    /// Per-hand take and heat with Blaze's doubling taken out, and squares,
    /// for fitting the regulars' model of the hands still to come.
    take: f64,
    take2: f64,
    heat: f64,
    heat2: f64,
}

impl Stats {
    fn add(&mut self, o: &Stats) {
        self.hands += o.hands;
        self.crew_wins += o.crew_wins;
        self.ties += o.ties;
        self.walked += o.walked;
        self.stake_sum += o.stake_sum;
        self.folds += o.folds;
        self.raises += o.raises;
        self.calls += o.calls;
        self.take += o.take;
        self.take2 += o.take2;
        self.heat += o.heat;
        self.heat2 += o.heat2;
    }
    fn pct(&self, x: u64, of: u64) -> f64 {
        100.0 * x as f64 / of.max(1) as f64
    }
}

#[derive(Clone, Copy)]
struct Night {
    take: u32,
    heat: u32,
}

#[allow(clippy::too_many_arguments)]
fn play(
    d: Difficulty,
    crew: usize,
    seed: u64,
    samples: u32,
    knobs: &Knobs,
    (heat_limit, target): (u32, u32),
    policy: Policy,
) -> (Night, Stats) {
    let mut stats = Stats::default();
    let mut g = Game::new("SIMUL", seed);
    let host = g.join("pid-simhost", "Host", "koi").expect("seat");
    for _ in 1..crew {
        g.add_bot(&host).expect("bot");
    }
    // The host plays as a regular too.
    g.seats[0].bot = true;
    g.set_config(&host, Some(d), Some(0)).expect("config");
    g.start(&host, 0).expect("start");
    // Bots see the candidate numbers (they set how the crew prices heat),
    // but the night plays on past the limit so its whole trajectory is seen.
    g.heat_limit = heat_limit;
    g.target = target;
    g.endless = true;
    let mut rng = Rng::seeded(seed.wrapping_mul(31) + 7);
    let mut now = 0;
    while g.phase != Phase::Over {
        now += 1000;
        match g.phase {
            Phase::Call => {
                // Everyone decides from the same view of the street, simultaneously.
                let views: Vec<_> = g
                    .bots_to_act()
                    .into_iter()
                    .map(|id| (id.clone(), view_for(&g, Some(&id), now)))
                    .collect();
                let mut decisions = Vec::new();
                for (id, view) in &views {
                    let pid = g.seat(id).map(|s| s.pid.clone()).unwrap_or_default();
                    let t = Temperament {
                        samples,
                        knobs: *knobs,
                        ..Temperament::for_seat(&pid)
                    };
                    let stance = match policy {
                        Policy::Regulars => decide(view, id, t, &mut rng),
                        Policy::AlwaysStay => Stance::Stay,
                        Policy::AlwaysRaise => {
                            let at_cap =
                                view.seats.iter().any(|s| s.id == *id && s.stake == Some(3));
                            if at_cap { Stance::Stay } else { Stance::Raise }
                        }
                    };
                    decisions.push((id.clone(), stance));
                }
                for (id, stance) in decisions {
                    stats.calls += 1;
                    match stance {
                        Stance::Fold => stats.folds += 1,
                        Stance::Raise => stats.raises += 1,
                        Stance::Stay => {}
                    }
                    g.call(&id, stance, now).expect("legal call");
                }
                if g.phase != Phase::Call {
                    let r = g.result.as_ref().expect("resolved");
                    stats.hands += 1;
                    match r.outcome {
                        Outcome::Crew => stats.crew_wins += 1,
                        Outcome::Tie => stats.ties += 1,
                        Outcome::Walked => stats.walked += 1,
                        Outcome::House => {}
                    }
                    stats.stake_sum += g
                        .seats
                        .iter()
                        .filter(|s| s.active)
                        .map(|s| u64::from(s.stake))
                        .sum::<u64>();
                    let mult = if g.rule == Some(RuleId::Homura) {
                        2.0
                    } else {
                        1.0
                    };
                    let (t, h) = (f64::from(r.take) / mult, f64::from(r.heat) / mult);
                    stats.take += t;
                    stats.take2 += t * t;
                    stats.heat += h;
                    stats.heat2 += h * h;
                }
            }
            Phase::Showdown => g.tick(now + 60_000),
            _ => unreachable!(),
        }
    }
    (
        Night {
            take: g.take,
            heat: g.heat,
        },
        stats,
    )
}

/// Run `f` for every index in `0..n` across threads, in order.
fn par_map<T: Send>(n: u64, f: impl Fn(u64) -> T + Sync) -> Vec<T> {
    let threads = std::env::var("THREADS")
        .ok()
        .and_then(|t| t.parse().ok())
        .unwrap_or_else(|| std::thread::available_parallelism().map_or(4, |p| p.get()))
        .clamp(1, 64) as u64;
    let next = AtomicU64::new(0);
    let mut out: Vec<(u64, T)> = std::thread::scope(|s| {
        let workers: Vec<_> = (0..threads.min(n.max(1)))
            .map(|_| {
                s.spawn(|| {
                    let mut mine = Vec::new();
                    loop {
                        let i = next.fetch_add(1, Ordering::Relaxed);
                        if i >= n {
                            break mine;
                        }
                        mine.push((i, f(i)));
                    }
                })
            })
            .collect();
        workers
            .into_iter()
            .flat_map(|w| w.join().expect("worker"))
            .collect()
    });
    out.sort_by_key(|x| x.0);
    out.into_iter().map(|x| x.1).collect()
}

/// A batch of nights for one cell, with the stats merged.
#[allow(clippy::too_many_arguments)]
fn batch(
    d: Difficulty,
    crew: usize,
    nights: u64,
    seed: impl Fn(u64) -> u64 + Sync,
    samples: u32,
    knobs: &Knobs,
    numbers: (u32, u32),
    policy: Policy,
) -> (Vec<Night>, Stats) {
    let runs = par_map(nights, |i| {
        play(d, crew, seed(i), samples, knobs, numbers, policy)
    });
    let mut stats = Stats::default();
    for (_, s) in &runs {
        stats.add(s);
    }
    (runs.into_iter().map(|r| r.0).collect(), stats)
}

struct Pick {
    heat_limit: u32,
    target: u32,
    clean: f64,
    raid: f64,
    short: f64,
}

fn rates(nights: &[Night], heat_limit: u32, target: u32) -> (f64, f64, f64) {
    let n = nights.len().max(1) as f64;
    let raid = nights.iter().filter(|x| x.heat >= heat_limit).count() as f64 / n;
    let clean = nights
        .iter()
        .filter(|x| x.heat < heat_limit && x.take >= target)
        .count() as f64
        / n;
    (clean, raid, 1.0 - clean - raid)
}

/// The take target whose clean rate is closest to `goal` for a fixed heat limit.
fn tune(nights: &[Night], heat_limit: u32, goal: f64) -> Pick {
    let max_take = nights.iter().map(|x| x.take).max().unwrap_or(0) + 1;
    let mut best: Option<(f64, Pick)> = None;
    for t in 1..=max_take {
        let (clean, raid, short) = rates(nights, heat_limit, t);
        let cost = (clean - goal).abs();
        if best.as_ref().is_none_or(|(c, _)| cost < *c) {
            best = Some((
                cost,
                Pick {
                    heat_limit,
                    target: t,
                    clean,
                    raid,
                    short,
                },
            ));
        }
    }
    best.expect("at least one candidate").1
}

/// (table, goal clean rate for good play, raid rate for a crew on autopilot)
const GOALS: [(Difficulty, f64, f64); 3] = [
    (Difficulty::Shitamachi, 0.70, 0.45),
    (Difficulty::Kabukicho, 0.50, 0.60),
    (Difficulty::Oyabun, 0.30, 0.75),
];

/// Heat limit anchored to autopilot, and autopilot's median take.
fn anchors(d: Difficulty, crew: usize, nights: u64, naive_raid: f64) -> (u32, u32) {
    let (runs, _) = batch(
        d,
        crew,
        nights,
        |i| i * 131 + 17,
        1,
        &KNOBS,
        (u32::MAX, 0),
        Policy::AlwaysStay,
    );
    let mut heat: Vec<u32> = runs.iter().map(|r| r.heat).collect();
    let mut take: Vec<u32> = runs.iter().map(|r| r.take).collect();
    heat.sort_unstable();
    take.sort_unstable();
    let k = ((1.0 - naive_raid) * heat.len() as f64) as usize;
    (heat[k.min(heat.len() - 1)].max(2), take[take.len() / 2])
}

fn knobs_from_env() -> Knobs {
    let mut k = KNOBS;
    if let Ok(spec) = std::env::var("KNOBS") {
        for kv in spec.split(',').filter(|s| !s.is_empty()) {
            let (name, value) = kv
                .split_once('=')
                .expect("KNOBS entries look like name=value");
            let value: f64 = value.trim().parse().expect("a number");
            *knob(&mut k, name.trim()).unwrap_or_else(|| panic!("no knob {name:?}")) = value;
        }
    }
    k
}

const KNOB_NAMES: [&str; 12] = [
    "take_mean",
    "take_sd",
    "heat_mean",
    "heat_sd",
    "fold_losing",
    "fold_passing",
    "raise_later",
    "signal",
    "stake_tax",
    "jitter",
    "raise_tell",
    "walk_cost",
];

fn knob<'a>(k: &'a mut Knobs, name: &str) -> Option<&'a mut f64> {
    Some(match name {
        "take_mean" => &mut k.take_mean,
        "take_sd" => &mut k.take_sd,
        "heat_mean" => &mut k.heat_mean,
        "heat_sd" => &mut k.heat_sd,
        "fold_losing" => &mut k.fold_losing,
        "fold_passing" => &mut k.fold_passing,
        "raise_later" => &mut k.raise_later,
        "signal" => &mut k.signal,
        "stake_tax" => &mut k.stake_tax,
        "jitter" => &mut k.jitter,
        "raise_tell" => &mut k.raise_tell,
        "walk_cost" => &mut k.walk_cost,
        _ => return None,
    })
}

fn show(k: &Knobs) -> String {
    let mut k = *k;
    KNOB_NAMES
        .iter()
        .map(|n| format!("{n}={:.3}", *knob(&mut k, n).expect("known")))
        .collect::<Vec<_>>()
        .join(",")
}

/// How a policy does on fixed numbers, across every cell.
struct Score {
    clean: f64,
    /// Clean rate less penalties for playing outside a human-looking band:
    /// walks under 5% of hands, raises 10-25% and folds 15-40% of calls.
    objective: f64,
    stats: Stats,
    /// Per crew size 2..=6: fitted (take_mean, take_sd, heat_mean, heat_sd).
    fits: Vec<[f64; 4]>,
}

fn score(cells: &[(Difficulty, usize, (u32, u32))], nights: u64, samples: u32, k: &Knobs) -> Score {
    let mut clean = 0.0;
    let mut all = Stats::default();
    let mut by_crew = vec![Stats::default(); 5];
    for &(d, crew, numbers) in cells {
        let (runs, stats) = batch(
            d,
            crew,
            nights,
            |i| i * 7919 + crew as u64 * 104_729 + 3,
            samples,
            k,
            numbers,
            Policy::Regulars,
        );
        clean += rates(&runs, numbers.0, numbers.1).0;
        all.add(&stats);
        by_crew[crew - 2].add(&stats);
    }
    let fits = by_crew
        .iter()
        .enumerate()
        .map(|(i, s)| {
            let n = (i + 2) as f64;
            let h = s.hands.max(1) as f64;
            let (tm, hm) = (s.take / h, s.heat / h);
            let (tv, hv) = (s.take2 / h - tm * tm, s.heat2 / h - hm * hm);
            [
                tm / n,
                tv.max(0.0).sqrt() / n,
                hm / n,
                hv.max(0.0).sqrt() / n.sqrt(),
            ]
        })
        .collect();
    let clean = clean / cells.len() as f64;
    let frac = |x: u64, of: u64| x as f64 / of.max(1) as f64;
    let (walk, raise, fold) = (
        frac(all.walked, all.hands),
        frac(all.raises, all.calls),
        frac(all.folds, all.calls),
    );
    let outside = |x: f64, lo: f64, hi: f64| (lo - x).max(0.0) + (x - hi).max(0.0);
    let objective =
        clean - outside(walk, 0.0, 0.05) - outside(raise, 0.10, 0.25) - outside(fold, 0.15, 0.40);
    Score {
        objective,
        clean,
        stats: all,
        fits,
    }
}

fn report(tag: &str, s: &Score) {
    let st = &s.stats;
    println!(
        "{tag:<28} obj {:>5.1}  clean {:>5.1}%  fold {:>4.1}%  raise {:>4.1}%  walk {:>4.1}%",
        100.0 * s.objective,
        100.0 * s.clean,
        st.pct(st.folds, st.calls),
        st.pct(st.raises, st.calls),
        st.pct(st.walked, st.hands),
    );
}

/// Coordinate search over the knobs on fixed, anchored numbers.
fn search(nights: u64, samples: u32, sweeps: u64) {
    println!("Anchoring: heat limit from autopilot raids, target = autopilot's median take");
    let mut cells = Vec::new();
    for (d, _, naive_raid) in GOALS {
        for crew in 2..=6usize {
            let a = anchors(d, crew, 800, naive_raid);
            println!(
                "  {:<10} {crew}: heat {:>2} target {:>2}",
                format!("{d:?}"),
                a.0,
                a.1
            );
            cells.push((d, crew, a));
        }
    }
    let mut k = knobs_from_env();
    let mut best = score(&cells, nights, samples, &k);
    report("start", &best);
    println!("  {}", show(&k));
    let mut steps: Vec<f64> = KNOB_NAMES
        .iter()
        .map(|n| match *n {
            "take_mean" | "heat_mean" => 0.08,
            "take_sd" | "heat_sd" => 0.15,
            "fold_losing" => 0.08,
            "fold_passing" | "raise_later" => 0.04,
            "signal" | "stake_tax" => 0.2,
            "jitter" => 0.1,
            "raise_tell" => 1.0,
            "walk_cost" => 1.0,
            _ => 0.1,
        })
        .collect();
    for sweep in 0..sweeps {
        let mut moved = false;
        for (i, name) in KNOB_NAMES.iter().enumerate() {
            for dir in [1.0, -1.0] {
                let mut c = k;
                let x = knob(&mut c, name).expect("known");
                *x = (*x + dir * steps[i]).max(0.0);
                let s = score(&cells, nights, samples, &c);
                let tag = format!("sweep {sweep} {name} {}", if dir > 0.0 { "+" } else { "-" });
                report(&tag, &s);
                if s.objective > best.objective + 0.002 {
                    k = c;
                    best = s;
                    moved = true;
                    println!("  accept: {}", show(&k));
                    break;
                }
            }
        }
        if !moved {
            for s in &mut steps {
                *s *= 0.5;
            }
            println!("  no move this sweep; halving steps");
        }
    }
    println!("\nBest: {}", show(&k));
    report("best", &best);
    println!("Measured per-hand moments (per seat): take_mean take_sd heat_mean heat_sd");
    for (i, f) in best.fits.iter().enumerate() {
        println!(
            "  crew {}: {:.3} {:.3} {:.3} {:.3}",
            i + 2,
            f[0],
            f[1],
            f[2],
            f[3]
        );
    }
}

fn balance(nights: u64, samples: u32, rounds: u64) {
    let knobs = knobs_from_env();
    println!("{nights} nights per cell, {samples} Monte Carlo samples per decision");
    println!("knobs: {}\n", show(&knobs));
    println!(
        "{:<11} {:>4} {:>6} {:>6} {:>6} {:>6} {:>6} {:>6} | {:>5} {:>6} {:>6} {:>6} {:>6} | {:>6} {:>6}",
        "table",
        "crew",
        "win",
        "tie",
        "walk",
        "fold",
        "raise",
        "stake",
        "heat",
        "target",
        "clean",
        "raid",
        "short",
        "stay",
        "raise"
    );
    let mut rust = String::new();
    for (d, goal, naive_raid) in GOALS {
        let mut row = Vec::new();
        for crew in 2..=6usize {
            let mut pick = (heat_limit_for(d, crew), target_for(d, crew));
            if rounds > 0 {
                // Heat limit: anchored to autopilot. A crew that stays in every
                // hand should get raided `naive_raid` of the time; this keeps the
                // limit independent of how the regulars play. The target search
                // starts from the one in rules.rs.
                pick.0 = anchors(d, crew, nights.max(800), naive_raid).0;
            }
            // Target: the regulars pace themselves against the target they
            // see, so each candidate has to be played at its own numbers.
            // Clean rate falls as the target rises; bisect on it, proposing
            // each next candidate from the last batch scored offline.
            let play_at = |numbers: (u32, u32), salt: u64| {
                batch(
                    d,
                    crew,
                    nights,
                    |i| i * 7919 + crew as u64 * 104_729 + salt * 15_485_863,
                    samples,
                    &knobs,
                    numbers,
                    Policy::Regulars,
                )
            };
            if rounds > 0 {
                let (mut lo, mut hi) = (0u32, None::<u32>);
                let mut tried: Vec<(u32, f64)> = Vec::new();
                let mut target = pick.1;
                for round in 0..rounds {
                    let (results, _) = play_at((pick.0, target), round);
                    let clean = rates(&results, pick.0, target).0;
                    eprintln!(
                        "  {d:?} {crew}: target {target:>2} -> clean {:.1}%",
                        clean * 100.0
                    );
                    tried.push((target, clean));
                    if clean >= goal {
                        lo = lo.max(target);
                    } else {
                        hi = Some(hi.map_or(target, |h| h.min(target)));
                    }
                    let guess = tune(&results, pick.0, goal).target;
                    let next = match hi {
                        Some(h) if h <= lo + 1 => break,
                        Some(h) if guess > lo && guess < h => guess,
                        Some(h) => (lo + h) / 2,
                        None => guess.max(target + 1),
                    };
                    target = next.max(1);
                }
                let best = tried
                    .iter()
                    .min_by(|a, b| (a.1 - goal).abs().total_cmp(&(b.1 - goal).abs()))
                    .expect("at least one round");
                pick.1 = best.0;
            }
            // Confirm on fresh deals at the chosen numbers.
            let (results, stats) = play_at(pick, 1000);
            let (clean, raid, short) = rates(&results, pick.0, pick.1);
            let p = Pick {
                heat_limit: pick.0,
                target: pick.1,
                clean,
                raid,
                short,
            };
            // How autopilot crews fare against the same numbers.
            let naive = |policy| {
                let (r, _) = batch(d, crew, nights, |i| i * 31 + 5, 1, &knobs, pick, policy);
                rates(&r, pick.0, pick.1).0
            };
            let stay = naive(Policy::AlwaysStay);
            let raise = naive(Policy::AlwaysRaise);
            println!(
                "{:<11} {:>4} {:>5.1}% {:>5.1}% {:>5.1}% {:>5.1}% {:>5.1}% {:>6.2} | {:>5} {:>6} {:>5.1}% {:>5.1}% {:>5.1}% | {:>5.1}% {:>5.1}%",
                format!("{d:?}").to_lowercase(),
                crew,
                stats.pct(stats.crew_wins, stats.hands),
                stats.pct(stats.ties, stats.hands),
                stats.pct(stats.walked, stats.hands),
                stats.pct(stats.folds, stats.calls),
                stats.pct(stats.raises, stats.calls),
                stats.stake_sum as f64 / stats.hands.max(1) as f64,
                p.heat_limit,
                p.target,
                p.clean * 100.0,
                p.raid * 100.0,
                p.short * 100.0,
                stay * 100.0,
                raise * 100.0,
            );
            row.push((p.heat_limit, p.target));
        }
        rust.push_str(&format!(
            "    // {d:?}: crews of 2..=6, (heat limit, target)\n    {row:?},\n"
        ));
        println!();
    }
    println!("Paste into rules.rs BALANCE:\n{rust}");
}

fn main() {
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    let searching = args.first().is_some_and(|a| a == "search");
    if searching {
        args.remove(0);
    }
    let nums: Vec<u64> = args.iter().filter_map(|a| a.parse().ok()).collect();
    if searching {
        let nights = *nums.first().unwrap_or(&100);
        let samples = *nums.get(1).unwrap_or(&200) as u32;
        let sweeps = *nums.get(2).unwrap_or(&3);
        search(nights, samples, sweeps);
    } else {
        let nights = *nums.first().unwrap_or(&600);
        let samples = *nums.get(1).unwrap_or(&300) as u32;
        let rounds = *nums.get(2).unwrap_or(&6);
        balance(nights, samples, rounds);
    }
}
