//! Monte Carlo odds for bots and for balancing.
//!
//! STUB: signatures and docs are the contract.

use crate::card::{Card, Rng};

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

/// Estimate by sampling `samples` completions of the unseen cards.
pub fn estimate(_spot: &Spot, _samples: u32, _rng: &mut Rng) -> Odds {
    todo!()
}
