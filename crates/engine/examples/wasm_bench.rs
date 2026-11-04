//! The bench loops as a WebAssembly module, timed from Node by
//! `wasm_bench.mjs`. Built as a `cdylib` example so the engine crate itself
//! stays an `rlib`:
//!
//! ```sh
//! cargo build --profile wasm --target wasm32-unknown-unknown -p hachi-engine --example wasm_bench
//! node crates/engine/examples/wasm_bench.mjs target/wasm32-unknown-unknown/wasm/examples/wasm_bench.wasm
//! ```

use hachi_engine::card::{Card, Rng, full_deck};
use hachi_engine::bot::{Temperament, call, nod};
use hachi_engine::eval::score_best;
use hachi_engine::game::Game;
use hachi_engine::rules::Difficulty;
use hachi_engine::view::view_for;

/// Score `n` random seven-card hands (dealt up front, outside the timed part
/// as far as possible: one shuffle per 1,024 hands). Returns a checksum.
#[unsafe(no_mangle)]
pub extern "C" fn bench_score(n: u32) -> u32 {
    let mut rng = Rng::seeded(0x893);
    let mut deck = full_deck();
    let hands: Vec<[Card; 7]> = (0..1024)
        .map(|_| {
            rng.shuffle(&mut deck);
            std::array::from_fn(|i| deck[i])
        })
        .collect();
    let mut sink = 0u32;
    for i in 0..n {
        sink = sink.wrapping_add(score_best(std::hint::black_box(
            &hands[(i & 1023) as usize],
        )));
    }
    sink
}

/// Run `reps` full regular decisions (a nod and an In/Out call, 300 samples
/// each) at a six-seat Oyabun table. Returns the mean of a checksum.
#[unsafe(no_mangle)]
pub extern "C" fn bench_decide(reps: u32) -> f64 {
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
    let mut rng = hachi_engine::card::Rng::seeded(7);
    let mut total = 0.0;
    for _ in 0..reps {
        total += f64::from(u8::from(nod(std::hint::black_box(&flop), "s1", t, &mut rng).is_some()));
        total += f64::from(u8::from(
            call(std::hint::black_box(&river), "s1", t, &mut rng) == hachi_engine::game::Stance::In,
        ));
    }
    total / f64::from(reps.max(1))
}
