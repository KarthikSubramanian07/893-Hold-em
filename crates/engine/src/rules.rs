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

/// How many cards the House holds: one more than there are players, two more
/// at the harder tables. It plays its best five with the board, like anyone
/// else, so a bigger crew faces a stronger House.
pub const fn house_cards(d: Difficulty, crew: usize) -> usize {
    crew + match d {
        Difficulty::Shitamachi => 1,
        Difficulty::Kabukicho | Difficulty::Oyabun => 2,
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
    fn the_house_outnumbers_the_crew() {
        assert_eq!(house_cards(Difficulty::Shitamachi, 2), 3);
        assert_eq!(house_cards(Difficulty::Kabukicho, 2), 4);
        assert_eq!(house_cards(Difficulty::Oyabun, 6), 8);
        // Six seats, the House, and the board always fit in one deck.
        assert!(6 * 2 + house_cards(Difficulty::Oyabun, 6) + 5 <= 52);
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
