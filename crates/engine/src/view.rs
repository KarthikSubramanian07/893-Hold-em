//! What one viewer is allowed to know.
//!
//! `view_for` turns the full `Game` into a `GameView` for one seat (or a
//! spectator). It is the only path from hidden state to the wire, so every
//! secrecy rule lives here: other seats' hole cards, the House's cards, the
//! undealt board, Fog's face-down river, and Hush's hidden calls.
//!
//! The JSON shape matches `GameView` in `src/engine/types.ts` exactly.

use serde::{Serialize, Serializer};

use crate::card::Card;
use crate::eval::HandValue;
use crate::game::{Config, Game, HandResult, HistoryEntry, Ms, Phase, Stance, Verdict};
use crate::rules::{HANDS_PER_NIGHT, RuleId};

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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CallView {
    Made(Stance),
    Hidden,
}

impl Serialize for CallView {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        match self {
            CallView::Made(st) => st.serialize(s),
            CallView::Hidden => s.serialize_str("hidden"),
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
    pub active: bool,
    pub stake: Option<u8>,
    pub locked: bool,
    pub calls: Vec<Option<CallView>>,
    pub hand: Option<HandValue>,
    pub champion: bool,
    /// Index into `house` of the mask watching this seat (its heat check).
    pub watcher: Option<usize>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct HouseHandView {
    pub cards: Vec<Slot>,
    pub hand: Option<HandValue>,
    pub champion: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameView {
    pub code: String,
    pub phase: Phase,
    pub config: Config,
    pub you: Option<String>,
    pub seats: Vec<SeatView>,
    pub house: Vec<HouseHandView>,
    pub board: Vec<Slot>,
    pub street: u8,
    pub hand: u8,
    pub hands: u8,
    pub take: u32,
    pub heat: u32,
    pub target: u32,
    pub heat_limit: u32,
    pub rule: Option<RuleId>,
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
    let hush = g.rule == Some(RuleId::Shizuka) && g.phase == Phase::Call;
    let result = g.result.as_ref();

    let seats = g
        .seats
        .iter()
        .map(|s| {
            let mine = you == Some(s.id.as_str());
            let public = open || mine || g.fox.as_deref() == Some(s.id.as_str());
            let cards = s
                .hole
                .iter()
                .map(|&c| if public { Slot::Card(c) } else { Slot::Back })
                .collect();
            let calls = s
                .calls
                .iter()
                .map(|c| {
                    c.map(|st| match st {
                        // Under Hush, only folds are visible to the rest of the crew.
                        Stance::Fold => CallView::Made(st),
                        _ if hush && !mine => CallView::Hidden,
                        _ => CallView::Made(st),
                    })
                })
                .collect();
            SeatView {
                id: s.id.clone(),
                name: s.name.clone(),
                avatar: s.avatar.clone(),
                bot: s.bot,
                host: g.host.as_deref() == Some(s.id.as_str()),
                connected: s.connected,
                cards,
                active: s.active,
                stake: if hush && !mine { None } else { Some(s.stake) },
                locked: s.locked.is_some(),
                calls,
                hand: (open && s.hole.len() == 2).then(|| g.evaluate_seat(s)),
                champion: result.is_some_and(|r| r.crew_champions.contains(&s.id)),
                watcher: g.watcher_of(&s.id),
            }
        })
        .collect();

    let mirror = g.rule == Some(RuleId::Kagami);
    let house = g
        .house
        .iter()
        .enumerate()
        .map(|(i, h)| HouseHandView {
            cards: h
                .iter()
                .enumerate()
                .map(|(j, &c)| {
                    if open || (mirror && j == 0) {
                        Slot::Card(c)
                    } else {
                        Slot::Back
                    }
                })
                .collect(),
            hand: open.then(|| g.house_value(i)),
            champion: result.is_some_and(|r| r.house_champions.contains(&i)),
        })
        .collect();

    let dealt = g.dealt_board();
    let fog = g.rule == Some(RuleId::Kiri) && !open;
    let board = (0..5)
        .map(|i| match g.board.get(i) {
            Some(_) if i >= dealt => Slot::Empty,
            Some(_) if i == 4 && fog => Slot::Back,
            Some(&c) => Slot::Card(c),
            None => Slot::Empty,
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
        street: g.street,
        hand: g.hand,
        hands: HANDS_PER_NIGHT,
        take: g.take,
        heat: g.heat,
        target: if g.target > 0 && g.phase != Phase::Lobby {
            g.target
        } else {
            crate::rules::target_for(g.config.difficulty, g.seats.len().max(2))
        },
        heat_limit: if g.phase == Phase::Lobby {
            crate::rules::heat_limit_for(g.config.difficulty, g.seats.len().max(2))
        } else {
            g.heat_limit
        },
        rule: g.rule,
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
    use crate::game::Stance;

    fn running(rule: Option<RuleId>) -> Game {
        let mut g = Game::new("K7QX2", 9);
        let a = g.join("pid-aaaaaaaa", "A", "koi").unwrap();
        g.join("pid-bbbbbbbb", "B", "tora").unwrap();
        g.add_bot(&a).unwrap();
        g.start(&a, 0).unwrap();
        g.rule = rule;
        if rule == Some(RuleId::Kitsune) {
            g.fox = Some("s2".into());
        }
        g
    }

    fn json(v: &GameView) -> String {
        serde_json::to_string(v).unwrap()
    }

    #[test]
    fn you_see_your_cards_and_nobody_elses() {
        let g = running(None);
        let v = view_for(&g, Some("s0"), 5);
        assert!(matches!(v.seats[0].cards[0], Slot::Card(_)));
        assert_eq!(v.seats[1].cards, vec![Slot::Back, Slot::Back]);
        assert_eq!(v.seats[2].cards, vec![Slot::Back, Slot::Back]);
        // No hidden card may appear anywhere in the serialized view.
        let text = json(&v);
        for s in &g.seats[1..] {
            for c in &s.hole {
                assert!(!text.contains(&format!("\"{c}\"")), "leaked {c}");
            }
        }
        for h in &g.house {
            for c in h {
                assert!(!text.contains(&format!("\"{c}\"")), "leaked House card {c}");
            }
        }
        for c in &g.board {
            assert!(
                !text.contains(&format!("\"{c}\"")),
                "leaked undealt board card {c}"
            );
        }
    }

    #[test]
    fn spectators_see_no_hole_cards() {
        let g = running(None);
        let v = view_for(&g, None, 5);
        assert!(
            v.seats
                .iter()
                .all(|s| s.cards.iter().all(|c| *c == Slot::Back))
        );
        assert_eq!(v.you, None);
    }

    #[test]
    fn board_reveals_street_by_street_and_fog_hides_the_river() {
        let mut g = running(Some(RuleId::Kiri));
        let count = |v: &GameView| {
            v.board
                .iter()
                .filter(|s| matches!(s, Slot::Card(_)))
                .count()
        };
        assert_eq!(count(&view_for(&g, Some("s0"), 0)), 0);
        for (street, expect) in [(1, 3), (2, 4), (3, 4)] {
            g.street = street;
            let v = view_for(&g, Some("s0"), 0);
            assert_eq!(count(&v), expect);
        }
        assert_eq!(view_for(&g, Some("s0"), 0).board[4], Slot::Back);
    }

    #[test]
    fn mirror_shows_one_card_per_mask() {
        let g = running(Some(RuleId::Kagami));
        let v = view_for(&g, Some("s0"), 0);
        for h in &v.house {
            assert!(matches!(h.cards[0], Slot::Card(_)));
            assert_eq!(h.cards[1], Slot::Back);
        }
    }

    #[test]
    fn fox_reveals_one_seat_to_everyone() {
        let g = running(Some(RuleId::Kitsune));
        let v = view_for(&g, Some("s1"), 0);
        assert!(matches!(v.seats[2].cards[0], Slot::Card(_)));
        assert_eq!(v.seats[0].cards[0], Slot::Back);
    }

    #[test]
    fn hush_hides_stakes_and_calls_but_not_folds() {
        let mut g = running(Some(RuleId::Shizuka));
        g.call("s0", Stance::Raise, 1).unwrap();
        g.call("s1", Stance::Fold, 1).unwrap();
        g.call("s2", Stance::Stay, 1).unwrap();
        let v = view_for(&g, Some("s2"), 2);
        assert_eq!(v.seats[0].stake, None);
        assert_eq!(v.seats[0].calls[0], Some(CallView::Hidden));
        assert_eq!(v.seats[1].calls[0], Some(CallView::Made(Stance::Fold)));
        assert!(!v.seats[1].active);
        // Your own calls are always yours to see.
        assert_eq!(v.seats[2].calls[0], Some(CallView::Made(Stance::Stay)));
        assert!(!json(&v).contains("\"raise\""));
    }

    #[test]
    fn locked_calls_stay_secret_until_the_street_flips() {
        let mut g = running(None);
        g.call("s0", Stance::Raise, 1).unwrap();
        let v = view_for(&g, Some("s1"), 2);
        assert!(v.seats[0].locked);
        assert_eq!(v.seats[0].calls[0], None);
        assert_eq!(v.seats[0].stake, Some(1));
    }

    #[test]
    fn showdown_opens_everything() {
        let mut g = running(None);
        for _ in 0..4 {
            for id in ["s0", "s1", "s2"] {
                let _ = g.call(id, Stance::Stay, 1);
            }
        }
        assert!(matches!(g.phase, Phase::Showdown | Phase::Over));
        let v = view_for(&g, None, 2);
        assert!(
            v.seats
                .iter()
                .all(|s| s.hand.is_some() && matches!(s.cards[0], Slot::Card(_)))
        );
        assert!(v.house.iter().all(|h| h.hand.is_some()));
        assert!(v.board.iter().all(|s| matches!(s, Slot::Card(_))));
        assert!(v.result.is_some());
        assert!(v.seats.iter().any(|s| s.champion) || v.result.unwrap().crew_best.is_none());
    }

    #[test]
    fn view_json_uses_the_typescript_field_names() {
        let g = running(None);
        let text = json(&view_for(&g, Some("s0"), 0));
        for key in [
            "\"heatLimit\"",
            "\"you\":\"s0\"",
            "\"phase\":\"call\"",
            "\"difficulty\":\"kabukicho\"",
            "\"board\":[null,null,null,null,null]",
        ] {
            assert!(text.contains(key), "missing {key} in {text}");
        }
    }
}
