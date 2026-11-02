//! Tables (difficulties), House Rules, and the numbers that balance a night.
//!
//! This is the source of truth for every number the rules depend on.
//! `src/engine/rules.ts` mirrors it for the UI (names, kanji, flavour text), and
//! a test on the TypeScript side checks the two agree.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Difficulty {
    Shitamachi,
    Kabukicho,
    Oyabun,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RuleId {
    /// Fog: the river is face down until the showdown.
    Kiri,
    /// Mirror: each mask shows one hole card.
    Kagami,
    /// Oni: the House sits one extra hand.
    Oni,
    /// Hush: calls are hidden until the showdown (folds still show).
    Shizuka,
    /// Blaze: take and heat doubled.
    Homura,
    /// Bond: every raise raises every active stake.
    Kizuna,
    /// Serpent: ties go to the House.
    Hebi,
    /// Fox: one crew member's hole cards are public.
    Kitsune,
    /// Reversal: lowball, the weaker hand wins.
    Gyaku,
}

pub const ALL_RULES: [RuleId; 9] = [
    RuleId::Kiri,
    RuleId::Kagami,
    RuleId::Oni,
    RuleId::Shizuka,
    RuleId::Homura,
    RuleId::Kizuna,
    RuleId::Hebi,
    RuleId::Kitsune,
    RuleId::Gyaku,
];

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableSpec {
    pub id: Difficulty,
    pub deck: &'static [RuleId],
    /// First hand (1-based) that draws a House Rule.
    pub rule_from: u8,
}

pub const HANDS_PER_NIGHT: u8 = 6;
pub const MAX_STAKE: u8 = 3;
pub const MIN_CREW: usize = 2;
pub const MAX_CREW: usize = 6;
/// Seconds the showdown waits for "next" before dealing on.
pub const SHOWDOWN_SECONDS: u64 = 12;

const SHITAMACHI_DECK: [RuleId; 4] = [
    RuleId::Kagami,
    RuleId::Kitsune,
    RuleId::Homura,
    RuleId::Kiri,
];
const KABUKICHO_DECK: [RuleId; 8] = [
    RuleId::Kiri,
    RuleId::Kagami,
    RuleId::Oni,
    RuleId::Shizuka,
    RuleId::Homura,
    RuleId::Kizuna,
    RuleId::Hebi,
    RuleId::Kitsune,
];

pub fn table(d: Difficulty) -> TableSpec {
    match d {
        Difficulty::Shitamachi => TableSpec {
            id: d,
            deck: &SHITAMACHI_DECK,
            rule_from: 2,
        },
        Difficulty::Kabukicho => TableSpec {
            id: d,
            deck: &KABUKICHO_DECK,
            rule_from: 2,
        },
        Difficulty::Oyabun => TableSpec {
            id: d,
            deck: &ALL_RULES,
            rule_from: 1,
        },
    }
}

/// How many hands the House sits for a crew of `crew`.
pub fn house_hands(crew: usize, rule: Option<RuleId>) -> usize {
    crew.div_ceil(2) + usize::from(rule == Some(RuleId::Oni))
}

/// (heat limit, take target) for crews of 2 through 6, per table. Heat grows
/// with every stake that loses on its own, so both numbers scale with the crew.
/// Heat limits are anchored to autopilot (a crew that always stays gets raided
/// about 45% / 60% / 75% of nights), with one extra point for the two smallest
/// Oyabun crews; targets are tuned by `crates/sim` so the regulars get away
/// clean 66-75% / 52-56% / 31-37% of nights (goals 70 / 50 / 30), measured at
/// 150 nights per cell. Autopilot manages 24-45% / 7-31% / 1-6%.
pub const BALANCE: [[(u32, u32); 5]; 3] = [
    // Shitamachi
    [(7, 8), (11, 13), (14, 20), (18, 24), (21, 27)],
    // Kabukicho
    [(6, 9), (9, 16), (12, 21), (15, 25), (18, 31)],
    // Oyabun
    [(6, 13), (9, 20), (10, 26), (14, 30), (17, 41)],
];

fn balance(d: Difficulty, crew: usize) -> (u32, u32) {
    let row = match d {
        Difficulty::Shitamachi => 0,
        Difficulty::Kabukicho => 1,
        Difficulty::Oyabun => 2,
    };
    BALANCE[row][crew.clamp(MIN_CREW, MAX_CREW) - MIN_CREW]
}

pub fn target_for(d: Difficulty, crew: usize) -> u32 {
    balance(d, crew).1
}

pub fn heat_limit_for(d: Difficulty, crew: usize) -> u32 {
    balance(d, crew).0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn house_scales_with_crew() {
        assert_eq!(house_hands(2, None), 1);
        assert_eq!(house_hands(3, None), 2);
        assert_eq!(house_hands(4, None), 2);
        assert_eq!(house_hands(5, None), 3);
        assert_eq!(house_hands(6, None), 3);
        assert_eq!(house_hands(6, Some(RuleId::Oni)), 4);
    }

    #[test]
    fn decks_match_the_design() {
        assert!(!table(Difficulty::Shitamachi).deck.contains(&RuleId::Gyaku));
        assert!(!table(Difficulty::Kabukicho).deck.contains(&RuleId::Gyaku));
        assert!(table(Difficulty::Oyabun).deck.contains(&RuleId::Gyaku));
        assert_eq!(table(Difficulty::Oyabun).rule_from, 1);
    }

    #[test]
    fn rule_ids_serialize_like_typescript() {
        assert_eq!(
            serde_json::to_string(&RuleId::Shizuka).unwrap(),
            "\"shizuka\""
        );
        assert_eq!(
            serde_json::to_string(&Difficulty::Kabukicho).unwrap(),
            "\"kabukicho\""
        );
    }
}
