//! The regulars: bots that fill empty chairs.
//!
//! A bot decides from its own `GameView`, the same redacted view a human gets,
//! so it cannot peek. Each decision runs one Monte Carlo pass over everything
//! it can't see: teammates' hole cards, the House's hands, and the rest of the
//! board, all dealt together so the shared board's correlations are real.
//! Samples are weighted by how well a teammate's sampled hand fits the calls
//! they made: a raise makes "they hold a winner" more likely.
//!
//! Every sample is played out to the showdown three times, once per call
//! (fold, stay, raise), with a simple model of what happens on the streets
//! still to come: a hand that is going to lose its heat check tends to fold
//! before the river, and a hand that is going to win tends to raise. That
//! gives, per call, a distribution over this hand's take and heat.
//!
//! The regular then scores each call by the chance the whole night ends in a
//! clean getaway: exact on the last hand, and on earlier hands from a normal
//! approximation of what the remaining hands will add. Because that chance is
//! a curve, not a line, the trade between heat and take shifts on its own as
//! the night goes: behind on take with room to burn, riding a teammate's raise
//! is worth it; a stake from a raid, it isn't; past the target, every point of
//! heat matters and nothing else does. Folding is never free either: if the
//! whole crew steps out the bar notices, so a hand that might be the crew's
//! only one stays in.

use crate::card::{Card, CardSet, Rng};
use crate::eval::score_best;
use crate::game::Stance;
use crate::rules::{HANDS_PER_NIGHT, MAX_STAKE, RuleId, table};
use crate::view::{CallView, GameView, Slot};

/// The numbers behind the policy. `KNOBS` holds the values tuned by
/// `crates/sim`; the simulator can override any of them to search.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Knobs {
    /// Expected take one seat adds to the night per hand still to come.
    pub take_mean: f64,
    /// Spread of a hand's take, per seat. Take is all or nothing, so its
    /// spread grows with the crew, not with its square root.
    pub take_sd: f64,
    /// Expected heat one seat adds per hand still to come.
    pub heat_mean: f64,
    /// Spread of a hand's heat, per square root of a seat.
    pub heat_sd: f64,
    /// Per street still to come, the chance a hand that will lose its heat
    /// check folds before the showdown.
    pub fold_losing: f64,
    /// The same for a hand that will pass its heat check.
    pub fold_passing: f64,
    /// Per street still to come, the chance a hand that passes its heat check
    /// raises once more.
    pub raise_later: f64,
    /// What a raise tells teammates, in points of take.
    pub signal: f64,
    /// Extra cost of raising per point of stake already on the table, in
    /// points of take: the second raise needs a better hand than the first.
    pub stake_tax: f64,
    /// Noise on every call, in points of take, so regulars aren't clockwork.
    pub jitter: f64,
    /// How much more likely a raise is from a teammate who beats the House.
    pub raise_tell: f64,
    /// Extra cost of the whole crew walking, in points of take, on top of
    /// its point of heat: an empty table is a bad look the rules undercharge.
    pub walk_cost: f64,
}

/// The tuned policy. See `crates/sim/README.md` for the search behind it.
pub const KNOBS: Knobs = Knobs {
    take_mean: 0.60,
    take_sd: 0.75,
    heat_mean: 0.42,
    heat_sd: 1.05,
    fold_losing: 0.33,
    fold_passing: 0.03,
    raise_later: 0.14,
    signal: 0.0,
    stake_tax: 0.6,
    jitter: 0.1,
    raise_tell: 2.5,
    walk_cost: 4.0,
};

/// How a regular plays. `boldness` tilts toward raising (positive) or caution
/// (negative), in points of take; `samples` trades accuracy for CPU.
#[derive(Clone, Copy, Debug)]
pub struct Temperament {
    pub boldness: f64,
    pub samples: u32,
    pub knobs: Knobs,
}

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
            knobs: KNOBS,
        }
    }
}

fn card(s: &Slot) -> Option<Card> {
    match s {
        Slot::Card(c) => Some(*c),
        _ => None,
    }
}

/// Complementary error function, with relative error under 1.2e-7 everywhere
/// (Numerical Recipes' `erfcc`), so deep tails still compare sensibly.
fn erfc(x: f64) -> f64 {
    let z = x.abs();
    let t = 1.0 / (1.0 + 0.5 * z);
    let poly = -z * z - 1.265_512_23
        + t * (1.000_023_68
            + t * (0.374_091_96
                + t * (0.096_784_18
                    + t * (-0.186_288_06
                        + t * (0.278_868_07
                            + t * (-1.135_203_98
                                + t * (1.488_515_87 + t * (-0.822_152_23 + t * 0.170_872_77))))))));
    let r = t * poly.exp();
    if x >= 0.0 { r } else { 2.0 - r }
}

/// Standard normal CDF.
fn phi(z: f64) -> f64 {
    0.5 * erfc(-z / std::f64::consts::SQRT_2)
}

/// Where the night stands, and how the hands still to come might go.
#[derive(Clone, Copy, Debug)]
pub struct Night {
    pub take: u32,
    pub heat: u32,
    pub target: u32,
    pub heat_limit: u32,
    /// Hands still to be dealt after this one.
    pub hands_after: u32,
    pub crew: usize,
    /// Chance a later hand draws Blaze (take and heat doubled).
    pub blaze: f64,
}

impl Night {
    pub fn of(view: &GameView) -> Night {
        let deck = table(view.config.difficulty).deck;
        let blaze = if deck.contains(&RuleId::Homura) {
            1.0 / deck.len() as f64
        } else {
            0.0
        };
        Night {
            take: view.take,
            heat: view.heat,
            target: view.target,
            heat_limit: view.heat_limit,
            hands_after: u32::from(HANDS_PER_NIGHT.saturating_sub(view.hand)),
            crew: view.seats.len().max(1),
            blaze,
        }
    }

    /// Chance of a clean getaway once this hand adds `take` and `heat`, with
    /// `hands` hands left to play after it.
    pub fn clean(&self, k: &Knobs, take: u32, heat: u32, hands: u32) -> f64 {
        let take = self.take + take;
        let heat = self.heat + heat;
        if heat >= self.heat_limit {
            return 0.0;
        }
        let need = f64::from(self.target) - f64::from(take);
        let room = f64::from(self.heat_limit - heat);
        if hands == 0 {
            return if need <= 0.0 { 1.0 } else { 0.0 };
        }
        // A sum of `hands` hands, each a seat-scaled draw times Blaze's doubling.
        let n = self.crew as f64;
        let h = f64::from(hands);
        let (m1, m2) = (1.0 + self.blaze, 1.0 + 3.0 * self.blaze);
        let moments = |mean: f64, sd: f64| {
            let mu = mean * m1;
            let var = (sd * sd + mean * mean) * m2 - mu * mu;
            (h * mu, (h * var).max(1e-6).sqrt())
        };
        let (tm, ts) = moments(k.take_mean * n, k.take_sd * n);
        let (hm, hs) = moments(k.heat_mean * n, k.heat_sd * n.sqrt());
        // Integer counters: take >= need, heat <= room - 1.
        let p_take = if need <= 0.0 {
            1.0
        } else {
            phi((tm - need + 0.5) / ts)
        };
        let p_heat = phi((room - 0.5 - hm) / hs);
        p_take * p_heat
    }

    /// What one more point of take (or one point of heat avoided) is worth
    /// right now, in chance of a clean night. The unit for bonuses and noise.
    pub fn unit(&self, k: &Knobs) -> f64 {
        let hands = self.hands_after + 1;
        let here = self.clean(k, 0, 0, hands);
        let richer = self.clean(k, 1, 0, hands);
        let hotter = self.clean(k, 0, 1, hands);
        (richer - here).max(here - hotter).max(1e-12)
    }
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
    fn weight(self, beats: bool, tell: f64) -> f64 {
        let mut w = 1.0;
        for _ in 0..self.raises {
            w *= if beats { tell } else { 1.0 / tell.sqrt() };
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
    /// `None` under Hush.
    stake: Option<u8>,
    watcher: usize,
}

/// Size of one side of an outcome histogram: take or heat from one hand,
/// at most six stakes of three, doubled.
const BINS: usize = 37;

/// One Monte Carlo pass: the odds, and for each call the distribution of what
/// this hand adds to the night, as weighted (take, heat) histograms.
struct Pass {
    odds: Odds,
    total: f64,
    /// Weighted chance each call ends with the whole crew walking.
    walks: [f64; 3],
    fold: Vec<f64>,
    stay: Vec<f64>,
    raise: Vec<f64>,
}

/// Chance that something with per-street chance `p` happens in `streets` tries.
fn over(p: f64, streets: u8) -> f64 {
    1.0 - (1.0 - p.clamp(0.0, 1.0)).powi(i32::from(streets))
}

fn pass(view: &GameView, me: &str, t: &Temperament, rng: &mut Rng) -> Option<Pass> {
    let k = &t.knobs;
    let seat = view.seats.iter().find(|s| s.id == me)?;
    let hole: Vec<Card> = seat.cards.iter().filter_map(card).collect();
    let [a, b] = hole[..] else { return None };
    let board: Vec<Card> = view.board.iter().filter_map(card).collect();
    let lowball = view.rule == Some(RuleId::Gyaku);
    let serpent = view.rule == Some(RuleId::Hebi);
    let bond = view.rule == Some(RuleId::Kizuna);
    let mult = if view.rule == Some(RuleId::Homura) {
        2
    } else {
        1
    };
    if view.house.is_empty() {
        return None;
    }
    let last_mask = view.house.len() - 1;
    let my_watcher = seat.watcher.unwrap_or(0).min(last_mask);
    let my_stake = seat.stake.unwrap_or(1);

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
            Mate {
                known,
                signal,
                stake: s.stake,
                watcher: s.watcher.unwrap_or(0).min(last_mask),
            }
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
    let pick = |x: Option<u32>, y: u32| match x {
        Some(t) if !better(y, t) => Some(t),
        _ => Some(y),
    };
    // A heat check: does the watching mask beat this hand?
    let burns = |mask: u32, hand: u32| better(mask, hand) || (serpent && mask == hand);

    // Streets still to come after this call, for this seat and for teammates
    // deciding at the same moment.
    let later = 3u8.saturating_sub(view.street);
    let now_and_later = later + 1;
    let my_fold_losing = over(k.fold_losing, later);
    let my_fold_passing = over(k.fold_passing, later);
    let my_raise_later = over(k.raise_later, later);
    let mate_fold_losing = over(k.fold_losing, now_and_later);
    let mate_fold_passing = over(k.fold_passing, now_and_later);
    let mate_raise_later = over(k.raise_later, now_and_later);
    // Under Hush a teammate's stake is unseen; each hidden call raised with
    // about the chance a regular raises.
    let hidden_raise = 0.15;

    let mut live = deck.clone();
    let mut full_board = [a; 5];
    let mut seven = [a; 7];
    let mut masks = [0u32; 8];
    let mut scores = [0u32; 8];
    let mut lose = [false; 8];
    let mut stakes = [0u8; 8];
    let mut out = [false; 8];
    let mut up = [false; 8];
    let (mut w_total, mut w_lose, mut w_with, mut w_without) = (0.0, 0.0, 0.0, 0.0);
    let mut walks = [0.0; 3];
    let mut fold = vec![0.0; BINS * BINS];
    let mut stay = vec![0.0; BINS * BINS];
    let mut raise = vec![0.0; BINS * BINS];
    let bin = |take: u32, heat: u32| {
        (take * mult).min(BINS as u32 - 1) as usize * BINS
            + (heat * mult).min(BINS as u32 - 1) as usize
    };

    for _ in 0..t.samples.max(1) {
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

        // The House's best (or weakest, under Reversal), and every mask's
        // hand, since each mask runs the heat check for the seats it watches.
        let mut house_top: Option<u32> = None;
        for (i, h) in house.iter().enumerate() {
            seven[0] = h[0].unwrap_or_else(|| draw(rng));
            seven[1] = h[1].unwrap_or_else(|| draw(rng));
            masks[i] = score_best(&seven);
            house_top = pick(house_top, masks[i]);
        }
        let top = house_top.unwrap_or(0);

        seven[0] = a;
        seven[1] = b;
        let mine = score_best(&seven);
        let i_lose = burns(masks[my_watcher], mine);

        let mut weight = 1.0;
        let mut mates_best: Option<u32> = None;
        for (j, m) in mates.iter().enumerate() {
            let [x, y] = m.known.unwrap_or_else(|| [draw(rng), draw(rng)]);
            seven[0] = x;
            seven[1] = y;
            let s = score_best(&seven);
            if m.known.is_none() {
                weight *= m.signal.weight(better(s, top), k.raise_tell);
            }
            scores[j] = s;
            lose[j] = burns(masks[m.watcher], s);
            stakes[j] = m.stake.unwrap_or_else(|| {
                let raised = (0..m.signal.hidden)
                    .filter(|_| rng.unit() < hidden_raise)
                    .count();
                (1 + raised as u8).min(MAX_STAKE)
            });
            mates_best = pick(mates_best, s);
        }
        let crew_with = match mates_best {
            Some(t) if better(t, mine) => t,
            _ => mine,
        };
        w_total += weight;
        if i_lose {
            w_lose += weight;
        }
        if better(crew_with, top) {
            w_with += weight;
        }
        if mates_best.is_some_and(|t| better(t, top)) {
            w_without += weight;
        }

        // The rest of the hand: who folds before the showdown, who raises.
        for j in 0..mates.len() {
            let p = if lose[j] {
                mate_fold_losing
            } else {
                mate_fold_passing
            };
            out[j] = rng.unit() < p;
            up[j] = !out[j] && !lose[j] && rng.unit() < mate_raise_later;
        }
        let my_p = if i_lose {
            my_fold_losing
        } else {
            my_fold_passing
        };
        let my_out = rng.unit() < my_p;
        let my_up = !my_out && !i_lose && rng.unit() < my_raise_later;

        // The teammates who reach the showdown, with every stake lifted by
        // `lift` (Bond): their best hand, their stakes, and their heat.
        let mates_at = |lift: u8| {
            let (mut best, mut take, mut heat) = (None, 0u32, 0u32);
            for j in 0..mates.len() {
                if out[j] {
                    continue;
                }
                let s = u32::from((stakes[j] + lift + u8::from(up[j])).min(MAX_STAKE));
                take += s;
                if lose[j] {
                    heat += s;
                }
                best = pick(best, scores[j]);
            }
            (best, take, heat)
        };
        // How the hand ends if this seat isn't at the showdown.
        let nobody_left = out[..mates.len()].iter().all(|&o| o);
        let without = |lift: u8| {
            let (best, take, heat) = mates_at(lift);
            match best {
                None => (0, 1),
                Some(c) if better(c, top) => (take, heat),
                Some(_) => (0, heat),
            }
        };
        // And if it is, with `stake` after this call.
        let with = |stake: u8, lift: u8| {
            if my_out {
                return without(lift);
            }
            let (best, take, heat) = mates_at(lift);
            let s = u32::from((stake + u8::from(my_up)).min(MAX_STAKE));
            let champion = match best {
                Some(c) if better(c, mine) => c,
                _ => mine,
            };
            let take = if better(champion, top) { take + s } else { 0 };
            (take, heat + if i_lose { s } else { 0 })
        };
        let (ft, fh) = without(0);
        fold[bin(ft, fh)] += weight;
        let (st, sh) = with(my_stake, 0);
        stay[bin(st, sh)] += weight;
        if nobody_left {
            walks[0] += weight;
            if my_out {
                walks[1] += weight;
                walks[2] += weight;
            }
        }
        if my_stake < MAX_STAKE {
            let (rt, rh) = with(my_stake + 1, u8::from(bond));
            raise[bin(rt, rh)] += weight;
        }
        // Put the drawn cards back in play for the next sample.
        live.copy_from_slice(&deck);
    }
    Some(Pass {
        odds: Odds {
            lose: w_lose / w_total,
            crew_with: w_with / w_total,
            crew_without: w_without / w_total,
        },
        total: w_total,
        walks: walks.map(|w| w / w_total),
        fold,
        stay,
        raise,
    })
}

/// One weighted Monte Carlo pass from `me`'s point of view.
pub fn odds(view: &GameView, me: &str, samples: u32, rng: &mut Rng) -> Option<Odds> {
    let t = Temperament {
        boldness: 0.0,
        samples,
        knobs: KNOBS,
    };
    pass(view, me, &t, rng).map(|p| p.odds)
}

/// Each call's chance of a clean night, for tests and tuning.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Read {
    pub odds: Odds,
    pub fold: f64,
    pub stay: f64,
    /// Includes the raise's signal and stake terms. `None` at the cap.
    pub raise: Option<f64>,
    /// What one point of take is worth right now, in the same units.
    pub unit: f64,
}

pub fn read(view: &GameView, me: &str, t: Temperament, rng: &mut Rng) -> Option<Read> {
    let seat = view.seats.iter().find(|s| s.id == me)?;
    let p = pass(view, me, &t, rng)?;
    let k = &t.knobs;
    let night = Night::of(view);
    let hands = night.hands_after;
    let value = |hist: &[f64]| {
        let mut v = 0.0;
        for (i, &w) in hist.iter().enumerate() {
            if w > 0.0 {
                let (take, heat) = ((i / BINS) as u32, (i % BINS) as u32);
                v += w * night.clean(k, take, heat, hands);
            }
        }
        v / p.total
    };
    let unit = night.unit(k);
    let stake = seat.stake.unwrap_or(1);
    // A raise only tells teammates something while they still have calls to make.
    let signal = k.signal * f64::from(3u8.saturating_sub(view.street)) / 3.0;
    let walk = |i: usize| unit * k.walk_cost * p.walks[i];
    let raise = (stake < MAX_STAKE).then(|| {
        value(&p.raise) - walk(2)
            + unit * (signal + t.boldness - k.stake_tax * f64::from(stake - 1))
    });
    Some(Read {
        odds: p.odds,
        fold: value(&p.fold) - walk(0),
        stay: value(&p.stay) - walk(1),
        raise,
        unit,
    })
}

/// Pick a call for seat `me`.
pub fn decide(view: &GameView, me: &str, t: Temperament, rng: &mut Rng) -> Stance {
    let Some(r) = read(view, me, t, rng) else {
        return Stance::Stay;
    };
    // A little noise so regulars are not perfectly predictable.
    let spread = t.knobs.jitter * r.unit;
    let mut jitter = |x: f64| x + (rng.unit() - 0.5) * spread;
    let fold = jitter(r.fold);
    let stay = jitter(r.stay);
    let raise = r.raise.map(&mut jitter);
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
        knobs: KNOBS,
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
    fn trash_rides_a_double_raise_when_heat_is_plentiful() {
        let (mut g, _) = heads_up("7c 2d", 0);
        g.seats[0].calls = [Some(Stance::Raise), Some(Stance::Raise), None, None];
        g.seats[0].stake = 3;
        g.street = 2;
        g.heat = 0;
        g.heat_limit = 30;
        g.take = 0;
        g.target = 24;
        let v = view_for(&g, Some("s1"), 0);
        let r = read(&v, "s1", CALM, &mut Rng::seeded(6)).unwrap();
        assert!(
            r.stay > r.fold,
            "far from the target with room to burn, ride the raise: {r:?}"
        );
    }

    #[test]
    fn a_lone_hand_stays_in_rather_than_walk() {
        // Everyone else has folded. Walking costs heat for sure; a decent hand
        // that might win its check should carry the crew instead.
        let (mut g, _) = heads_up("Kd Qd", 0);
        g.seats[0].active = false;
        g.seats[0].calls = [Some(Stance::Fold), None, None, None];
        g.street = 1;
        let v = view_for(&g, Some("s1"), 0);
        let r = read(&v, "s1", CALM, &mut Rng::seeded(7)).unwrap();
        assert!(
            r.stay > r.fold,
            "a lone hand shouldn't walk the crew: {r:?}"
        );
        assert_ne!(decide(&v, "s1", CALM, &mut Rng::seeded(8)), Stance::Fold);
    }

    #[test]
    fn past_the_target_only_heat_matters() {
        let (mut g, _) = heads_up("7c 2d", 0);
        // Last hand, target reached, two heat from a raid: a stake of one can
        // lose safely, a stake of two can't.
        g.take = g.target;
        g.heat = g.heat_limit - 2;
        g.hand = HANDS_PER_NIGHT;
        g.street = 3;
        let v = view_for(&g, Some("s1"), 0);
        let r = read(&v, "s1", CALM, &mut Rng::seeded(9)).unwrap();
        assert!(r.raise.unwrap() < r.stay, "{r:?}");
    }

    #[test]
    fn clean_chance_falls_with_heat_and_rises_with_take() {
        let night = Night {
            take: 3,
            heat: 2,
            target: 12,
            heat_limit: 10,
            hands_after: 3,
            crew: 3,
            blaze: 0.25,
        };
        let k = KNOBS;
        let base = night.clean(&k, 0, 0, 3);
        assert!(base > 0.0 && base < 1.0);
        assert!(night.clean(&k, 2, 0, 3) > base);
        assert!(night.clean(&k, 0, 2, 3) < base);
        assert_eq!(night.clean(&k, 0, 8, 3), 0.0, "at the limit is a raid");
        assert_eq!(night.clean(&k, 9, 0, 0), 1.0, "last hand, target reached");
        assert_eq!(night.clean(&k, 8, 0, 0), 0.0, "last hand, one short");
        assert!(night.unit(&k) > 0.0);
    }

    #[test]
    fn erfc_matches_known_values() {
        assert!((erfc(0.0) - 1.0).abs() < 1e-7);
        assert!((erfc(1.0) - 0.157_299_207).abs() < 1e-7);
        assert!((erfc(-1.0) - 1.842_700_793).abs() < 1e-7);
        assert!((phi(1.96) - 0.975).abs() < 1e-4);
        assert!(phi(-30.0) > 0.0, "deep tails stay comparable");
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
    fn decisions_depend_only_on_the_view() {
        // Two games that differ only in cards the bot can't see must get the
        // same read from the same seed.
        let (g, v) = heads_up("Jh Td", 1);
        let before = read(&v, "s1", CALM, &mut Rng::seeded(10)).unwrap();
        let mut other = g.clone();
        let spare: Vec<Card> = crate::card::full_deck()
            .into_iter()
            .filter(|c| {
                !g.board.contains(c)
                    && !g.seats.iter().any(|s| s.hole.contains(c))
                    && !g.house[0].contains(c)
            })
            .collect();
        other.house[0] = [spare[0], spare[1]];
        other.seats[0].hole = vec![spare[2], spare[3]];
        let v2 = view_for(&other, Some("s1"), 0);
        assert_eq!(v, v2, "the views match");
        let after = read(&v2, "s1", CALM, &mut Rng::seeded(10)).unwrap();
        assert_eq!(before, after);
    }

    #[test]
    fn temperament_is_stable_and_bounded() {
        let a = Temperament::for_seat("bot:1");
        assert_eq!(a.boldness, Temperament::for_seat("bot:1").boldness);
        assert!(a.boldness.abs() <= 0.1);
    }
}
