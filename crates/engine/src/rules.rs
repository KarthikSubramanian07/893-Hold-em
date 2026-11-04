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
/// Last orders: the night ends after this many hands if the marker hasn't
/// reached the door or the sirens. The clock is what keeps a crew from
/// sitting Out forever.
pub const LAST_ORDERS: u8 = 10;
/// Seconds the showdown waits for "next" before dealing on.
pub const SHOWDOWN_SECONDS: u64 = 10;

/// How many cards the House holds, per table and crew size of 2 through 6.
/// It plays its best five with the board, like anyone else. Chosen so a crew
/// that always goes In together wins a bit under half its hands at Shitamachi
/// and about a third at Oyabun: going In blind doesn't pay, reading does.
pub const HOUSE: [[usize; 5]; 3] = [
    // Shitamachi
    [3, 3, 4, 4, 4],
    // Kabukicho
    [3, 4, 4, 5, 5],
    // Oyabun
    [4, 4, 5, 5, 5],
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
/// table. A won hand moves the marker one step toward the door for every
/// player who was in; a lost hand moves it one step toward the sirens for
/// every player who was in. Tuned by `crates/sim` so the regulars escape
/// about 70% / 50% / 30% of nights, in five to seven hands.
pub const BALANCE: [[(u32, u32); 5]; 3] = [
    // Shitamachi
    [(3, 5), (5, 7), (5, 9), (6, 12), (7, 14)],
    // Kabukicho
    [(4, 3), (4, 6), (8, 7), (6, 10), (7, 12)],
    // Oyabun
    [(3, 3), (5, 4), (5, 6), (8, 8), (10, 10)],
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
    fn the_house_grows_with_the_crew_and_the_table() {
        for crew in MIN_CREW..=MAX_CREW {
            let easy = house_cards(Difficulty::Shitamachi, crew);
            let mid = house_cards(Difficulty::Kabukicho, crew);
            let hard = house_cards(Difficulty::Oyabun, crew);
            assert!(easy <= mid && mid <= hard);
            // The evaluator takes up to twelve cards; the House plus the board stays at ten.
            assert!((3..=5).contains(&hard));
        }
        assert!(house_cards(Difficulty::Shitamachi, 6) >= house_cards(Difficulty::Shitamachi, 2));
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
