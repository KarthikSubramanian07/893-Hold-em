//! The regulars: bots that fill empty chairs.
//!
//! A bot decides from its own `GameView`, the same redacted view a human gets,
//! so it can't peek: it sees the two teammates beside it, the board, and the
//! House's face-up card, and never its own hand.
//!
//! **The nod.** With the flop and the turn out, the bot deals out everything it can't see
//! (its own cards, the hands across the table, the House's hidden cards, the
//! turn and the river) a few hundred times, and nods at whichever of the two
//! beside it is more likely to beat the House, if that chance is good enough.
//! Otherwise it passes.
//!
//! **In or Out.** Every In hand plays the House on its own, so the bot needs
//! one number: the chance its own hand wins. Only the two beside it saw that
//! hand, and a nod is one of two, so it reads every nod at the table. It
//! samples its own cards and the hands it can't see, and weights each sample
//! by how well it explains the nods: a neighbour who nodded at it, one who
//! nodded past it at someone it can see is weaker, one who passed. Then it
//! weighs a step toward the door against a step toward the sirens: the closer
//! the sirens, the more a loss hurts; the less time left, the more a win counts.

use crate::card::{Card, CardSet, Rng, full_deck};
use crate::eval::{card_mask, hand_mask, score_mask};
use crate::game::{Phase, Stance};
use crate::rules::NOD_BOARD;
use crate::view::{GameView, Slot};

/// The numbers behind the policy. `KNOBS` holds the tuned values; the
/// simulator can override any of them.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Knobs {
    /// Nod at the best teammate only if they beat the House at least this often.
    pub nod_min: f64,
    /// How reliably a nod points at the hand that looked best at the nod.
    pub nod_trust: f64,
    /// Extra weight on steps toward the sirens, scaled by how close they are.
    pub caution: f64,
    /// How much more a step toward the door is worth when the clock is short:
    /// scaled by the steps still needed per player per hand left.
    pub urgency: f64,
    /// How much better In must look than Out, in steps (Out is worth zero).
    pub in_margin: f64,
    /// Noise on every call, in steps, so regulars aren't clockwork.
    pub jitter: f64,
}

/// The tuned policy. See `crates/sim/README.md` for the search behind it.
pub const KNOBS: Knobs = Knobs {
    nod_min: 0.35,
    nod_trust: 0.9,
    caution: 0.3,
    urgency: 3.0,
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
    /// Teammates' hole cards by seat index (`None` at the bot's own index and
    /// for teammates out of sight).
    holes: Vec<Option<[Card; 2]>>,
    /// Teammates whose cards the bot can't see.
    hidden: Vec<usize>,
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
        let hidden: Vec<usize> = (0..holes.len())
            .filter(|&i| i != me && holes[i].is_none())
            .collect();
        let board: Vec<Card> = view.board.iter().filter_map(card).collect();
        let house_up: Vec<Card> = view.house.cards.iter().filter_map(card).collect();
        let house_hidden = view.house.cards.len() - house_up.len();
        let mut seen = CardSet::default();
        for c in holes
            .iter()
            .flatten()
            .flatten()
            .chain(&board)
            .chain(&house_up)
        {
            seen.insert(*c);
        }
        let unseen = full_deck()
            .into_iter()
            .filter(|c| !seen.contains(*c))
            .collect();
        Some(Table {
            me,
            holes,
            hidden,
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

/// One deal of everything unseen: the bot's cards, the hands of teammates
/// out of sight, the House's hidden cards, and the rest of the board.
struct Deal {
    mine: [Card; 2],
    /// Hands for `Table::hidden`, in the same order.
    hidden: Vec<[Card; 2]>,
    board: u64,
    house: u64,
}

fn deal(t: &Table, deck: &mut [Card], rng: &mut Rng) -> Deal {
    let held = 2 + 2 * t.hidden.len();
    let need = held + t.house_hidden + (5 - t.board.len());
    for i in 0..need {
        let j = i + rng.below((deck.len() - i) as u32) as usize;
        deck.swap(i, j);
    }
    let mine = [deck[0], deck[1]];
    let hidden = (0..t.hidden.len())
        .map(|k| [deck[2 + 2 * k], deck[3 + 2 * k]])
        .collect();
    let mut house = hand_mask(&t.house_up);
    for &c in &deck[held..held + t.house_hidden] {
        house |= card_mask(c);
    }
    let mut board = hand_mask(&t.board);
    for &c in &deck[held + t.house_hidden..need] {
        board |= card_mask(c);
    }
    Deal {
        mine,
        hidden,
        board,
        house: house | board,
    }
}

/// Seats sit in a ring; each sees the two beside it.
fn sees(n: usize, a: usize, b: usize) -> bool {
    a != b && ((a + 1) % n == b || (b + 1) % n == a)
}

fn score2(hole: [Card; 2], board: u64) -> u32 {
    score_mask(board | card_mask(hole[0]) | card_mask(hole[1]))
}

/// How likely each possible two-card hand is to beat the House, judged from
/// the nod board: the same judgement a teammate makes when deciding whom to nod at.
/// Built from `deals` shared completions (the House's hidden cards, the turn
/// and the river), so every hand is measured on the same deals.
struct Strength {
    odds: Vec<f32>,
}

impl Strength {
    fn at_nod(t: &Table, deals: u32, rng: &mut Rng) -> Strength {
        let flop = &t.board[..NOD_BOARD]; // the flop and the turn
        let flop_mask = hand_mask(flop);
        let up = hand_mask(&t.house_up);
        // Cards a teammate couldn't be holding from my point of view: the board,
        // the House's face-up card, and the hands I can see.
        let mut known = CardSet::default();
        for c in flop.iter().chain(&t.house_up) {
            known.insert(*c);
        }
        for c in t.holes.iter().flatten().flatten() {
            known.insert(*c);
        }
        let pool: Vec<Card> = full_deck()
            .into_iter()
            .filter(|c| !known.contains(*c))
            .collect();
        let mut wins = vec![0u16; 52 * 52];
        let mut seen = vec![0u16; 52 * 52];
        let mut deck: Vec<Card> = full_deck()
            .into_iter()
            .filter(|c| !flop.contains(c) && !t.house_up.contains(c))
            .collect();
        let need = t.house_hidden + (5 - NOD_BOARD);
        for _ in 0..deals.max(1) {
            for i in 0..need {
                let j = i + rng.below((deck.len() - i) as u32) as usize;
                deck.swap(i, j);
            }
            let drawn = hand_mask(&deck[..need]);
            let board = flop_mask | hand_mask(&deck[t.house_hidden..need]);
            let house = score_mask(board | up | hand_mask(&deck[..t.house_hidden]));
            for (a, &x) in pool.iter().enumerate() {
                if drawn & card_mask(x) != 0 {
                    continue;
                }
                let bx = board | card_mask(x);
                for &y in &pool[a + 1..] {
                    if drawn & card_mask(y) != 0 {
                        continue;
                    }
                    let k = Self::key(x, y);
                    seen[k] += 1;
                    if score_mask(bx | card_mask(y)) > house {
                        wins[k] += 1;
                    }
                }
            }
        }
        // Hands I can see weren't in the pool; measure them on fresh deals.
        let mut odds: Vec<f32> = wins
            .iter()
            .zip(&seen)
            .map(|(w, n)| {
                if *n == 0 {
                    0.0
                } else {
                    f32::from(*w) / f32::from(*n)
                }
            })
            .collect();
        for h in t.holes.iter().flatten() {
            let (mut w, mut n) = (0u32, 0u32);
            for _ in 0..deals.max(1) {
                for i in 0..need {
                    let j = i + rng.below((deck.len() - i) as u32) as usize;
                    deck.swap(i, j);
                }
                let drawn = hand_mask(&deck[..need]);
                if drawn & (card_mask(h[0]) | card_mask(h[1])) != 0 {
                    continue;
                }
                let board = flop_mask | hand_mask(&deck[t.house_hidden..need]);
                let house = score_mask(board | up | hand_mask(&deck[..t.house_hidden]));
                n += 1;
                w += u32::from(score2(*h, board) > house);
            }
            odds[Self::key(h[0], h[1])] = if n == 0 { 0.0 } else { w as f32 / n as f32 };
        }
        Strength { odds }
    }

    fn key(a: Card, b: Card) -> usize {
        let (a, b) = (a.index().min(b.index()), a.index().max(b.index()));
        a as usize * 52 + b as usize
    }

    fn of(&self, h: [Card; 2]) -> f64 {
        f64::from(self.odds[Self::key(h[0], h[1])])
    }
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
    let strength = Strength::at_nod(&table, deals(t.samples), rng);
    let (best, p) = table
        .teammates()
        .map(|(i, h)| (i, strength.of(h)))
        .max_by(|a, b| a.1.total_cmp(&b.1))?;
    (p >= t.knobs.nod_min).then(|| view.seats[best].id.clone())
}

/// Deals behind the strength table: a fifth of the bot's sample budget.
fn deals(samples: u32) -> u32 {
    (samples / 5).max(20)
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
    let strength = Strength::at_nod(&table, deals(t.samples), rng);
    let nod_of = |i: usize| -> Option<usize> {
        let at = view.seats[i].nod.as_deref()?;
        view.seats.iter().position(|s| s.id == at)
    };

    // The bot's own cards, the hands out of its sight, and the House's hidden
    // cards are sampled. Each sample is weighted by how well it explains
    // every nod at the table: what each teammate saw was the two beside them.
    let seats = table.holes.len();
    let mut strengths: Vec<f64> = table
        .holes
        .iter()
        .map(|h| h.map_or(0.0, |h| strength.of(h)))
        .collect();
    let mut deck = table.unseen.clone();
    let read = t.policy != Policy::Deaf;
    let (mut total, mut win, mut tie) = (0.0, 0.0, 0.0);
    for _ in 0..t.samples.max(1) {
        let d = deal(&table, &mut deck, rng);
        let mut weight = 1.0;
        if read {
            strengths[table.me] = strength.of(d.mine);
            for (h, &i) in d.hidden.iter().zip(&table.hidden) {
                strengths[i] = strength.of(*h);
            }
            for j in (0..seats).filter(|&j| j != table.me) {
                let best_seen = (0..seats)
                    .filter(|&i| sees(seats, j, i))
                    .map(|i| strengths[i])
                    .fold(0.0, f64::max);
                let fits = match nod_of(j) {
                    Some(at) => strengths[at] >= best_seen - 1e-9 && strengths[at] >= k.nod_min,
                    None => best_seen < k.nod_min,
                };
                weight *= if fits { k.nod_trust } else { 1.0 - k.nod_trust };
            }
        }
        let mine = score2(d.mine, d.board);
        let house = score_mask(d.house);
        total += weight;
        if mine > house {
            win += weight;
        } else if mine == house {
            tie += weight;
        }
    }
    let total = f64::max(total, 1e-12);
    let (win, tie) = (win / total, tie / total);
    let lose = (1.0 - win - tie).max(0.0);

    // Steps toward the sirens hurt more the closer they are; steps toward the
    // door count for more the less time is left to reach it.
    let sirens_left = (f64::from(view.sirens as i32 + view.meter)).max(1.0);
    let door_left = (f64::from(view.door as i32 - view.meter)).max(1.0);
    let crew = view.seats.len() as f64;
    let loss_weight = 1.0 + k.caution * (crew / sirens_left).min(3.0);
    let hands_left = f64::from(view.last_orders.saturating_sub(view.hand) + 1);
    let pace = door_left / (hands_left * crew);
    let gain_weight = 1.0 + k.urgency * pace.min(3.0);
    let ev_in = win * gain_weight - lose * loss_weight;
    let noise = (rng.unit() - 0.5) * 2.0 * k.jitter;
    if ev_in + t.boldness + noise > k.in_margin {
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
    fn stays_out_when_its_neighbours_pass_it_over() {
        let (mut g, _) = table(2);
        g.board = cards("Ah Kh Qh 2c 3d");
        g.seats[0].hole = cards("Jh Th");
        g.seats[1].hole = cards("7c 8d"); // the bot itself, blind to it
        g.seats[2].hole = cards("9d 6c");
        g.house = cards("9s 9c 6d");
        // s0 saw the bot and s2 and passed; s2 nodded at s0, not the bot.
        g.nod("s0", None, 1).unwrap();
        g.nod("s1", Some("s0"), 1).unwrap();
        g.nod("s2", Some("s0"), 1).unwrap();
        let v = view_for(&g, Some("s1"), 2);
        let mut rng = Rng::seeded(3);
        assert_eq!(call(&v, "s1", calm(), &mut rng), Stance::Out);
    }

    #[test]
    fn at_a_big_table_it_reads_the_two_beside_it() {
        let (mut g, _) = table(4);
        g.board = cards("Ah Kh Qh 2c 3d");
        g.seats[0].hole = cards("4s 5s");
        g.seats[1].hole = cards("Jh Th"); // the bot itself, blind to it
        g.seats[2].hole = cards("7c 8d");
        g.seats[3].hole = cards("9d 6c");
        g.seats[4].hole = cards("Jd 4c");
        g.house = cards("9s 9c 6d");
        let v = view_for(&g, Some("s1"), 1);
        assert!(v.seats[0].in_sight && v.seats[2].in_sight);
        assert!(!v.seats[3].in_sight && !v.seats[4].in_sight);
        // The two beside it nod at it, past the hands it can see.
        for (id, at) in [
            ("s0", Some("s1")),
            ("s1", None),
            ("s2", Some("s1")),
            ("s3", None),
            ("s4", None),
        ] {
            g.nod(id, at, 1).unwrap();
        }
        let v = view_for(&g, Some("s1"), 2);
        let mut rng = Rng::seeded(7);
        assert_eq!(call(&v, "s1", calm(), &mut rng), Stance::In);
        // A nod only ever goes to someone in sight.
        let mut g2 = g.clone();
        g2.phase = Phase::Nod;
        for s in &mut g2.seats {
            s.nodded = false;
            s.nod = None;
        }
        let v = view_for(&g2, Some("s3"), 1);
        let mut rng = Rng::seeded(8);
        for _ in 0..20 {
            if let Some(at) = nod(&v, "s3", calm(), &mut rng) {
                assert!(at == "s2" || at == "s4", "nodded out of sight at {at}");
            }
        }
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
