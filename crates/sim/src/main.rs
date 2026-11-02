//! Balancing simulator.
//!
//! Plays full nights where every chair is a regular (bot), for every table and
//! crew size, and reports how often the crew gets away clean with the current
//! targets, plus the take target that would hit the design's goal rates
//! (Shitamachi 70%, Kabukichō 50%, Oyabun 30%).
//!
//! ```text
//! cargo run --release -p hachi-sim -- [nights=2000] [samples=400]
//! ```

use hachi_engine::bot::{Temperament, decide};
use hachi_engine::card::Rng;
use hachi_engine::game::{Game, Phase, Verdict};
use hachi_engine::rules::{Difficulty, table};
use hachi_engine::view::view_for;

struct Night {
    verdict: Verdict,
    take: u32,
    raided: bool,
}

fn play(d: Difficulty, crew: usize, seed: u64, samples: u32) -> Night {
    let mut g = Game::new("SIMUL", seed);
    let host = g.join("pid-simhost", "Host", "koi").expect("seat");
    for _ in 1..crew {
        g.add_bot(&host).expect("bot");
    }
    // The host is a regular too: mark it as one so it plays.
    g.seats[0].bot = true;
    g.set_config(&host, Some(d), Some(0)).expect("config");
    g.start(&host, 0).expect("start");
    let mut rng = Rng::seeded(seed.wrapping_mul(31) + 7);
    let mut now = 0;
    while g.phase != Phase::Over {
        now += 1000;
        match g.phase {
            Phase::Call => {
                for id in g.bots_to_act() {
                    let pid = g.seat(&id).map(|s| s.pid.clone()).unwrap_or_default();
                    let t = Temperament { samples, ..Temperament::for_seat(&pid) };
                    let stance = decide(&view_for(&g, Some(&id), now), &id, t, &mut rng);
                    // Every bot decides from the same street view, simultaneously.
                    g.call(&id, stance, now).expect("legal call");
                }
            }
            Phase::Showdown => g.tick(now + 60_000),
            _ => unreachable!(),
        }
    }
    let verdict = g.verdict.expect("over");
    // Take a raided crew would have finished with is unknown; record what it had.
    Night { verdict, take: g.take, raided: verdict == Verdict::Raid }
}

fn main() {
    let args: Vec<u64> = std::env::args().skip(1).filter_map(|a| a.parse().ok()).collect();
    let nights = *args.first().unwrap_or(&2000);
    let samples = *args.get(1).unwrap_or(&400) as u32;
    let goals = [(Difficulty::Shitamachi, 0.70), (Difficulty::Kabukicho, 0.50), (Difficulty::Oyabun, 0.30)];

    println!("{nights} nights per cell, {samples} Monte Carlo samples per decision\n");
    println!("{:<11} {:>4} {:>7} {:>7} {:>7} {:>8} {:>9}", "table", "crew", "clean", "raid", "short", "target", "suggest");
    for (d, goal) in goals {
        let spec = table(d);
        let mut per_seat_suggestions = Vec::new();
        for crew in 2..=6 {
            let results: Vec<Night> = (0..nights).map(|i| play(d, crew, i * 7919 + crew as u64, samples)).collect();
            let n = results.len() as f64;
            let clean = results.iter().filter(|r| r.verdict == Verdict::Clean).count() as f64 / n;
            let raid = results.iter().filter(|r| r.raided).count() as f64 / n;
            let short = 1.0 - clean - raid;
            let target = hachi_engine::rules::target_for(d, crew);
            // Highest target that still lets `goal` of all nights get away clean.
            let mut takes: Vec<u32> = results.iter().filter(|r| !r.raided).map(|r| r.take).collect();
            takes.sort_unstable_by(|a, b| b.cmp(a));
            let k = (goal * n).ceil() as usize;
            let suggest = takes.get(k.saturating_sub(1)).copied().unwrap_or(0);
            per_seat_suggestions.push(f64::from(suggest) / crew as f64);
            println!(
                "{:<11} {:>4} {:>6.1}% {:>6.1}% {:>6.1}% {:>8} {:>9}",
                format!("{d:?}").to_lowercase(),
                crew,
                clean * 100.0,
                raid * 100.0,
                short * 100.0,
                target,
                suggest
            );
        }
        let mean = per_seat_suggestions.iter().sum::<f64>() / per_seat_suggestions.len() as f64;
        println!(
            "  -> {:?}: per_seat_tenths now {}, suggested {} (goal {:.0}% clean)\n",
            d,
            spec.per_seat_tenths,
            (mean * 10.0).round(),
            goal * 100.0
        );
    }
}
