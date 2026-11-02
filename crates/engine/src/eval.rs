//! Hand evaluation: the best five of five to seven cards.
//!
//! # How it works
//!
//! A hand is folded into one `u64` mask with a 16-bit lane per suit: bit
//! `suit * 16 + rank`. The four lanes are the suit masks, their OR is the set
//! of ranks present, and a few bit-sliced additions over the lanes give the
//! ranks seen once, twice, three and four times. Every category falls out of
//! those masks with popcounts, leading-zero counts, and one shift-and test for
//! straights. No tables, no allocation, no loops over the cards beyond building
//! the mask, so `score_best` costs the same for five, six, or seven cards.
//!
//! # Score layout
//!
//! ```text
//!  bits 21..24  category (0 = high card .. 8 = straight flush)
//!  bits 17..20  major rank (pair, trips, quads, top pair, straight high card)
//!  bits 13..16  minor rank (second pair, the "full of" rank)
//!  bits  0..12  kicker mask: one bit per kicker rank
//! ```
//!
//! Kickers are always distinct ranks, so comparing their bitmasks as integers
//! is the same as comparing them high card first. Higher score wins, equal
//! scores tie, and there are exactly 7,462 distinct scores, one per class of
//! equivalent five-card hands.

use serde::{Deserialize, Serialize};

use crate::card::{ACE, Card};

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

impl Category {
    /// Every category, weakest first. `Category::ALL[c as usize] == c`.
    pub const ALL: [Category; 9] = [
        Category::High,
        Category::Pair,
        Category::TwoPair,
        Category::Trips,
        Category::Straight,
        Category::Flush,
        Category::FullHouse,
        Category::Quads,
        Category::StraightFlush,
    ];
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

const CAT_SHIFT: u32 = 21;
const MAJOR_SHIFT: u32 = 17;
const MINOR_SHIFT: u32 = 13;
const KICKERS: u32 = 0x1FFF;
const LANE: u64 = 0x1FFF;

/// The bit for one card in the per-suit lane layout used by [`score_mask`].
#[inline(always)]
pub const fn card_mask(c: Card) -> u64 {
    let i = c.index() as u64;
    1 << ((i & 3) * 16 + (i >> 2))
}

/// OR of [`card_mask`] over a slice of cards.
#[inline(always)]
pub fn hand_mask(cards: &[Card]) -> u64 {
    let mut m = 0;
    for &c in cards {
        m |= card_mask(c);
    }
    m
}

/// Score exactly five cards. Cheap; no allocation.
pub fn score5(cards: [Card; 5]) -> u32 {
    score_mask(hand_mask(&cards))
}

/// Score the best five of 5 to 7 cards. Cheap; no allocation. This is the hot
/// path for Monte Carlo, so it must be fast.
#[inline]
pub fn score_best(cards: &[Card]) -> u32 {
    debug_assert!(
        (5..=7).contains(&cards.len()),
        "score_best takes 5 to 7 cards"
    );
    score_mask(hand_mask(cards))
}

/// Category encoded in a score.
pub fn category_of(score: u32) -> Category {
    Category::ALL[(score >> CAT_SHIFT) as usize]
}

/// Score the best five of the cards in a [`card_mask`] layout mask holding 5 to
/// 7 distinct cards. This is the evaluator itself; the other entry points build
/// the mask and call it.
#[inline]
pub fn score_mask(m: u64) -> u32 {
    let s0 = (m & LANE) as u32;
    let s1 = ((m >> 16) & LANE) as u32;
    let s2 = ((m >> 32) & LANE) as u32;
    let s3 = ((m >> 48) & LANE) as u32;
    let ranks = s0 | s1 | s2 | s3;

    // With at most seven cards a flush leaves at most two other cards, which is
    // too few for quads or a full house, so a flush settles the hand.
    let flush = if s0.count_ones() >= 5 {
        s0
    } else if s1.count_ones() >= 5 {
        s1
    } else if s2.count_ones() >= 5 {
        s2
    } else if s3.count_ones() >= 5 {
        s3
    } else {
        0
    };
    if flush != 0 {
        return match straight_high(flush) {
            Some(high) => pack(Category::StraightFlush, high, 0, 0),
            None => pack(Category::Flush, 0, 0, keep_top(flush, 5)),
        };
    }

    // Bit-sliced per-rank counts: (b2 b1 b0) is how many suits hold each rank.
    let mut b0 = s0 ^ s1;
    let mut b1 = s0 & s1;
    let carry = b0 & s2;
    b0 ^= s2;
    b1 |= carry;
    let carry = b0 & s3;
    b0 ^= s3;
    let quads = b1 & carry;
    b1 ^= carry;

    if quads != 0 {
        let q = high_bit(quads);
        return pack(Category::Quads, q, 0, keep_top(ranks & !(1 << q), 1));
    }

    let trips = b1 & b0;
    let pairs = b1 & !b0;
    if trips != 0 {
        let t = high_bit(trips);
        let rest = (trips & !(1 << t)) | pairs;
        if rest != 0 {
            return pack(Category::FullHouse, t, high_bit(rest), 0);
        }
    }
    if let Some(high) = straight_high(ranks) {
        return pack(Category::Straight, high, 0, 0);
    }
    if trips != 0 {
        let t = high_bit(trips);
        return pack(Category::Trips, t, 0, keep_top(ranks & !(1 << t), 2));
    }
    if pairs != 0 {
        let p = high_bit(pairs);
        let others = pairs & !(1 << p);
        if others != 0 {
            let q = high_bit(others);
            let kicker = keep_top(ranks & !(1 << p) & !(1 << q), 1);
            return pack(Category::TwoPair, p, q, kicker);
        }
        return pack(Category::Pair, p, 0, keep_top(ranks & !(1 << p), 3));
    }
    pack(Category::High, 0, 0, keep_top(ranks, 5))
}

#[inline(always)]
const fn pack(cat: Category, major: u32, minor: u32, kickers: u32) -> u32 {
    (cat as u32) << CAT_SHIFT | major << MAJOR_SHIFT | minor << MINOR_SHIFT | kickers
}

#[inline(always)]
const fn high_bit(x: u32) -> u32 {
    31 - x.leading_zeros()
}

/// Keep only the `n` highest set bits of `x`.
#[inline(always)]
fn keep_top(mut x: u32, n: u32) -> u32 {
    while x.count_ones() > n {
        x &= x - 1;
    }
    x
}

/// High card rank of the best straight in a 13-bit rank mask, if any. The ace
/// also plays low, so the wheel (A-2-3-4-5) reads as five high.
#[inline(always)]
const fn straight_high(ranks: u32) -> Option<u32> {
    // Bit 0 is the low ace, bit r + 1 is rank r.
    let x = (ranks << 1) | ((ranks >> ACE) & 1);
    let runs = x & (x >> 1) & (x >> 2) & (x >> 3) & (x >> 4);
    if runs == 0 {
        None
    } else {
        Some(high_bit(runs) + 3)
    }
}

const SINGULAR: [&str; 13] = [
    "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "jack", "queen",
    "king", "ace",
];
const PLURAL: [&str; 13] = [
    "twos", "threes", "fours", "fives", "sixes", "sevens", "eights", "nines", "tens", "jacks",
    "queens", "kings", "aces",
];

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        Some(f) => f.to_ascii_uppercase().to_string() + c.as_str(),
        None => String::new(),
    }
}

/// The human name for a score, e.g. "Full house, sevens full of queens".
pub fn name_of(score: u32) -> String {
    let major = ((score >> MAJOR_SHIFT) & 0xF) as usize;
    let minor = ((score >> MINOR_SHIFT) & 0xF) as usize;
    let top_kicker = || high_bit(score & KICKERS) as usize;
    match category_of(score) {
        Category::High => format!("{} high", capitalize(SINGULAR[top_kicker()])),
        Category::Pair => format!("Pair of {}", PLURAL[major]),
        Category::TwoPair => format!("Two pair, {} and {}", PLURAL[major], PLURAL[minor]),
        Category::Trips => format!("Trip {}", PLURAL[major]),
        Category::Straight => format!("Straight, {} high", SINGULAR[major]),
        Category::Flush => format!("Flush, {} high", SINGULAR[top_kicker()]),
        Category::FullHouse => format!("Full house, {} full of {}", PLURAL[major], PLURAL[minor]),
        Category::Quads => format!("Four {}", PLURAL[major]),
        Category::StraightFlush if major == ACE as usize => "Royal flush".to_string(),
        Category::StraightFlush => format!("Straight flush, {} high", SINGULAR[major]),
    }
}

/// Full evaluation of 5 to 7 cards, with the name and the best five.
pub fn evaluate(cards: &[Card]) -> HandValue {
    assert!(
        (5..=7).contains(&cards.len()),
        "evaluate takes 5 to 7 cards, got {}",
        cards.len()
    );
    let score = score_best(cards);
    let category = category_of(score);
    let major = ((score >> MAJOR_SHIFT) & 0xF) as u8;
    let minor = ((score >> MINOR_SHIFT) & 0xF) as u8;
    let kickers = score & KICKERS;

    // Strongest first, and spades before hearts before diamonds before clubs,
    // so the choice between equal-rank cards is deterministic.
    let mut sorted: Vec<Card> = cards.to_vec();
    sorted.sort_by(|a, b| b.rank().cmp(&a.rank()).then(a.suit().cmp(&b.suit())));

    let flush_suit = (0..4u8).find(|&s| sorted.iter().filter(|c| c.suit() == s).count() >= 5);
    let mut best: Vec<Card> = Vec::with_capacity(5);
    let mut take = |rank: u8, n: usize, suit: Option<u8>| {
        let picks: Vec<Card> = sorted
            .iter()
            .copied()
            .filter(|c| c.rank() == rank && suit.is_none_or(|s| c.suit() == s))
            .filter(|c| !best.contains(c))
            .take(n)
            .collect();
        debug_assert_eq!(picks.len(), n);
        best.extend(picks);
    };
    let kicker_ranks = (0..13u8).rev().filter(|r| kickers & (1 << r) != 0);

    match category {
        Category::High | Category::Flush => {
            let suit = if category == Category::Flush {
                flush_suit
            } else {
                None
            };
            for r in kicker_ranks {
                take(r, 1, suit);
            }
        }
        Category::Pair | Category::Trips | Category::Quads => {
            let n = match category {
                Category::Pair => 2,
                Category::Trips => 3,
                _ => 4,
            };
            take(major, n, None);
            for r in kicker_ranks {
                take(r, 1, None);
            }
        }
        Category::TwoPair => {
            take(major, 2, None);
            take(minor, 2, None);
            for r in kicker_ranks {
                take(r, 1, None);
            }
        }
        Category::FullHouse => {
            take(major, 3, None);
            take(minor, 2, None);
        }
        Category::Straight | Category::StraightFlush => {
            let suit = if category == Category::StraightFlush {
                flush_suit
            } else {
                None
            };
            for i in 0..5u8 {
                // Below the two comes the low ace.
                let r = if major < 4 && i == 4 { ACE } else { major - i };
                take(r, 1, suit);
            }
        }
    }

    HandValue {
        score,
        category,
        name: name_of(score),
        best,
    }
}
