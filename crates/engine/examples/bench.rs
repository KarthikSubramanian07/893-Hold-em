//! Timing loop for the evaluator and a regular's decisions.
//!
//! ```sh
//! cargo run --release -p hachi-engine --example bench
//! ```
//!
//! For the same loops compiled to WebAssembly, see `wasm_bench.rs`.

use std::hint::black_box;
use std::time::Instant;

use hachi_engine::card::{Card, Rng, full_deck};
use hachi_engine::bot::{Temperament, call, nod};
use hachi_engine::eval::{evaluate, score_best};
use hachi_engine::game::Game;
use hachi_engine::rules::Difficulty;
use hachi_engine::view::view_for;

fn main() {
    let mut rng = Rng::seeded(0x893);
    let mut deck = full_deck();
    // A small ring of hands stays in cache, like the hot loop of an estimate.
    let hands: Vec<[Card; 7]> = (0..1024)
        .map(|_| {
            rng.shuffle(&mut deck);
            std::array::from_fn(|i| deck[i])
        })
        .collect();

    // Warm up, then time several passes and keep the best.
    let mut best_ns = f64::MAX;
    let mut sink = 0u32;
    let n = 4_000_000;
    for _ in 0..6 {
        let t = Instant::now();
        for i in 0..n {
            sink = sink.wrapping_add(score_best(black_box(&hands[i & 1023])));
        }
        best_ns = best_ns.min(t.elapsed().as_nanos() as f64 / n as f64);
    }
    println!("score_best (7 cards):      {best_ns:6.1} ns/hand");

    let t = Instant::now();
    for i in 0..100_000 {
        sink = sink.wrapping_add(black_box(evaluate(black_box(&hands[i & 1023]))).score);
    }
    println!(
        "evaluate   (7 cards):      {:6.1} ns/hand",
        t.elapsed().as_nanos() as f64 / 100_000.0
    );

    // A regular's two decisions at the biggest, hardest table.
    let mut g = Game::new("K7QX2", 0x893);
    let a = g.join("pid-aaaaaaaa", "A", "koi").unwrap();
    for _ in 0..5 {
        g.add_bot(&a).unwrap();
    }
    g.set_config(&a, Some(Difficulty::Oyabun), None).unwrap();
    g.start(&a, 0).unwrap();
    let flop = view_for(&g, Some("s1"), 0);
    for s in ["s0", "s1", "s2", "s3", "s4", "s5"] {
        g.nod(s, Some(if s == "s0" { "s1" } else { "s0" }), 0).unwrap();
    }
    let river = view_for(&g, Some("s1"), 0);
    let t = Temperament::for_seat("bot:1");
    let reps = 500;
    let start = Instant::now();
    for _ in 0..reps {
        sink = sink.wrapping_add(u32::from(nod(black_box(&flop), "s1", t, &mut rng).is_some()));
    }
    println!(
        "regular nod  (300 samples, 6 seats, Oyabun): {:6.1} µs",
        start.elapsed().as_nanos() as f64 / reps as f64 / 1_000.0
    );
    let start = Instant::now();
    for _ in 0..reps {
        sink = sink.wrapping_add(u32::from(
            call(black_box(&river), "s1", t, &mut rng) == hachi_engine::game::Stance::In,
        ));
    }
    println!(
        "regular call (300 samples, 6 seats, Oyabun): {:6.1} µs",
        start.elapsed().as_nanos() as f64 / reps as f64 / 1_000.0
    );
    black_box(sink);
}
