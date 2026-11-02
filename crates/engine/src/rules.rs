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
    pub heat_limit: u32,
    /// Target take per crew seat, in tenths, so the night's target is
    /// `round(per_seat_tenths × crew / 10)`. Tuned by the simulator.
    pub per_seat_tenths: u32,
}

pub const HANDS_PER_NIGHT: u8 = 6;
pub const MAX_STAKE: u8 = 3;
pub const MIN_CREW: usize = 2;
pub const MAX_CREW: usize = 6;
/// Seconds the showdown waits for "next" before dealing on.
pub const SHOWDOWN_SECONDS: u64 = 12;

const SHITAMACHI_DECK: [RuleId; 4] = [RuleId::Kagami, RuleId::Kitsune, RuleId::Homura, RuleId::Kiri];
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
            heat_limit: 9,
            per_seat_tenths: 40,
        },
        Difficulty::Kabukicho => TableSpec {
            id: d,
            deck: &KABUKICHO_DECK,
            rule_from: 2,
            heat_limit: 8,
            per_seat_tenths: 50,
        },
        Difficulty::Oyabun => TableSpec {
            id: d,
            deck: &ALL_RULES,
            rule_from: 1,
            heat_limit: 7,
            per_seat_tenths: 60,
        },
    }
}

/// How many hands the House sits for a crew of `crew`.
pub fn house_hands(crew: usize, rule: Option<RuleId>) -> usize {
    crew.div_ceil(2) + usize::from(rule == Some(RuleId::Oni))
}

pub fn target_for(d: Difficulty, crew: usize) -> u32 {
    let tenths = table(d).per_seat_tenths * crew as u32;
    (tenths + 5) / 10
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
        assert_eq!(serde_json::to_string(&RuleId::Shizuka).unwrap(), "\"shizuka\"");
        assert_eq!(serde_json::to_string(&Difficulty::Kabukicho).unwrap(), "\"kabukicho\"");
    }
}
