//! What one viewer is allowed to know.
//!
//! `view_for` turns the full `Game` into a `GameView` for one seat (or a
//! spectator). It is the only path from hidden state to the wire, so every
//! secrecy rule lives here:
//!
//! - During a hand you see every teammate's cards but never your own.
//! - Spectators see no hole cards at all, so a second tab can't peek at yours.
//! - The House shows its first card; the rest wait for the showdown.
//! - Nods stay secret until everyone has nodded; In and Out until the showdown.
//!
//! The JSON shape matches `GameView` in `src/engine/types.ts` exactly.

use serde::{Serialize, Serializer};

use crate::card::Card;
use crate::eval::HandValue;
use crate::game::{Config, Game, HandResult, HistoryEntry, Ms, Phase, Stance, Verdict};
use crate::rules::{HOUSE_UP, LAST_ORDERS};

/// A card slot: a real card, a face-down card, or nothing dealt.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Slot {
    Card(Card),
    Back,
    Empty,
}

impl Serialize for Slot {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        match self {
            Slot::Card(c) => c.serialize(s),
            Slot::Back => s.serialize_str("back"),
            Slot::Empty => s.serialize_none(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct SeatView {
    pub id: String,
    pub name: String,
    pub avatar: String,
    pub bot: bool,
    pub host: bool,
    pub connected: bool,
    pub cards: Vec<Slot>,
    /// Has this seat decided in the current phase (nodded, or picked In/Out)?
    pub locked: bool,
    /// Who this seat nodded at. Hidden from others until every nod is in.
    pub nod: Option<String>,
    /// In or Out. Hidden from others until the showdown.
    pub stance: Option<Stance>,
    /// At the showdown: this seat's hand.
    pub hand: Option<HandValue>,
    /// At the showdown: this seat's hand carried the crew.
    pub champion: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct HouseView {
    pub cards: Vec<Slot>,
    /// At the showdown.
    pub hand: Option<HandValue>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameView {
    pub code: String,
    pub phase: Phase,
    pub config: Config,
    pub you: Option<String>,
    pub seats: Vec<SeatView>,
    pub house: HouseView,
    pub board: Vec<Slot>,
    /// Nights started at this table (1 for the first).
    pub night: u32,
    pub hand: u8,
    pub last_orders: u8,
    pub meter: i32,
    pub door: u32,
    pub sirens: u32,
    pub deadline: Option<Ms>,
    pub result: Option<HandResult>,
    pub history: Vec<HistoryEntry>,
    pub verdict: Option<Verdict>,
    pub ready: Vec<String>,
    pub now: Ms,
}

/// Build the view for `you` (a seat id) or a spectator (`None`).
pub fn view_for(g: &Game, you: Option<&str>, now: Ms) -> GameView {
    let open = matches!(g.phase, Phase::Showdown | Phase::Over) && !g.board.is_empty();
    let nods_public = !matches!(g.phase, Phase::Lobby | Phase::Nod);
    let result = g.result.as_ref();

    let seats = g
        .seats
        .iter()
        .map(|s| {
            let mine = you == Some(s.id.as_str());
            // Seated players see their teammates; nobody sees their own hand.
            let visible = open || (you.is_some() && !mine);
            let cards = s
                .hole
                .iter()
                .map(|&c| if visible { Slot::Card(c) } else { Slot::Back })
                .collect();
            let locked = match g.phase {
                Phase::Nod => s.nodded,
                Phase::Call => s.locked.is_some(),
                _ => false,
            };
            SeatView {
                id: s.id.clone(),
                name: s.name.clone(),
                avatar: s.avatar.clone(),
                bot: s.bot,
                host: g.host.as_deref() == Some(s.id.as_str()),
                connected: s.connected,
                cards,
                locked,
                nod: if nods_public || mine {
                    s.nod.clone()
                } else {
                    None
                },
                stance: if open {
                    s.stance
                } else if mine {
                    s.locked
                } else {
                    None
                },
                hand: (open && s.hole.len() == 2).then(|| g.evaluate_seat(s)),
                champion: result.is_some_and(|r| r.crew_champions.contains(&s.id)),
            }
        })
        .collect();

    let house = HouseView {
        cards: g
            .house
            .iter()
            .enumerate()
            .map(|(i, &c)| {
                if open || i < HOUSE_UP {
                    Slot::Card(c)
                } else {
                    Slot::Back
                }
            })
            .collect(),
        hand: (open && !g.house.is_empty()).then(|| g.house_value()),
    };

    let dealt = g.dealt_board();
    let board = (0..5)
        .map(|i| match g.board.get(i) {
            Some(&c) if i < dealt => Slot::Card(c),
            _ => Slot::Empty,
        })
        .collect();

    GameView {
        code: g.code.clone(),
        phase: g.phase,
        config: g.config.clone(),
        you: you.map(str::to_string),
        seats,
        house,
        board,
        night: g.night,
        hand: g.hand,
        last_orders: LAST_ORDERS,
        meter: g.meter,
        door: g.door,
        sirens: g.sirens,
        deadline: g.deadline,
        result: g.result.clone(),
        history: g.history.clone(),
        verdict: g.verdict,
        ready: g.ready.clone(),
        now,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn running() -> Game {
        let mut g = Game::new("K7QX2", 9);
        let a = g.join("pid-aaaaaaaa", "A", "koi").unwrap();
        g.join("pid-bbbbbbbb", "B", "tora").unwrap();
        g.add_bot(&a).unwrap();
        g.start(&a, 0).unwrap();
        g
    }

    fn json(v: &GameView) -> String {
        serde_json::to_string(v).unwrap()
    }

    #[test]
    fn you_see_everyone_but_yourself() {
        let g = running();
        let v = view_for(&g, Some("s0"), 5);
        assert_eq!(v.seats[0].cards, vec![Slot::Back, Slot::Back]);
        assert!(matches!(v.seats[1].cards[0], Slot::Card(_)));
        assert!(matches!(v.seats[2].cards[1], Slot::Card(_)));
        let text = json(&v);
        for c in &g.seats[0].hole {
            assert!(!text.contains(&format!("\"{c}\"")), "leaked own card {c}");
        }
        for c in &g.house[HOUSE_UP..] {
            assert!(!text.contains(&format!("\"{c}\"")), "leaked House card {c}");
        }
        for c in &g.board[3..] {
            assert!(
                !text.contains(&format!("\"{c}\"")),
                "leaked the turn or river {c}"
            );
        }
        assert!(matches!(v.house.cards[0], Slot::Card(_)));
        assert!(v.house.cards[HOUSE_UP..].iter().all(|c| *c == Slot::Back));
    }

    #[test]
    fn spectators_see_no_hole_cards() {
        let g = running();
        let v = view_for(&g, None, 5);
        assert!(
            v.seats
                .iter()
                .all(|s| s.cards.iter().all(|c| *c == Slot::Back))
        );
        assert_eq!(v.you, None);
    }

    #[test]
    fn the_board_shows_the_flop_then_all_five() {
        let mut g = running();
        let count = |v: &GameView| {
            v.board
                .iter()
                .filter(|s| matches!(s, Slot::Card(_)))
                .count()
        };
        assert_eq!(count(&view_for(&g, Some("s0"), 0)), 3);
        for id in ["s0", "s1", "s2"] {
            g.nod(id, None, 1).unwrap();
        }
        assert_eq!(count(&view_for(&g, Some("s0"), 0)), 5);
    }

    #[test]
    fn nods_stay_secret_until_everyone_has_nodded() {
        let mut g = running();
        g.nod("s0", Some("s1"), 1).unwrap();
        let theirs = view_for(&g, Some("s1"), 2);
        assert!(theirs.seats[0].locked);
        assert_eq!(theirs.seats[0].nod, None);
        let mine = view_for(&g, Some("s0"), 2);
        assert_eq!(mine.seats[0].nod.as_deref(), Some("s1"));
        g.nod("s1", None, 3).unwrap();
        g.nod("s2", Some("s1"), 3).unwrap();
        let v = view_for(&g, Some("s1"), 4);
        assert_eq!(v.seats[0].nod.as_deref(), Some("s1"));
        assert_eq!(v.seats[2].nod.as_deref(), Some("s1"));
    }

    #[test]
    fn calls_stay_secret_until_the_showdown() {
        let mut g = running();
        for id in ["s0", "s1", "s2"] {
            g.nod(id, None, 1).unwrap();
        }
        g.call("s0", Stance::In, 2).unwrap();
        let v = view_for(&g, Some("s1"), 3);
        assert!(v.seats[0].locked);
        assert_eq!(v.seats[0].stance, None);
        assert_eq!(
            view_for(&g, Some("s0"), 3).seats[0].stance,
            Some(Stance::In)
        );
        assert!(!json(&v).contains("\"in\""));
    }

    #[test]
    fn showdown_opens_everything() {
        let mut g = running();
        for id in ["s0", "s1", "s2"] {
            g.nod(id, None, 1).unwrap();
        }
        for id in ["s0", "s1", "s2"] {
            g.call(id, Stance::In, 2).unwrap();
        }
        assert!(matches!(g.phase, Phase::Showdown | Phase::Over));
        let v = view_for(&g, None, 2);
        assert!(
            v.seats
                .iter()
                .all(|s| s.hand.is_some() && matches!(s.cards[0], Slot::Card(_)))
        );
        assert!(v.house.hand.is_some());
        assert!(v.house.cards.iter().all(|c| matches!(c, Slot::Card(_))));
        assert!(v.board.iter().all(|s| matches!(s, Slot::Card(_))));
        assert!(v.seats.iter().all(|s| s.stance == Some(Stance::In)));
        assert!(v.result.is_some());
    }

    #[test]
    fn view_json_uses_the_typescript_field_names() {
        let g = running();
        let text = json(&view_for(&g, Some("s0"), 0));
        for key in [
            "\"lastOrders\"",
            "\"meter\":0",
            "\"you\":\"s0\"",
            "\"phase\":\"nod\"",
            "\"difficulty\":\"shitamachi\"",
            "\"house\":{\"cards\":[",
        ] {
            assert!(text.contains(key), "missing {key} in {text}");
        }
    }
}
