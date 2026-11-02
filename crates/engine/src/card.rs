//! Cards, the deck, and a small seeded RNG.
//!
//! A card is one byte: `rank * 4 + suit`, with ranks `0..13` meaning 2 through
//! ace and suits `0..4` meaning spades, hearts, diamonds, clubs. On the wire a
//! card is two characters (`"As"`, `"Td"`, `"7c"`), matching the TypeScript
//! `Card` type in `src/engine/types.ts`.

use std::fmt;

use serde::{Deserialize, Deserializer, Serialize, Serializer};

pub const RANK_CHARS: [char; 13] = [
    '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A',
];
pub const SUIT_CHARS: [char; 4] = ['s', 'h', 'd', 'c'];

/// Rank index of an ace.
pub const ACE: u8 = 12;

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Card(u8);

impl Card {
    /// Build from rank `0..13` (2..A) and suit `0..4` (s, h, d, c).
    pub const fn new(rank: u8, suit: u8) -> Card {
        debug_assert!(rank < 13 && suit < 4);
        Card(rank * 4 + suit)
    }

    /// Build from the raw index `0..52`.
    pub const fn from_index(i: u8) -> Card {
        debug_assert!(i < 52);
        Card(i)
    }

    pub const fn index(self) -> u8 {
        self.0
    }

    /// `0..13`, 2 through ace.
    pub const fn rank(self) -> u8 {
        self.0 / 4
    }

    /// `0..4`: spades, hearts, diamonds, clubs.
    pub const fn suit(self) -> u8 {
        self.0 % 4
    }

    pub fn parse(s: &str) -> Option<Card> {
        let mut it = s.chars();
        let r = it.next()?;
        let su = it.next()?;
        if it.next().is_some() {
            return None;
        }
        let rank = RANK_CHARS
            .iter()
            .position(|&c| c == r.to_ascii_uppercase())?;
        let suit = SUIT_CHARS
            .iter()
            .position(|&c| c == su.to_ascii_lowercase())?;
        Some(Card::new(rank as u8, suit as u8))
    }
}

impl fmt::Display for Card {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}{}",
            RANK_CHARS[self.rank() as usize],
            SUIT_CHARS[self.suit() as usize]
        )
    }
}

impl fmt::Debug for Card {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self, f)
    }
}

impl Serialize for Card {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.collect_str(self)
    }
}

impl<'de> Deserialize<'de> for Card {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Card, D::Error> {
        let s = String::deserialize(d)?;
        Card::parse(&s).ok_or_else(|| serde::de::Error::custom(format!("bad card {s:?}")))
    }
}

/// Parse a space-separated list like `"As Kd 7c"`. Panics on bad input; meant for tests.
pub fn cards(s: &str) -> Vec<Card> {
    s.split_whitespace()
        .map(|c| Card::parse(c).unwrap_or_else(|| panic!("bad card {c:?}")))
        .collect()
}

/// All 52 cards in index order.
pub fn full_deck() -> Vec<Card> {
    (0..52).map(Card::from_index).collect()
}

/// A set of cards as a 52-bit mask, for fast "is this card already out" checks.
#[derive(Clone, Copy, Default, PartialEq, Eq, Debug)]
pub struct CardSet(u64);

impl CardSet {
    pub fn of(cards: &[Card]) -> CardSet {
        let mut s = CardSet::default();
        for &c in cards {
            s.insert(c);
        }
        s
    }
    pub fn insert(&mut self, c: Card) {
        self.0 |= 1 << c.index();
    }
    pub fn contains(self, c: Card) -> bool {
        self.0 & (1 << c.index()) != 0
    }
    pub fn len(self) -> u32 {
        self.0.count_ones()
    }
    pub fn is_empty(self) -> bool {
        self.0 == 0
    }
    /// Every card not in the set.
    pub fn remaining(self) -> Vec<Card> {
        (0..52)
            .map(Card::from_index)
            .filter(|&c| !self.contains(c))
            .collect()
    }
}

/// xoshiro256** seeded through SplitMix64. Small, fast, deterministic on every
/// platform, and serializable, so a room can persist its RNG between messages.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rng {
    s: [u64; 4],
}

impl Rng {
    pub fn seeded(seed: u64) -> Rng {
        let mut x = seed;
        let mut next = || {
            x = x.wrapping_add(0x9E37_79B9_7F4A_7C15);
            let mut z = x;
            z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
            z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
            z ^ (z >> 31)
        };
        Rng {
            s: [next(), next(), next(), next()],
        }
    }

    pub fn next_u64(&mut self) -> u64 {
        let result = self.s[1].wrapping_mul(5).rotate_left(7).wrapping_mul(9);
        let t = self.s[1] << 17;
        self.s[2] ^= self.s[0];
        self.s[3] ^= self.s[1];
        self.s[1] ^= self.s[2];
        self.s[0] ^= self.s[3];
        self.s[2] ^= t;
        self.s[3] = self.s[3].rotate_left(45);
        result
    }

    /// Uniform integer in `0..n` (Lemire's multiply-shift; bias is negligible for card-sized n).
    pub fn below(&mut self, n: u32) -> u32 {
        debug_assert!(n > 0);
        (((self.next_u64() >> 32) * n as u64) >> 32) as u32
    }

    /// Uniform float in `[0, 1)`.
    pub fn unit(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }

    /// Fisher–Yates shuffle.
    pub fn shuffle<T>(&mut self, v: &mut [T]) {
        for i in (1..v.len()).rev() {
            let j = self.below(i as u32 + 1) as usize;
            v.swap(i, j);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_every_card() {
        for c in full_deck() {
            assert_eq!(Card::parse(&c.to_string()), Some(c));
        }
        assert_eq!(full_deck().len(), 52);
    }

    #[test]
    fn parses_and_rejects() {
        assert_eq!(Card::parse("As"), Some(Card::new(ACE, 0)));
        assert_eq!(Card::parse("td"), Some(Card::new(8, 2)));
        assert_eq!(Card::parse("1s"), None);
        assert_eq!(Card::parse("Ax"), None);
        assert_eq!(Card::parse("Asd"), None);
        assert_eq!(Card::parse(""), None);
    }

    #[test]
    fn serializes_as_two_chars() {
        let json = serde_json::to_string(&cards("As 7c")).unwrap();
        assert_eq!(json, r#"["As","7c"]"#);
        let back: Vec<Card> = serde_json::from_str(&json).unwrap();
        assert_eq!(back, cards("As 7c"));
    }

    #[test]
    fn rng_is_deterministic_and_shuffles_fairly() {
        let mut a = Rng::seeded(7);
        let mut b = Rng::seeded(7);
        for _ in 0..100 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
        // Position 0 after a shuffle should be roughly uniform over 52 cards.
        let mut counts = [0u32; 52];
        let mut rng = Rng::seeded(42);
        for _ in 0..52_000 {
            let mut d = full_deck();
            rng.shuffle(&mut d);
            counts[d[0].index() as usize] += 1;
        }
        for c in counts {
            assert!((800..1200).contains(&c), "skewed shuffle: {c}");
        }
    }

    #[test]
    fn cardset_tracks_membership() {
        let s = CardSet::of(&cards("As Kd"));
        assert!(s.contains(Card::parse("As").unwrap()));
        assert!(!s.contains(Card::parse("Ks").unwrap()));
        assert_eq!(s.len(), 2);
        assert_eq!(s.remaining().len(), 50);
    }
}
