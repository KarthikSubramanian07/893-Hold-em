//! The regulars: bots that fill empty chairs.
//!
//! A bot decides from its own `GameView`, the same redacted view a human gets,
//! so it can't peek: it sees its teammates' cards, the board, and the House's
//! face-up card, and never its own hand.
//!
//! **The nod.** With the flop out, the bot deals out everything it can't see
//! (its own cards, the House's hidden cards, the turn and the river) a few
//! hundred times, and nods at the teammate most likely to beat the House, if
//! that chance is good enough. Otherwise it passes.
//!
//! **In or Out.** With the river out, the bot reads the nods. Each teammate
//! who nodded at it is evidence its own hand looked strongest on the flop;
//! each teammate who nodded at someone else is evidence it didn't. Samples of
//! its own hidden cards are weighted by how well they explain the nods, which
//! gives the chance the bot itself beats the House. Teammates who were nodded
//! at, or whose cards plainly beat the House, are expected to be In. The bot
//! then compares the marker's expected move with it In against Out, weighing
//! steps toward the sirens more heavily the closer they are, and steps toward
//! the door more heavily the fewer hands are left to reach it.

use crate::card::{Card, CardSet, Rng, full_deck};
use crate::eval::{card_mask, hand_mask, score_mask};
use crate::game::{Phase, Stance};
use crate::view::{GameView, Slot};

/// The numbers behind the policy. `KNOBS` holds the tuned values; the
/// simulator can override any of them.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Knobs {
    /// Nod at the best teammate only if they beat the House at least this often.
    pub nod_min: f64,
    /// How reliably a nod points at the hand that looked best on the flop.
    pub nod_trust: f64,
    /// Chance a teammate who was nodded at goes In.
    pub nodded_in: f64,
    /// A teammate whose visible hand beats the House this often is expected In.
    pub visible_in: f64,
    /// Extra weight on steps toward the sirens, scaled by how close they are.
    pub caution: f64,
    /// How much more a step toward the door is worth when the clock is short:
    /// scaled by the steps still needed per player per hand left.
    pub urgency: f64,
    /// How much better In must look than Out, in steps.
    pub in_margin: f64,
    /// Noise on every call, in steps, so regulars aren't clockwork.
    pub jitter: f64,
}

/// The tuned policy. See `crates/sim/README.md` for the search behind it.
pub const KNOBS: Knobs = Knobs {
    nod_min: 0.45,
    nod_trust: 0.8,
    nodded_in: 0.85,
    visible_in: 0.6,
    caution: 1.0,
    urgency: 1.0,
    in_margin: 0.0,
    jitter: 0.15,
};

/// How a regular plays. The simulator also uses the deliberately weaker
/// policies to measure how much nodding and reading nods are worth.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Policy {
    /// Nod well and read the nods.
    Regular,
    /// Nod at a random teammate every hand.
    RandomNods,
    /// Never nod; still reads the table.
    NoNods,
    /// Nod well, but ignore nods when deciding In or Out.
    Deaf,
    /// Always pass and always go In.
    AlwaysIn,
}

#[derive(Clone, Copy, Debug)]
pub struct Temperament {
    /// Leans toward In (positive) or Out (negative), in steps.
    pub boldness: f64,
    pub samples: u32,
    pub knobs: Knobs,
    pub policy: Policy,
}

impl Temperament {
    /// A stable temperament per seat, so each regular has a consistent style.
    pub fn for_seat(pid: &str) -> Temperament {
        let h = pid.bytes().fold(0xcbf2_9ce4_8422_2325u64, |h, b| {
            (h ^ u64::from(b)).wrapping_mul(0x100_0000_01b3)
        });
        let boldness = ((h % 1000) as f64 / 1000.0 - 0.5) * 0.3;
        Temperament {
            boldness,
            samples: 300,
            knobs: KNOBS,
            policy: Policy::Regular,
        }
    }
}

/// A bot's decision for the current phase.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Decision {
    Nod(Option<String>),
    Call(Stance),
}

fn card(s: &Slot) -> Option<Card> {
    match s {
        Slot::Card(c) => Some(*c),
        _ => None,
    }
}

/// Everything the bot can see, with the unseen deck.
struct Table {
    me: usize,
    /// Teammates' hole cards by seat index (`None` at the bot's own index).
    holes: Vec<Option<[Card; 2]>>,
    board: Vec<Card>,
    house_up: Vec<Card>,
    house_hidden: usize,
    unseen: Vec<Card>,
}

impl Table {
    fn of(view: &GameView, me: &str) -> Option<Table> {
        let me = view.seats.iter().position(|s| s.id == me)?;
        let holes: Vec<Option<[Card; 2]>> = view
            .seats
            .iter()
            .enumerate()
            .map(|(i, s)| {
                if i == me {
                    return None;
                }
                Some([card(s.cards.first()?)?, card(s.cards.get(1)?)?])
            })
            .collect();
        let board: Vec<Card> = view.board.iter().filter_map(card).collect();
        let house_up: Vec<Card> = view.house.cards.iter().filter_map(card).collect();
        let house_hidden = view.house.cards.len() - house_up.len();
        let mut seen = CardSet::default();
        for c in holes.iter().flatten().flatten().chain(&board).chain(&house_up) {
            seen.insert(*c);
        }
        let unseen = full_deck().into_iter().filter(|c| !seen.contains(*c)).collect();
        Some(Table {
            me,
            holes,
            board,
            house_up,
            house_hidden,
            unseen,
        })
    }

    fn teammates(&self) -> impl Iterator<Item = (usize, [Card; 2])> + '_ {
        self.holes
            .iter()
            .enumerate()
            .filter_map(|(i, h)| h.map(|h| (i, h)))
    }
}

/// One deal of everything unseen: the bot's cards, the House's hidden cards,
/// and the rest of the board.
struct Deal {
    mine: [Card; 2],
    board: u64,
    house: u64,
}

fn deal(t: &Table, deck: &mut [Card], rng: &mut Rng) -> Deal {
    let need = 2 + t.house_hidden + (5 - t.board.len());
    for i in 0..need {
        let j = i + rng.below((deck.len() - i) as u32) as usize;
        deck.swap(i, j);
    }
    let mine = [deck[0], deck[1]];
    let mut house = hand_mask(&t.house_up);
    for &c in &deck[2..2 + t.house_hidden] {
        house |= card_mask(c);
    }
    let mut board = hand_mask(&t.board);
    for &c in &deck[2 + t.house_hidden..need] {
        board |= card_mask(c);
    }
    Deal {
        mine,
        board,
        house: house | board,
    }
}

fn score2(hole: [Card; 2], board: u64) -> u32 {
    score_mask(board | card_mask(hole[0]) | card_mask(hole[1]))
}

/// The bot's decision for the phase the view is in, or `None` if it has none to make.
pub fn decide(view: &GameView, me: &str, t: Temperament, rng: &mut Rng) -> Option<Decision> {
    match view.phase {
        Phase::Nod => Some(Decision::Nod(nod(view, me, t, rng))),
        Phase::Call => Some(Decision::Call(call(view, me, t, rng))),
        _ => None,
    }
}

/// Who to nod at, if anyone.
pub fn nod(view: &GameView, me: &str, t: Temperament, rng: &mut Rng) -> Option<String> {
    let table = Table::of(view, me)?;
    match t.policy {
        Policy::NoNods | Policy::AlwaysIn => return None,
        Policy::RandomNods => {
            let mates: Vec<usize> = table.teammates().map(|(i, _)| i).collect();
            let pick = mates[rng.below(mates.len() as u32) as usize];
            return Some(view.seats[pick].id.clone());
        }
        Policy::Regular | Policy::Deaf => {}
    }
    let odds = beat_odds(&table, t.samples, rng);
    let (best, p) = odds
        .into_iter()
        .max_by(|a, b| a.1.total_cmp(&b.1))?;
    (p >= t.knobs.nod_min).then(|| view.seats[best].id.clone())
}

/// For each teammate, the chance their hand beats the House at the showdown.
fn beat_odds(t: &Table, samples: u32, rng: &mut Rng) -> Vec<(usize, f64)> {
    let mates: Vec<(usize, [Card; 2])> = t.teammates().collect();
    let mut wins = vec![0u32; mates.len()];
    let mut deck = t.unseen.clone();
    let n = samples.max(1);
    for _ in 0..n {
        let d = deal(t, &mut deck, rng);
        let house = score_mask(d.house);
        for (k, (_, hole)) in mates.iter().enumerate() {
            if score2(*hole, d.board) > house {
                wins[k] += 1;
            }
        }
    }
    mates
        .iter()
        .zip(wins)
        .map(|((i, _), w)| (*i, f64::from(w) / f64::from(n)))
        .collect()
}

/// In or Out.
pub fn call(view: &GameView, me: &str, t: Temperament, rng: &mut Rng) -> Stance {
    if t.policy == Policy::AlwaysIn {
        return Stance::In;
    }
    let Some(table) = Table::of(view, me) else {
        return Stance::Out;
    };
    let k = &t.knobs;
    let flop = hand_mask(&table.board[..3.min(table.board.len())]);
    let flop_scores: Vec<Option<u32>> = table
        .holes
        .iter()
        .map(|h| h.map(|h| score2(h, flop)))
        .collect();
    let nod_of = |i: usize| -> Option<usize> {
        let at = view.seats[i].nod.as_deref()?;
        view.seats.iter().position(|s| s.id == at)
    };
    let nods_on = |i: usize| (0..view.seats.len()).filter(|&j| nod_of(j) == Some(i)).count();

    // Teammates' showdown scores are fixed once the river is out; the House's
    // hidden cards are not, so who beats it is still a sample.
    let mates: Vec<(usize, [Card; 2])> = table.teammates().collect();
    let mut deck = table.unseen.clone();
    let n = t.samples.max(1);
    let read = t.policy != Policy::Deaf;
    let trust = k.nod_trust;

    struct Sample {
        weight: f64,
        mine: u32,
        house: u32,
        mates: Vec<u32>,
    }
    let mut draws = Vec::with_capacity(n as usize);
    let mut mate_wins = vec![0.0f64; mates.len()];
    for _ in 0..n {
        let d = deal(&table, &mut deck, rng);
        let house = score_mask(d.house);
        let mine = score2(d.mine, d.board);
        let mate_scores: Vec<u32> = mates.iter().map(|(_, h)| score2(*h, d.board)).collect();
        // How well do these cards of mine explain the nods?
        let mut weight = 1.0;
        if read {
            let my_flop = score2(d.mine, flop);
            for (j, _) in &mates {
                // What teammate j saw on the flop: everyone but themselves.
                let best_seen = (0..table.holes.len())
                    .filter(|&i| i != *j)
                    .map(|i| if i == table.me { my_flop } else { flop_scores[i].unwrap_or(0) })
                    .max()
                    .unwrap_or(0);
                let i_looked_best = my_flop >= best_seen;
                weight *= match nod_of(*j) {
                    Some(at) if at == table.me => {
                        if i_looked_best { trust } else { 1.0 - trust }
                    }
                    Some(_) => {
                        if i_looked_best { 1.0 - trust } else { trust }
                    }
                    // A pass: nobody looked good to them, me included.
                    None => {
                        if i_looked_best { 0.4 } else { 0.6 }
                    }
                };
            }
        }
        for (m, s) in mate_scores.iter().enumerate() {
            if *s > house {
                mate_wins[m] += 1.0;
            }
        }
        draws.push(Sample {
            weight,
            mine,
            house,
            mates: mate_scores,
        });
    }

    // Who else is likely In: nodded teammates, and teammates who plainly win.
    let expected_in: Vec<(usize, f64)> = mates
        .iter()
        .enumerate()
        .map(|(m, (i, _))| {
            let visible = mate_wins[m] / f64::from(n);
            let q = if nods_on(*i) > 0 {
                k.nodded_in
            } else if visible >= k.visible_in {
                k.nodded_in
            } else {
                0.0
            };
            (m, q)
        })
        .filter(|(_, q)| *q > 0.0)
        .collect();
    let others_in: f64 = expected_in.iter().map(|(_, q)| q).sum();

    let total: f64 = draws.iter().map(|s| s.weight).sum::<f64>().max(1e-12);
    let mut win_in = 0.0;
    let mut tie_in = 0.0;
    let mut win_out = 0.0;
    let mut tie_out = 0.0;
    for s in &draws {
        let carried = expected_in
            .iter()
            .map(|(m, _)| s.mates[*m])
            .max()
            .unwrap_or(0);
        let with_me = carried.max(s.mine);
        if with_me > s.house {
            win_in += s.weight;
        } else if with_me == s.house {
            tie_in += s.weight;
        }
        if !expected_in.is_empty() {
            if carried > s.house {
                win_out += s.weight;
            } else if carried == s.house {
                tie_out += s.weight;
            }
        }
    }
    let (win_in, tie_in) = (win_in / total, tie_in / total);
    let (win_out, tie_out) = (win_out / total, tie_out / total);

    // Steps toward the sirens hurt more the closer they are.
    let sirens_left = (f64::from(view.sirens as i32 + view.meter)).max(1.0);
    let door_left = (f64::from(view.door as i32 - view.meter)).max(1.0);
    let crew = view.seats.len() as f64;
    let loss_weight = 1.0 + k.caution * (crew / sirens_left).min(3.0);
    let hands_left = f64::from(view.last_orders.saturating_sub(view.hand) + 1);
    let pace = door_left / (hands_left * crew);
    let gain_weight = 1.0 + k.urgency * pace.min(3.0);
    // Steps past the door are worth nothing extra.
    let gain = |steps: f64| steps.min(door_left) * gain_weight;
    let value = |ins: f64, win: f64, tie: f64| {
        let lose = (1.0 - win - tie).max(0.0);
        win * gain(ins) - lose * ins * loss_weight
    };
    let ev_in = value(others_in + 1.0, win_in, tie_in);
    let ev_out = if expected_in.is_empty() {
        0.0
    } else {
        value(others_in, win_out, tie_out)
    };
    let noise = (rng.unit() - 0.5) * 2.0 * k.jitter;
    if ev_in - ev_out + t.boldness + noise > k.in_margin {
        Stance::In
    } else {
        Stance::Out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::card::cards;
    use crate::game::Game;
    use crate::view::view_for;

    fn table(n_bots: usize) -> (Game, String) {
        let mut g = Game::new("K7QX2", 3);
        let a = g.join("pid-aaaaaaaa", "A", "koi").unwrap();
        for _ in 0..n_bots {
            g.add_bot(&a).unwrap();
        }
        g.start(&a, 0).unwrap();
        (g, a)
    }

    fn calm() -> Temperament {
        Temperament {
            boldness: 0.0,
            samples: 400,
            knobs: Knobs {
                jitter: 0.0,
                ..KNOBS
            },
            policy: Policy::Regular,
        }
    }

    #[test]
    fn nods_at_the_teammate_holding_the_monster() {
        let (mut g, _) = table(2);
        g.board = cards("Ah Kh Qh 2c 3d");
        g.seats[0].hole = cards("Jh Th"); // a royal flush on the flop
        g.seats[1].hole = cards("4s 5s");
        g.seats[2].hole = cards("7c 8d");
        g.house = cards("9s 9c 6d");
        let v = view_for(&g, Some("s1"), 0);
        let mut rng = Rng::seeded(1);
        assert_eq!(
            decide(&v, "s1", calm(), &mut rng),
            Some(Decision::Nod(Some("s0".into())))
        );
    }

    #[test]
    fn passes_when_nobody_it_can_see_looks_good() {
        let (mut g, _) = table(2);
        g.board = cards("Ah Kd 9s 4c 2d");
        g.seats[0].hole = cards("7c 3h");
        g.seats[1].hole = cards("5s 6s");
        g.seats[2].hole = cards("8c 3d");
        g.house = cards("Qs Qc 6d");
        let v = view_for(&g, Some("s1"), 0);
        let mut rng = Rng::seeded(2);
        assert_eq!(nod(&v, "s1", calm(), &mut rng), None);
    }

    #[test]
    fn goes_in_behind_a_teammate_who_plainly_wins() {
        let (mut g, _) = table(2);
        g.board = cards("Ah Kh Qh 2c 3d");
        g.seats[0].hole = cards("Jh Th");
        g.seats[1].hole = cards("4s 5s");
        g.seats[2].hole = cards("7c 8d");
        g.house = cards("9s 9c 6d");
        for id in ["s0", "s1", "s2"] {
            g.nod(id, if id == "s0" { None } else { Some("s0") }, 1).unwrap();
        }
        let v = view_for(&g, Some("s1"), 2);
        let mut rng = Rng::seeded(3);
        assert_eq!(call(&v, "s1", calm(), &mut rng), Stance::In);
    }

    #[test]
    fn the_carrier_goes_in_on_its_nods() {
        let (mut g, _) = table(2);
        g.board = cards("Ah Kh Qh 2c 3d");
        g.seats[0].hole = cards("4s 5s");
        g.seats[1].hole = cards("Jh Th"); // the bot itself, blind to it
        g.seats[2].hole = cards("7c 8d");
        g.house = cards("9s 9c 6d");
        g.nod("s0", Some("s1"), 1).unwrap();
        g.nod("s1", None, 1).unwrap();
        g.nod("s2", Some("s1"), 1).unwrap();
        let v = view_for(&g, Some("s1"), 2);
        let mut rng = Rng::seeded(4);
        assert_eq!(call(&v, "s1", calm(), &mut rng), Stance::In);
    }

    #[test]
    fn stays_out_when_nothing_points_at_a_win() {
        let (mut g, _) = table(2);
        g.board = cards("Ah Kd 9s 4c 2d");
        g.seats[0].hole = cards("7c 3h");
        g.seats[1].hole = cards("5s 6s");
        g.seats[2].hole = cards("8c 3d");
        g.house = cards("Qs Qc 6d");
        for id in ["s0", "s1", "s2"] {
            g.nod(id, None, 1).unwrap();
        }
        let v = view_for(&g, Some("s1"), 2);
        let mut rng = Rng::seeded(5);
        assert_eq!(call(&v, "s1", calm(), &mut rng), Stance::Out);
    }

    #[test]
    fn decisions_only_in_decision_phases() {
        let (g, _) = table(1);
        let mut lobby = view_for(&g, Some("s1"), 0);
        lobby.phase = Phase::Lobby;
        let mut rng = Rng::seeded(6);
        assert_eq!(decide(&lobby, "s1", calm(), &mut rng), None);
    }
}
