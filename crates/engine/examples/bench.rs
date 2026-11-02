//! Timing loop for the evaluator and the odds estimator.
//!
//! ```sh
//! cargo run --release -p hachi-engine --example bench
//! ```
//!
//! For the same loops compiled to WebAssembly, see `wasm_bench.rs`.

use std::hint::black_box;
use std::time::Instant;

use hachi_engine::card::{Card, Rng, full_deck};
use hachi_engine::equity::{Spot, estimate};
use hachi_engine::eval::{evaluate, score_best};

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

    let house = [[None, None]; 3];
    let spot = Spot {
        hole: [deck[0], deck[1]],
        board: &[],
        board_total: 5,
        house: &house,
        dead: &[],
        lowball: false,
    };
    let reps = 2_000;
    let mut best_us = f64::MAX;
    for _ in 0..5 {
        let t = Instant::now();
        for _ in 0..reps {
            sink =
                sink.wrapping_add((estimate(black_box(&spot), 2_000, &mut rng).win * 1e6) as u32);
        }
        best_us = best_us.min(t.elapsed().as_nanos() as f64 / reps as f64 / 1_000.0);
    }
    println!("estimate (2000 samples, preflop, 3 House hands): {best_us:6.1} µs");

    let board = [deck[2], deck[3], deck[4]];
    let spot = Spot {
        board: &board,
        ..spot
    };
    let t = Instant::now();
    for _ in 0..reps {
        sink = sink.wrapping_add((estimate(black_box(&spot), 2_000, &mut rng).win * 1e6) as u32);
    }
    println!(
        "estimate (2000 samples, flop, 3 House hands):    {:6.1} µs",
        t.elapsed().as_nanos() as f64 / reps as f64 / 1_000.0
    );
    black_box(sink);
}
