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
/// Last orders: the night ends after this many hands even if the marker never
/// reached the door or the sirens. Balanced so it almost never comes to that.
pub const LAST_ORDERS: u8 = 10;
/// Seconds the showdown waits for "next" before dealing on.
pub const SHOWDOWN_SECONDS: u64 = 10;

/// How many cards the House holds at this table. It plays its best five with
/// the board, like anyone else.
pub const fn house_cards(d: Difficulty) -> usize {
    match d {
        Difficulty::Shitamachi => 3,
        Difficulty::Kabukicho => 4,
        Difficulty::Oyabun => 5,
    }
}

/// (steps to the door, steps to the sirens) for crews of 2 through 6, per
/// table. A won hand moves the marker one step toward the door for every
/// player who was in; a lost hand moves it one step toward the sirens for
/// every player who was in. Tuned by `crates/sim` so the regulars escape
/// about 70% / 50% / 30% of nights.
pub const BALANCE: [[(u32, u32); 5]; 3] = [
    // Shitamachi
    [(5, 5), (7, 6), (9, 7), (11, 8), (12, 9)],
    // Kabukicho
    [(5, 4), (7, 5), (9, 6), (11, 7), (12, 8)],
    // Oyabun
    [(5, 4), (7, 5), (9, 6), (11, 7), (12, 8)],
];

fn balance(d: Difficulty, crew: usize) -> (u32, u32) {
    let row = match d {
        Difficulty::Shitamachi => 0,
        Difficulty::Kabukicho => 1,
        Difficulty::Oyabun => 2,
    };
    BALANCE[row][crew.clamp(MIN_CREW, MAX_CREW) - MIN_CREW]
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
    fn harder_tables_hold_more_cards() {
        assert_eq!(house_cards(Difficulty::Shitamachi), 3);
        assert_eq!(house_cards(Difficulty::Kabukicho), 4);
        assert_eq!(house_cards(Difficulty::Oyabun), 5);
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
