//! Monte Carlo odds for bots and for balancing.
//!
//! Each sample deals the unseen cards uniformly without replacement (a partial
//! Fisher–Yates over the live deck), completes the board and every face-down
//! House card, and scores the player against the House's best hand. Hands are
//! kept as [`card_mask`] bitmasks so completing a seven-card hand is a few ORs
//! and scoring it is one call to [`score_mask`].

use crate::card::{Card, Rng};
use crate::eval::{card_mask, hand_mask, score_mask};

/// What one player knows when estimating whether their hand beats the House.
pub struct Spot<'a> {
    /// The player's hole cards.
    pub hole: [Card; 2],
    /// Board cards visible to this player (0, 3, 4, or 5 of them).
    pub board: &'a [Card],
    /// Number of board cards that will exist at the showdown (normally 5).
    pub board_total: usize,
    /// Each House hand: known (face-up) hole cards, `None` for face-down ones.
    pub house: &'a [[Option<Card>; 2]],
    /// Other cards this player can see that are out of the deck (other crew members' face-up cards).
    pub dead: &'a [Card],
    /// Lowball: the lower score wins.
    pub lowball: bool,
}

/// Probability estimates from the player's point of view, against the House's
/// best hand (max over House hands, or min under lowball).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Odds {
    pub win: f64,
    pub tie: f64,
    pub lose: f64,
}

/// The most House hands one estimate handles. A real table has at most four.
const MAX_HOUSE: usize = 16;

/// Estimate by sampling `samples` completions of the unseen cards.
///
/// Deterministic for a given `rng` state. When nothing is unknown (full board,
/// every House card face up) the answer is exact and a single evaluation is
/// done whatever `samples` says. With no House hands at all the player wins.
/// `samples == 0` is treated as 1.
///
/// Panics if more cards are needed than remain in the deck, or if there are
/// more than 16 House hands.
pub fn estimate(spot: &Spot, samples: u32, rng: &mut Rng) -> Odds {
    assert!(
        spot.house.len() <= MAX_HOUSE,
        "too many House hands: {}",
        spot.house.len()
    );

    let hole = hand_mask(&spot.hole);
    let board = hand_mask(spot.board);
    let mut used = hole | board | hand_mask(spot.dead);

    // Known House cards, and how many face-down cards each hand still needs.
    let mut house_known = [0u64; MAX_HOUSE];
    let mut house_missing = [0usize; MAX_HOUSE];
    for (i, hand) in spot.house.iter().enumerate() {
        for card in hand {
            match card {
                Some(c) => {
                    house_known[i] |= card_mask(*c);
                    used |= card_mask(*c);
                }
                None => house_missing[i] += 1,
            }
        }
    }
    let houses = spot.house.len();

    let board_missing = spot.board_total.saturating_sub(spot.board.len());
    let need = board_missing + house_missing[..houses].iter().sum::<usize>();

    // The live deck, as card masks.
    let mut deck = [0u64; 52];
    let mut live = 0usize;
    for i in 0..52u8 {
        let m = card_mask(Card::from_index(i));
        if used & m == 0 {
            deck[live] = m;
            live += 1;
        }
    }
    assert!(
        need <= live,
        "need {need} unseen cards but only {live} remain"
    );

    let samples = if need == 0 { 1 } else { samples.max(1) };
    let (mut wins, mut ties) = (0u32, 0u32);

    for _ in 0..samples {
        // Partial Fisher–Yates: deck[..need] becomes a uniform draw without
        // replacement. Leaving the rest permuted is fine; any order works.
        for i in 0..need {
            let j = i + rng.below((live - i) as u32) as usize;
            deck.swap(i, j);
        }

        let mut full_board = board;
        for &m in &deck[..board_missing] {
            full_board |= m;
        }
        let mine = score_mask(full_board | hole);

        let mut next = board_missing;
        let mut house_best = if spot.lowball { u32::MAX } else { 0 };
        for h in 0..houses {
            let mut hand = full_board | house_known[h];
            for &m in &deck[next..next + house_missing[h]] {
                hand |= m;
            }
            next += house_missing[h];
            let s = score_mask(hand);
            house_best = if spot.lowball {
                house_best.min(s)
            } else {
                house_best.max(s)
            };
        }

        if houses == 0 {
            wins += 1;
        } else if mine == house_best {
            ties += 1;
        } else if (mine > house_best) != spot.lowball {
            wins += 1;
        }
    }

    let n = samples as f64;
    let losses = samples - wins - ties;
    Odds {
        win: wins as f64 / n,
        tie: ties as f64 / n,
        lose: losses as f64 / n,
    }
}
