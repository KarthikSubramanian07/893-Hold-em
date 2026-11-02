//! Hand evaluation: the best five of five to seven cards.
//!
//! STUB: the signatures and docs here are the contract. The implementation
//! lands separately with exhaustive tests.

use serde::{Deserialize, Serialize};

use crate::card::Card;

/// Hand categories, weakest to strongest. Serialized exactly like the
/// TypeScript `HandCategory` union.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Category {
    High,
    Pair,
    TwoPair,
    Trips,
    Straight,
    Flush,
    FullHouse,
    Quads,
    StraightFlush,
}

/// The value of a made hand. `score` is totally ordered: a higher score beats
/// a lower one, and equal scores tie. Serialized like the TypeScript `HandValue`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct HandValue {
    pub score: u32,
    pub category: Category,
    /// e.g. "Two pair, kings and sevens", "Straight, five high", "Full house, sevens full of queens".
    pub name: String,
    /// The five cards making the hand, ordered as they read: the made part first
    /// (pair cards, trips, etc., high to low), then kickers high to low. For a
    /// wheel straight the ace goes last: `5 4 3 2 A`.
    pub best: Vec<Card>,
}

/// Score exactly five cards. Cheap; no allocation.
pub fn score5(_cards: [Card; 5]) -> u32 {
    todo!()
}

/// Score the best five of 5 to 7 cards. Cheap; no allocation. This is the hot
/// path for Monte Carlo, so it must be fast.
pub fn score_best(_cards: &[Card]) -> u32 {
    todo!()
}

/// Category encoded in a score.
pub fn category_of(_score: u32) -> Category {
    todo!()
}

/// Full evaluation of 5 to 7 cards, with the name and the best five.
pub fn evaluate(_cards: &[Card]) -> HandValue {
    todo!()
}
