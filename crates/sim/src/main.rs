//! Balancing simulator.
//!
//! Plays full nights where every chair is a regular, for every table and crew
//! size, with the heat limit switched off so each night's final take and heat
//! are both observed. Heat only ever rises, so for any candidate (heat limit H,
//! target T) a night gets away clean exactly when `heat < H && take >= T`.
//! That lets one batch of nights score every (H, T) pair offline.
//!
//! For each cell it picks the pair whose clean rate is closest to the design
//! goal (Shitamachi 70%, Kabukichō 50%, Oyabun 30%) while keeping the two ways
//! to lose, a raid and coming up short, roughly equally likely, so both counters
//! matter. It prints a Rust table to paste into `rules.rs`.
//!
//! ```text
//! cargo run --release -p hachi-sim -- [nights=1500] [samples=300] [rounds=3]
//! ```

use hachi_engine::bot::{Temperament, decide};
use hachi_engine::card::Rng;
use hachi_engine::game::{Game, Outcome, Phase, Stance};
use hachi_engine::rules::{Difficulty, heat_limit_for, target_for};
use hachi_engine::view::view_for;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Policy {
    Regulars,
    AlwaysStay,
    AlwaysRaise,
}

#[derive(Default)]
struct Stats {
    hands: u32,
    crew_wins: u32,
    ties: u32,
    walked: u32,
    stake_sum: u32,
    folds: u32,
    raises: u32,
    calls: u32,
}

fn play(
    d: Difficulty,
    crew: usize,
    seed: u64,
    samples: u32,
    (heat_limit, target): (u32, u32),
    policy: Policy,
    stats: &mut Stats,
) -> (u32, u32) {
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
                        caution: caution(),
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
                        .map(|s| u32::from(s.stake))
                        .sum::<u32>();
                }
            }
            Phase::Showdown => g.tick(now + 60_000),
            _ => unreachable!(),
        }
    }
    (g.take, g.heat)
}

struct Pick {
    heat_limit: u32,
    target: u32,
    clean: f64,
    raid: f64,
    short: f64,
}

/// Caution override for experiments: `CAUTION=2.0 hachi-sim ...`.
fn caution() -> f64 {
    std::env::var("CAUTION")
        .ok()
        .and_then(|c| c.parse().ok())
        .unwrap_or(hachi_engine::bot::CAUTION)
}

fn rates(nights: &[(u32, u32)], heat_limit: u32, target: u32) -> (f64, f64, f64) {
    let n = nights.len() as f64;
    let raid = nights.iter().filter(|x| x.1 >= heat_limit).count() as f64 / n;
    let clean = nights
        .iter()
        .filter(|x| x.1 < heat_limit && x.0 >= target)
        .count() as f64
        / n;
    (clean, raid, 1.0 - clean - raid)
}

/// The take target whose clean rate is closest to `goal` for a fixed heat limit.
fn tune(nights: &[(u32, u32)], heat_limit: u32, goal: f64) -> Pick {
    let max_take = nights.iter().map(|x| x.0).max().unwrap_or(0) + 1;
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

fn main() {
    let args: Vec<u64> = std::env::args()
        .skip(1)
        .filter_map(|a| a.parse().ok())
        .collect();
    let nights = *args.first().unwrap_or(&1500);
    let samples = *args.get(1).unwrap_or(&300) as u32;
    let rounds = *args.get(2).unwrap_or(&2);
    // (table, goal clean rate for good play, raid rate for a crew on autopilot)
    let goals = [
        (Difficulty::Shitamachi, 0.70, 0.45),
        (Difficulty::Kabukicho, 0.50, 0.60),
        (Difficulty::Oyabun, 0.30, 0.75),
    ];

    println!("{nights} nights per cell, {samples} Monte Carlo samples per decision\n");
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
    for (d, goal, naive_raid) in goals {
        let mut row = Vec::new();
        for crew in 2..=6usize {
            let mut pick = (heat_limit_for(d, crew), target_for(d, crew));
            if rounds > 0 {
                // Heat limit: anchored to autopilot. A crew that stays in every
                // hand should get raided `naive_raid` of the time; this keeps the
                // limit independent of how the regulars play.
                let mut st = Stats::default();
                let mut auto: Vec<u32> = (0..nights)
                    .map(|i| {
                        let p = (u32::MAX, 0);
                        play(
                            d,
                            crew,
                            i * 131 + 17,
                            samples,
                            p,
                            Policy::AlwaysStay,
                            &mut st,
                        )
                        .1
                    })
                    .collect();
                auto.sort_unstable();
                let k = ((1.0 - naive_raid) * auto.len() as f64) as usize;
                pick.0 = auto[k.min(auto.len() - 1)].max(2);
            }
            let mut last = None;
            // Fixed-point on the target: bots price heat by how far they are from it.
            // With rounds = 0, just measure the numbers in rules.rs as they are.
            for round in 0..rounds.max(1) {
                let mut stats = Stats::default();
                let results: Vec<(u32, u32)> = (0..nights)
                    .map(|i| {
                        let seed = i * 7919 + crew as u64 * 104_729 + round * 15_485_863;
                        play(d, crew, seed, samples, pick, Policy::Regulars, &mut stats)
                    })
                    .collect();
                let p = if rounds == 0 {
                    let (clean, raid, short) = rates(&results, pick.0, pick.1);
                    Pick {
                        heat_limit: pick.0,
                        target: pick.1,
                        clean,
                        raid,
                        short,
                    }
                } else {
                    tune(&results, pick.0, goal)
                };
                pick = (p.heat_limit, p.target);
                last = Some((p, stats));
            }
            let (p, stats) = last.expect("at least one round");
            // How autopilot crews fare against the same numbers.
            let naive = |policy| {
                let mut st = Stats::default();
                let r: Vec<(u32, u32)> = (0..nights / 2)
                    .map(|i| play(d, crew, i * 31 + 5, samples, pick, policy, &mut st))
                    .collect();
                rates(&r, pick.0, pick.1).0
            };
            let stay = naive(Policy::AlwaysStay);
            let raise = naive(Policy::AlwaysRaise);
            let hands = f64::from(stats.hands.max(1));
            let calls = f64::from(stats.calls.max(1));
            println!(
                "{:<11} {:>4} {:>5.1}% {:>5.1}% {:>5.1}% {:>5.1}% {:>5.1}% {:>6.2} | {:>5} {:>6} {:>5.1}% {:>5.1}% {:>5.1}% | {:>5.1}% {:>5.1}%",
                format!("{d:?}").to_lowercase(),
                crew,
                100.0 * f64::from(stats.crew_wins) / hands,
                100.0 * f64::from(stats.ties) / hands,
                100.0 * f64::from(stats.walked) / hands,
                100.0 * f64::from(stats.folds) / calls,
                100.0 * f64::from(stats.raises) / calls,
                f64::from(stats.stake_sum) / hands,
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
