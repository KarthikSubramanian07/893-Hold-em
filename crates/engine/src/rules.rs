//! Tables (difficulties) and the numbers that balance a night.
//!
//! This is the source of truth for every number the rules depend on.
//! `src/engine/rules.ts` mirrors it for the UI, and a test on the TypeScript
//! side checks the two agree.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Difficulty {
    Shitamachi,
    Kabukicho,
    Oyabun,
}

pub const MIN_CREW: usize = 2;
pub const MAX_CREW: usize = 6;
/// Cards the House shows from the start; the rest stay hidden to the showdown.
pub const HOUSE_UP: usize = 1;
/// Board cards face up while the crew nods: the flop and the turn. The river
/// comes with the call.
pub const NOD_BOARD: usize = 4;
/// Last orders: the night ends after this many hands if the marker hasn't
/// reached the door or the sirens. The clock is what keeps a crew from
/// sitting Out forever.
pub const LAST_ORDERS: u8 = 10;
/// Seconds the showdown waits for "next" before dealing on.
pub const SHOWDOWN_SECONDS: u64 = 10;

/// How many cards the House holds, per table and crew size of 2 through 6.
/// It plays its best five with the board, like anyone else, and every In hand
/// plays it alone. Two cards, like yours, so a hand going In blind wins a bit
/// under half the time and a hand the nods vouched for wins about two in
/// three: reading pays. The tables differ by the track, not the House.
pub const HOUSE: [[usize; 5]; 3] = [
    // Shitamachi
    [2, 2, 2, 2, 2],
    // Kabukicho
    [2, 2, 2, 2, 2],
    // Oyabun
    [2, 2, 2, 2, 2],
];

pub fn house_cards(d: Difficulty, crew: usize) -> usize {
    HOUSE[row(d)][crew.clamp(MIN_CREW, MAX_CREW) - MIN_CREW]
}

fn row(d: Difficulty) -> usize {
    match d {
        Difficulty::Shitamachi => 0,
        Difficulty::Kabukicho => 1,
        Difficulty::Oyabun => 2,
    }
}

/// (steps to the door, steps to the sirens) for crews of 2 through 6, per
/// table. Every In hand that beats the House moves the marker one step toward
/// the door; every In hand that loses, one step toward the sirens. Tuned by
/// `crates/sim` so the regulars escape about 70% / 50% / 30% of nights.
pub const BALANCE: [[(u32, u32); 5]; 3] = [
    // Shitamachi
    [(4, 4), (6, 5), (7, 6), (9, 7), (10, 8)],
    // Kabukicho
    [(6, 2), (8, 3), (10, 4), (12, 5), (14, 6)],
    // Oyabun
    [(8, 2), (10, 3), (13, 4), (17, 5), (19, 6)],
];

fn balance(d: Difficulty, crew: usize) -> (u32, u32) {
    BALANCE[row(d)][crew.clamp(MIN_CREW, MAX_CREW) - MIN_CREW]
}

/// Steps from the start to the door (escape) for this table and crew.
pub fn door_for(d: Difficulty, crew: usize) -> u32 {
    balance(d, crew).0
}

/// Steps from the start to the sirens (raid) for this table and crew.
pub fn sirens_for(d: Difficulty, crew: usize) -> u32 {
    balance(d, crew).1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_house_never_shrinks_at_a_harder_table() {
        for crew in MIN_CREW..=MAX_CREW {
            let easy = house_cards(Difficulty::Shitamachi, crew);
            let mid = house_cards(Difficulty::Kabukicho, crew);
            let hard = house_cards(Difficulty::Oyabun, crew);
            assert!(easy <= mid && mid <= hard);
            // It shows one card and keeps at least one hidden; the evaluator
            // takes up to twelve, and the House plus the board stays at ten.
            assert!(easy > HOUSE_UP && (2..=5).contains(&hard));
        }
    }

    #[test]
    fn the_crew_nods_on_the_turn() {
        assert_eq!(NOD_BOARD, 4);
    }

    #[test]
    fn every_crew_size_has_a_track() {
        for d in [
            Difficulty::Shitamachi,
            Difficulty::Kabukicho,
            Difficulty::Oyabun,
        ] {
            for crew in MIN_CREW..=MAX_CREW {
                assert!(door_for(d, crew) >= 2);
                assert!(sirens_for(d, crew) >= 2);
            }
        }
    }

    #[test]
    fn difficulty_serializes_like_typescript() {
        assert_eq!(
            serde_json::to_string(&Difficulty::Kabukicho).unwrap(),
            "\"kabukicho\""
        );
    }
}
