//! The regulars: bots that fill empty chairs.
//!
//! A bot decides from its own `GameView`, the same redacted view a human gets,
//! so it cannot peek. Each decision runs one Monte Carlo pass over everything
//! it can't see: teammates' hole cards, the House's hands, and the rest of the
//! board, all dealt together so the shared board's correlations are real.
//! Samples are weighted by how well a teammate's sampled hand fits the calls
//! they made: a raise makes "they hold a winner" more likely.
//!
//! From that pass it gets three numbers: the chance its own hand loses to the
//! House (that's heat), and the crew's chance of winning with it in or out
//! (that's take). It then picks the call that maximises expected take minus
//! heat, with heat priced by how the night stands: far from the target with
//! room to burn, riding a teammate's raise is a good deal; one step from a
//! raid, it isn't.

use crate::card::{Card, CardSet, Rng};
use crate::eval::score_best;
use crate::game::Stance;
use crate::rules::{MAX_STAKE, RuleId};
use crate::view::{CallView, GameView, Slot};

/// How a regular plays. `boldness` tilts toward raising (positive) or caution
/// (negative); `samples` trades accuracy for CPU.
#[derive(Clone, Copy, Debug)]
pub struct Temperament {
    pub boldness: f64,
    pub samples: u32,
    /// How hard to guard heat. Multiplies the exchange rate, and makes big
    /// stakes costlier as the room before a raid shrinks.
    pub caution: f64,
}

/// Default caution, tuned by `crates/sim`.
pub const CAUTION: f64 = 1.0;

impl Temperament {
    /// A stable temperament per seat, so each regular has a consistent style.
    pub fn for_seat(pid: &str) -> Temperament {
        let h = pid.bytes().fold(0xcbf2_9ce4_8422_2325u64, |h, b| {
            (h ^ u64::from(b)).wrapping_mul(0x100_0000_01b3)
        });
        let boldness = ((h % 1000) as f64 / 1000.0 - 0.5) * 0.2;
        Temperament {
            boldness,
            samples: 500,
            caution: CAUTION,
        }
    }
}

fn card(s: &Slot) -> Option<Card> {
    match s {
        Slot::Card(c) => Some(*c),
        _ => None,
    }
}

/// How much one point of heat costs in points of take, from where the night
/// stands. A crew far from its target with plenty of room before a raid buys
/// take with heat cheaply; a crew near the limit, or already past its target,
/// guards every point of heat.
pub fn exchange_rate(view: &GameView) -> f64 {
    let need = f64::from(view.target.saturating_sub(view.take)).max(0.5);
    let room = f64::from(view.heat_limit.saturating_sub(view.heat)).max(0.5);
    (need / room).clamp(0.4, 5.0)
}

/// What one seat believes about the hand, from one Monte Carlo pass.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Odds {
    /// Chance this seat's own hand loses to the mask watching it (draws heat if in).
    pub lose: f64,
    /// Chance the crew's champion beats the House with this seat in.
    pub crew_with: f64,
    /// Chance the crew's champion beats the House if this seat folds.
    pub crew_without: f64,
}

/// What a teammate's calls suggest about their hand.
#[derive(Clone, Copy, Debug)]
struct Signal {
    raises: u32,
    hidden: u32,
    streets_survived: u32,
}

impl Signal {
    /// Relative likelihood of these calls given whether the sampled hand beats the House.
    fn weight(self, beats: bool) -> f64 {
        let mut w = 1.0;
        for _ in 0..self.raises {
            w *= if beats { 2.6 } else { 0.7 };
        }
        for _ in 0..self.hidden {
            w *= if beats { 1.3 } else { 0.9 };
        }
        for _ in 0..self.streets_survived {
            w *= if beats { 1.1 } else { 0.95 };
        }
        w
    }
}

struct Mate {
    known: Option<[Card; 2]>,
    signal: Signal,
}

/// One weighted Monte Carlo pass from `me`'s point of view.
pub fn odds(view: &GameView, me: &str, samples: u32, rng: &mut Rng) -> Option<Odds> {
    let seat = view.seats.iter().find(|s| s.id == me)?;
    let hole: Vec<Card> = seat.cards.iter().filter_map(card).collect();
    let [a, b] = hole[..] else { return None };
    let board: Vec<Card> = view.board.iter().filter_map(card).collect();
    let lowball = view.rule == Some(RuleId::Gyaku);
    let serpent = view.rule == Some(RuleId::Hebi);
    let watcher = seat.watcher.unwrap_or(0);

    let mut seen = CardSet::of(&hole);
    for &c in &board {
        seen.insert(c);
    }
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
    for c in house.iter().flatten().flatten() {
        seen.insert(*c);
    }
    let mates: Vec<Mate> = view
        .seats
        .iter()
        .filter(|s| s.active && s.id != me)
        .map(|s| {
            let cards: Vec<Card> = s.cards.iter().filter_map(card).collect();
            let known = match cards[..] {
                [x, y] => Some([x, y]),
                _ => None,
            };
            let mut signal = Signal {
                raises: 0,
                hidden: 0,
                streets_survived: 0,
            };
            for c in s.calls.iter().flatten() {
                match c {
                    CallView::Made(Stance::Raise) => signal.raises += 1,
                    CallView::Hidden => signal.hidden += 1,
                    CallView::Made(Stance::Stay) => signal.streets_survived += 1,
                    CallView::Made(Stance::Fold) => {}
                }
            }
            Mate { known, signal }
        })
        .collect();
    // Any face-up seat cards (Fox) are out of the deck too.
    for s in &view.seats {
        for c in s.cards.iter().filter_map(card) {
            seen.insert(c);
        }
    }
    let deck = seen.remaining();

    let better = |x: u32, y: u32| if lowball { x < y } else { x > y };
    let mut live = deck.clone();
    let mut full_board = [a; 5];
    let (mut w_total, mut w_lose, mut w_with, mut w_without) = (0.0, 0.0, 0.0, 0.0);
    let mut seven = [a; 7];

    for _ in 0..samples.max(1) {
        // Partial Fisher–Yates: draw exactly the unseen cards this sample needs.
        let mut next = 0usize;
        let mut draw = |rng: &mut Rng| {
            let j = next + rng.below((live.len() - next) as u32) as usize;
            live.swap(next, j);
            next += 1;
            live[next - 1]
        };
        for (i, slot) in full_board.iter_mut().enumerate() {
            *slot = match board.get(i) {
                Some(&c) => c,
                None => draw(rng),
            };
        }
        seven[2..].copy_from_slice(&full_board);

        // The House's best (or weakest, under Reversal), and the hand of the
        // mask watching this seat, which is what its heat check faces.
        let mut house_top: Option<u32> = None;
        let mut watched = 0;
        for (i, h) in house.iter().enumerate() {
            seven[0] = h[0].unwrap_or_else(|| draw(rng));
            seven[1] = h[1].unwrap_or_else(|| draw(rng));
            let s = score_best(&seven);
            if i == watcher.min(house.len() - 1) {
                watched = s;
            }
            house_top = Some(match house_top {
                Some(t) if !better(s, t) => t,
                _ => s,
            });
        }
        let house_top = house_top.unwrap_or(0);

        seven[0] = a;
        seven[1] = b;
        let mine = score_best(&seven);
        let i_lose = better(watched, mine) || (serpent && mine == watched);

        let mut weight = 1.0;
        let mut mates_best: Option<u32> = None;
        for m in &mates {
            let [x, y] = m.known.unwrap_or_else(|| [draw(rng), draw(rng)]);
            seven[0] = x;
            seven[1] = y;
            let s = score_best(&seven);
            if m.known.is_none() {
                weight *= m.signal.weight(better(s, house_top));
            }
            mates_best = Some(match mates_best {
                Some(t) if !better(s, t) => t,
                _ => s,
            });
        }
        let crew_with = match mates_best {
            Some(t) if better(t, mine) => t,
            _ => mine,
        };
        w_total += weight;
        if i_lose {
            w_lose += weight;
        }
        if better(crew_with, house_top) {
            w_with += weight;
        }
        if mates_best.is_some_and(|t| better(t, house_top)) {
            w_without += weight;
        }
        // Put the drawn cards back in play for the next sample.
        live.copy_from_slice(&deck);
    }
    Some(Odds {
        lose: w_lose / w_total,
        crew_with: w_with / w_total,
        crew_without: w_without / w_total,
    })
}

/// The value of each call, in points of take, for tests and tuning.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Read {
    pub odds: Odds,
    pub fold: f64,
    pub stay: f64,
    pub raise: Option<f64>,
}

pub fn read(view: &GameView, me: &str, t: Temperament, rng: &mut Rng) -> Option<Read> {
    let seat = view.seats.iter().find(|s| s.id == me)?;
    let o = odds(view, me, t.samples, rng)?;
    let room = f64::from(view.heat_limit.saturating_sub(view.heat)).max(0.5);
    let base = exchange_rate(view) * t.caution;
    // A raid is a cliff, not a slope: a stake that could eat a big share of the
    // remaining room costs more than its average.
    let lambda_for = |stake: f64| base * (1.0 + t.caution * stake / room);
    let mult = if view.rule == Some(RuleId::Homura) {
        2.0
    } else {
        1.0
    };
    let stake = f64::from(seat.stake.unwrap_or(1));
    let others_in = view.seats.iter().filter(|s| s.active && s.id != me).count();
    // Under Hush, a teammate's stake is unknown; assume a little above the floor.
    let other_stakes: f64 = view
        .seats
        .iter()
        .filter(|s| s.active && s.id != me)
        .map(|s| s.stake.map_or(1.4, f64::from))
        .sum();

    // Staying keeps the option to fold on a later street; worth a little early.
    let option = 0.08 * f64::from(3u8.saturating_sub(view.street)) * stake;
    // Folding only works if someone else carries the hand. Teammates decide at
    // the same moment, so guess how likely each is to stay from their calls.
    let p_all_fold: f64 = view
        .seats
        .iter()
        .filter(|s| s.active && s.id != me)
        .map(|s| {
            let raised = s
                .calls
                .iter()
                .flatten()
                .any(|c| matches!(c, CallView::Made(Stance::Raise)));
            let p_stay = if raised {
                0.95
            } else if view.street == 0 {
                0.55
            } else {
                0.75
            };
            1.0 - p_stay
        })
        .product();
    let fold = if others_in == 0 {
        -lambda_for(1.0) * mult
    } else {
        mult * (other_stakes * o.crew_without * (1.0 - p_all_fold) - lambda_for(1.0) * p_all_fold)
    };
    let stay =
        mult * ((other_stakes + stake) * o.crew_with - lambda_for(stake) * stake * o.lose) + option;
    let raise = (seat.stake.unwrap_or(1) < MAX_STAKE).then(|| {
        if view.rule == Some(RuleId::Kizuna) {
            // Bond lifts every active stake: more take for all, more heat for
            // anyone who loses. Approximate teammates' loss rate by the crew's.
            let lift = (others_in + 1) as f64;
            let mates_lose = others_in as f64 * (1.0 - o.crew_without).max(0.3);
            mult * ((other_stakes + stake + lift) * o.crew_with
                - lambda_for(stake + 1.0) * ((stake + 1.0) * o.lose + mates_lose))
                + option
                + t.boldness
        } else {
            mult * ((other_stakes + stake + 1.0) * o.crew_with
                - lambda_for(stake + 1.0) * (stake + 1.0) * o.lose)
                + option
                + t.boldness
        }
    });
    Some(Read {
        odds: o,
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
    let jitter = |rng: &mut Rng| (rng.unit() - 0.5) * 0.08;
    let fold = r.fold + jitter(rng);
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
        g.fox = None;
        let hole = cards(mine);
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
        samples: 4000,
        caution: CAUTION,
    };

    #[test]
    fn aces_raise() {
        let (_, v) = heads_up("As Ah", 0);
        assert_eq!(decide(&v, "s1", CALM, &mut Rng::seeded(1)), Stance::Raise);
    }

    #[test]
    fn odds_are_probabilities_and_seven_deuce_is_an_underdog() {
        let (_, v) = heads_up("7c 2d", 0);
        let o = odds(&v, "s1", 4000, &mut Rng::seeded(1)).unwrap();
        for p in [o.lose, o.crew_with, o.crew_without] {
            assert!((0.0..=1.0).contains(&p));
        }
        assert!(
            o.lose > 0.55,
            "seven-deuce loses more often than not: {o:?}"
        );
        assert!(
            o.crew_with >= o.crew_without,
            "an extra hand never hurts the crew's best"
        );
    }

    #[test]
    fn crew_odds_capture_the_shared_board() {
        // Two random hands vs one House hand: the crew's best wins well under the
        // naive independent estimate of 75%, because they share five cards.
        let (_, v) = heads_up("9c 8d", 0);
        let o = odds(&v, "s1", 20_000, &mut Rng::seeded(2)).unwrap();
        assert!(o.crew_with < 0.72 && o.crew_with > 0.55, "{o:?}");
    }

    #[test]
    fn a_teammates_raises_make_riding_attractive() {
        let (mut g, v0) = heads_up("7c 2d", 0);
        let quiet = odds(&v0, "s1", 6000, &mut Rng::seeded(3)).unwrap();
        g.seats[0].calls = [Some(Stance::Raise), Some(Stance::Raise), None, None];
        g.seats[0].stake = 3;
        g.street = 2;
        let v = view_for(&g, Some("s1"), 0);
        let loud = odds(&v, "s1", 6000, &mut Rng::seeded(3)).unwrap();
        assert!(
            loud.crew_without > quiet.crew_without + 0.1,
            "raises should signal a winner: {quiet:?} vs {loud:?}"
        );
    }

    #[test]
    fn trash_folds_when_heat_is_precious() {
        let (mut g, _) = heads_up("7c 2d", 0);
        g.heat = g.heat_limit - 1;
        g.street = 3;
        let v = view_for(&g, Some("s1"), 0);
        let r = read(&v, "s1", CALM, &mut Rng::seeded(4)).unwrap();
        assert!(
            r.fold > r.stay,
            "one heat from a raid, trash should fold: {r:?}"
        );
    }

    #[test]
    fn bots_never_see_hidden_cards() {
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
        assert_eq!(a.boldness, Temperament::for_seat("bot:1").boldness);
        assert!(a.boldness.abs() <= 0.1);
    }
}
