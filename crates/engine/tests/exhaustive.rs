//! Exhaustive checks over every five-card and every seven-card hand.
//!
//! The seven-card sweep is 133,784,560 hands and is ignored by default. Run it
//! in release:
//!
//! ```sh
//! cargo test --release -p hachi-engine -- --ignored
//! ```

use hachi_engine::card::Card;
use hachi_engine::eval::{Category, card_mask, category_of, score_mask, score5};

fn deck_masks() -> [u64; 52] {
    std::array::from_fn(|i| card_mask(Card::from_index(i as u8)))
}

#[test]
fn every_five_card_hand() {
    let deck: Vec<Card> = (0..52).map(Card::from_index).collect();
    let mut counts = [0u64; 9];
    // Scores fit in 25 bits; one bit per possible score.
    let mut seen = vec![0u64; (1 << 25) / 64];
    let mut total = 0u64;
    for a in 0..48 {
        for b in a + 1..49 {
            for c in b + 1..50 {
                for d in c + 1..51 {
                    for e in d + 1..52 {
                        let s = score5([deck[a], deck[b], deck[c], deck[d], deck[e]]);
                        assert!(s < 1 << 25);
                        counts[category_of(s) as usize] += 1;
                        seen[(s >> 6) as usize] |= 1 << (s & 63);
                        total += 1;
                    }
                }
            }
        }
    }
    assert_eq!(total, 2_598_960);
    let distinct: u32 = seen.iter().map(|w| w.count_ones()).sum();
    assert_eq!(distinct, 7_462, "one score per equivalence class");
    assert_eq!(
        counts,
        [
            1_302_540, 1_098_240, 123_552, 54_912, 10_200, 5_108, 3_744, 624, 40
        ],
        "five-card category counts (high .. straight flush)"
    );

    // Distinct scores per category, from the standard 7,462 breakdown.
    let mut per_cat = [0u32; 9];
    for (w, word) in seen.iter().enumerate() {
        let mut bits = *word;
        while bits != 0 {
            let s = (w as u32) * 64 + bits.trailing_zeros();
            per_cat[category_of(s) as usize] += 1;
            bits &= bits - 1;
        }
    }
    assert_eq!(per_cat, [1_277, 2_860, 858, 858, 10, 1_277, 156, 156, 10]);
}

#[test]
#[ignore = "133M hands; run with --release -- --ignored"]
fn every_seven_card_hand() {
    let m = deck_masks();
    let mut counts = [0u64; 9];
    for a in 0..46 {
        let ma = m[a];
        for b in a + 1..47 {
            let mb = ma | m[b];
            for c in b + 1..48 {
                let mc = mb | m[c];
                for d in c + 1..49 {
                    let md = mc | m[d];
                    for e in d + 1..50 {
                        let me = md | m[e];
                        for f in e + 1..51 {
                            let mf = me | m[f];
                            for g in f + 1..52 {
                                counts[(score_mask(mf | m[g]) >> 21) as usize] += 1;
                            }
                        }
                    }
                }
            }
        }
    }
    assert_eq!(counts.iter().sum::<u64>(), 133_784_560);
    assert_eq!(
        counts,
        [
            23_294_460, 58_627_800, 31_433_400, 6_461_620, 6_180_020, 4_047_644, 3_473_184,
            224_848, 41_584
        ],
        "seven-card category counts (high .. straight flush)"
    );
    assert_eq!(Category::ALL.len(), counts.len());
}
