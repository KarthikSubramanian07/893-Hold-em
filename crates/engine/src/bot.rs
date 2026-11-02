//! The regulars: bots that fill empty chairs.
//!
//! A bot decides from its own `GameView`, the same redacted view a human gets,
//! so it cannot peek. It estimates its odds against the House by Monte Carlo,
//! reads the crew's earlier calls as signals, and picks the call that
//! maximises the crew's expected take minus heat. That produces the behaviour
//! the game is about: strong hands raise, weak hands ride a raise, and weak
//! hands with nobody to ride fold.

use crate::card::{Card, Rng};
use crate::equity::{Spot, estimate};
use crate::game::Stance;
use crate::rules::{MAX_STAKE, RuleId};
use crate::view::{CallView, GameView, Slot};

/// How a regular plays. `boldness` tilts toward raising (positive) or caution
/// (negative); `samples` trades accuracy for CPU.
#[derive(Clone, Copy, Debug)]
pub struct Temperament {
    pub boldness: f64,
    pub samples: u32,
}

impl Temperament {
    /// A stable temperament per seat, so each regular has a consistent style.
    pub fn for_seat(pid: &str) -> Temperament {
        let h = pid.bytes().fold(0xcbf2_9ce4_8422_2325u64, |h, b| {
            (h ^ u64::from(b)).wrapping_mul(0x100_0000_01b3)
        });
        let boldness = ((h % 1000) as f64 / 1000.0 - 0.5) * 0.5;
        Temperament {
            boldness,
            samples: 600,
        }
    }
}

fn card(s: &Slot) -> Option<Card> {
    match s {
        Slot::Card(c) => Some(*c),
        _ => None,
    }
}

/// Crew value of `stakes` riding on a win probability `p`: + stakes on a win, - stakes on a loss.
fn value(p: f64, stakes: f64) -> f64 {
    stakes * (2.0 * p - 1.0)
}

/// What this seat believes about the crew's chances, for tests and tuning.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Read {
    pub mine: f64,
    pub others: f64,
    pub fold: f64,
    pub stay: f64,
    pub raise: Option<f64>,
}

pub fn read(view: &GameView, me: &str, t: Temperament, rng: &mut Rng) -> Option<Read> {
    let seat = view.seats.iter().find(|s| s.id == me)?;
    let hole: Vec<Card> = seat.cards.iter().filter_map(card).collect();
    let [a, b] = hole[..] else { return None };
    let board: Vec<Card> = view.board.iter().filter_map(card).collect();
    let house: Vec<[Option<Card>; 2]> = view
        .house
        .iter()
        .map(|h| {
            [
                h.cards.first().and_then(card),
                h.cards.get(1).and_then(card),
            ]
        })
        .collect();
    let dead: Vec<Card> = view
        .seats
        .iter()
        .filter(|s| s.id != me)
        .flat_map(|s| s.cards.iter().filter_map(card))
        .collect();
    let lowball = view.rule == Some(RuleId::Gyaku);
    let spot = Spot {
        hole: [a, b],
        board: &board,
        board_total: 5,
        house: &house,
        dead: &dead,
        lowball,
    };
    let odds = estimate(&spot, t.samples, rng);
    let mine = odds.win + odds.tie * 0.5;

    // Everyone else still in: read their calls as signals of strength.
    let masks = view.house.len().max(1) as f64;
    let prior = 1.0 / (masks + 1.0);
    let mut miss_all = 1.0;
    let mut other_stakes = 0.0;
    let mut others_in = 0;
    for s in view.seats.iter().filter(|s| s.active && s.id != me) {
        others_in += 1;
        other_stakes += s.stake.map_or(1.5, f64::from);
        let mut q = prior;
        for c in s.calls.iter().flatten() {
            q += match c {
                CallView::Made(Stance::Raise) => 0.17,
                CallView::Made(Stance::Stay) => 0.02,
                CallView::Hidden => 0.05,
                CallView::Made(Stance::Fold) => 0.0,
            };
        }
        // A face-up hand (Fox) is not a guess.
        let known: Vec<Card> = s.cards.iter().filter_map(card).collect();
        if let [x, y] = known[..] {
            let spot = Spot {
                hole: [x, y],
                board: &board,
                board_total: 5,
                house: &house,
                dead: &hole,
                lowball,
            };
            let o = estimate(&spot, t.samples / 2, rng);
            q = o.win + o.tie * 0.5;
        }
        miss_all *= 1.0 - q.min(0.9);
    }
    let others = 1.0 - miss_all;
    let with_me = 1.0 - (1.0 - mine) * (1.0 - others);

    let stake = f64::from(seat.stake.unwrap_or(1));
    let streets_left = 3.0 - f64::from(view.street);
    // Staying keeps the option to fold later; that is worth a little early on.
    let option = 0.12 * streets_left;
    let fold = if others_in == 0 {
        -1.0
    } else {
        value(others, other_stakes)
    };
    let stay = value(with_me, other_stakes + stake) + option;
    let raise = (seat.stake.unwrap_or(1) < MAX_STAKE).then(|| {
        let lift = if view.rule == Some(RuleId::Kizuna) {
            f64::from(others_in + 1)
        } else {
            1.0
        };
        value(with_me, other_stakes + stake + lift) + option * 0.5 + t.boldness * lift
    });
    Some(Read {
        mine,
        others,
        fold,
        stay,
        raise,
    })
}

/// Pick a call for seat `me`.
pub fn decide(view: &GameView, me: &str, t: Temperament, rng: &mut Rng) -> Stance {
    let Some(r) = read(view, me, t, rng) else {
        return Stance::Stay;
    };
    // A little noise so regulars are not perfectly predictable.
    let jitter = |rng: &mut Rng| (rng.unit() - 0.5) * 0.1;
    let fold = r.fold + jitter(rng) - t.boldness * 0.5;
    let stay = r.stay + jitter(rng);
    let raise = r.raise.map(|x| x + jitter(rng));
    match raise {
        Some(x) if x > stay && x > fold => Stance::Raise,
        _ if stay >= fold => Stance::Stay,
        _ => Stance::Fold,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::card::cards;
    use crate::game::Game;
    use crate::view::view_for;

    fn heads_up(mine: &str, board_street: u8) -> (Game, GameView) {
        let mut g = Game::new("K7QX2", 3);
        let a = g.join("pid-aaaaaaaa", "A", "koi").unwrap();
        g.add_bot(&a).unwrap();
        g.start(&a, 0).unwrap();
        g.rule = None;
        let hole = cards(mine);
        // Make sure the forced hole cards are not also elsewhere.
        let s = g.seats.iter_mut().find(|s| s.id == "s1").unwrap();
        s.hole = hole.clone();
        let mut deck: Vec<Card> = crate::card::full_deck()
            .into_iter()
            .filter(|c| !hole.contains(c))
            .collect();
        let mut rng = Rng::seeded(5);
        rng.shuffle(&mut deck);
        g.seats[0].hole = vec![deck.pop().unwrap(), deck.pop().unwrap()];
        g.house = vec![[deck.pop().unwrap(), deck.pop().unwrap()]];
        g.board = (0..5).map(|_| deck.pop().unwrap()).collect();
        g.street = board_street;
        let v = view_for(&g, Some("s1"), 0);
        (g, v)
    }

    const CALM: Temperament = Temperament {
        boldness: 0.0,
        samples: 3000,
    };

    #[test]
    fn aces_raise() {
        let (_, v) = heads_up("As Ah", 0);
        let mut rng = Rng::seeded(1);
        assert_eq!(decide(&v, "s1", CALM, &mut rng), Stance::Raise);
    }

    #[test]
    fn reads_are_in_range() {
        let (_, v) = heads_up("7c 2d", 0);
        let r = read(&v, "s1", CALM, &mut Rng::seeded(1)).unwrap();
        assert!((0.0..=1.0).contains(&r.mine));
        assert!((0.0..=1.0).contains(&r.others));
        assert!(
            r.mine < 0.45,
            "seven-deuce should be an underdog: {}",
            r.mine
        );
    }

    #[test]
    fn a_weak_hand_rides_a_teammates_raises() {
        let (mut g, _) = heads_up("7c 2d", 0);
        // Seat s0 raised twice already; s1 holds trash.
        g.seats[0].calls = [Some(Stance::Raise), Some(Stance::Raise), None, None];
        g.seats[0].stake = 3;
        g.street = 2;
        let v = view_for(&g, Some("s1"), 0);
        let r = read(&v, "s1", CALM, &mut Rng::seeded(2)).unwrap();
        assert!(
            r.stay > r.fold,
            "riding a strong teammate should beat folding: {r:?}"
        );
    }

    #[test]
    fn bots_never_see_hidden_cards() {
        // decide() only receives a GameView; this guards the contract.
        let (g, v) = heads_up("As Ah", 0);
        let other = &g.seats[0].hole;
        assert!(
            v.seats[0].cards.iter().all(|c| *c == Slot::Back),
            "{other:?} leaked into the bot's view"
        );
        assert!(v.house[0].cards.iter().all(|c| *c == Slot::Back));
    }

    #[test]
    fn temperament_is_stable_and_bounded() {
        let a = Temperament::for_seat("bot:1");
        let b = Temperament::for_seat("bot:1");
        assert_eq!(a.boldness, b.boldness);
        assert!(a.boldness.abs() <= 0.25);
    }
}
