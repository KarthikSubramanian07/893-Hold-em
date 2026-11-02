//! The bench loops as a WebAssembly module, timed from Node by
//! `wasm_bench.mjs`. Built as a `cdylib` example so the engine crate itself
//! stays an `rlib`:
//!
//! ```sh
//! cargo build --profile wasm --target wasm32-unknown-unknown -p hachi-engine --example wasm_bench
//! node crates/engine/examples/wasm_bench.mjs target/wasm32-unknown-unknown/wasm/examples/wasm_bench.wasm
//! ```

use hachi_engine::card::{Card, Rng, full_deck};
use hachi_engine::equity::{Spot, estimate};
use hachi_engine::eval::score_best;

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

/// Run `reps` preflop estimates of 2,000 samples against three hidden House hands.
#[unsafe(no_mangle)]
pub extern "C" fn bench_estimate(reps: u32) -> f64 {
    let mut rng = Rng::seeded(0x893);
    let deck = full_deck();
    let house = [[None, None]; 3];
    let spot = Spot {
        hole: [deck[51], deck[47]],
        board: &[],
        board_total: 5,
        house: &house,
        dead: &[],
        lowball: false,
    };
    let mut total = 0.0;
    for _ in 0..reps {
        total += estimate(std::hint::black_box(&spot), 2_000, &mut rng).win;
    }
    total / reps as f64
}
