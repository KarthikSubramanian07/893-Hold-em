//! A table as a server sees it: untrusted messages in, views and events out.
//!
//! `Room` wraps a `Game` with everything a host needs that isn't poker:
//! parsing and validating client messages, mapping browser ids to seats,
//! pacing the regulars so they feel human, rate limiting reactions, and
//! telling the host when to wake up next. It does no I/O; the host (the
//! Durable Object, or the browser in practice mode) owns sockets and clocks.
//!
//! The wire format matches `src/protocol.ts`.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::bot::{Decision, Temperament, decide};
use crate::card::Rng;
use crate::game::{Game, GameError, Ms, Phase, Stance};
use crate::rules::Difficulty;
use crate::view::{GameView, view_for};

pub const NAME_MAX: usize = 16;
pub const AVATARS: [&str; 8] = [
    "kitsune", "tanuki", "koi", "tsuru", "tora", "usagi", "karasu", "hebi",
];
pub const REACTIONS: [&str; 6] = ["clink", "smoke", "wink", "bow", "fire", "ghost"];

/// A validated client message.
#[derive(Clone, Debug, PartialEq)]
pub enum ClientMessage {
    Hello {
        pid: String,
        name: String,
        avatar: String,
    },
    Rename {
        name: String,
        avatar: String,
    },
    Config {
        difficulty: Option<Difficulty>,
        timer: Option<u8>,
    },
    Bot {
        add: bool,
    },
    Kick {
        seat: String,
    },
    Start,
    /// Nod at a teammate's seat, or pass (`None`).
    Nod(Option<String>),
    Call(Stance),
    Next,
    Again,
    React(String),
    Ping(f64),
}

/// Strip control characters, collapse whitespace, cap at 16 characters.
pub fn clean_name(raw: Option<&str>) -> String {
    let s: String = raw
        .unwrap_or("")
        .chars()
        .filter(|c| !c.is_control())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let s: String = s.chars().take(NAME_MAX).collect();
    if s.is_empty() {
        "Stranger".to_string()
    } else {
        s
    }
}

fn avatar_of(v: &Value) -> String {
    v.as_str()
        .filter(|a| AVATARS.contains(a))
        .unwrap_or("kitsune")
        .to_string()
}

/// Parse and validate untrusted JSON. Returns `None` for anything malformed.
pub fn parse(raw: &str) -> Option<ClientMessage> {
    if raw.len() > 2048 {
        return None;
    }
    let v: Value = serde_json::from_str(raw).ok()?;
    let o = v.as_object()?;
    let field = |k: &str| o.get(k).unwrap_or(&Value::Null);
    Some(match o.get("t")?.as_str()? {
        "hello" => {
            let pid = field("pid").as_str()?;
            let ok = (8..=64).contains(&pid.len())
                && pid
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
            if !ok {
                return None;
            }
            ClientMessage::Hello {
                pid: pid.to_string(),
                name: clean_name(field("name").as_str()),
                avatar: avatar_of(field("avatar")),
            }
        }
        "rename" => ClientMessage::Rename {
            name: clean_name(field("name").as_str()),
            avatar: avatar_of(field("avatar")),
        },
        "config" => {
            let c = field("config");
            let difficulty = match c.get("difficulty").and_then(Value::as_str) {
                Some("shitamachi") => Some(Difficulty::Shitamachi),
                Some("kabukicho") => Some(Difficulty::Kabukicho),
                Some("oyabun") => Some(Difficulty::Oyabun),
                _ => None,
            };
            let timer = c
                .get("timer")
                .and_then(Value::as_u64)
                .filter(|t| matches!(t, 0 | 15 | 30 | 60))
                .map(|t| t as u8);
            ClientMessage::Config { difficulty, timer }
        }
        "bot" => match field("op").as_str()? {
            "add" => ClientMessage::Bot { add: true },
            "remove" => ClientMessage::Bot { add: false },
            _ => return None,
        },
        "kick" => {
            let seat = field("seat").as_str()?;
            let ok = seat.len() == 2
                && seat.starts_with('s')
                && matches!(seat.as_bytes()[1], b'0'..=b'5');
            if !ok {
                return None;
            }
            ClientMessage::Kick {
                seat: seat.to_string(),
            }
        }
        "start" => ClientMessage::Start,
        "nod" => match o.get("at")? {
            Value::Null => ClientMessage::Nod(None),
            v => {
                let at = v.as_str()?;
                let ok = at.len() == 2
                    && at.starts_with('s')
                    && matches!(at.as_bytes()[1], b'0'..=b'5');
                if !ok {
                    return None;
                }
                ClientMessage::Nod(Some(at.to_string()))
            }
        },
        "call" => ClientMessage::Call(match field("stance").as_str()? {
            "in" => Stance::In,
            "out" => Stance::Out,
            _ => return None,
        }),
        "next" => ClientMessage::Next,
        "again" => ClientMessage::Again,
        "react" => {
            let r = field("reaction").as_str()?;
            if !REACTIONS.contains(&r) {
                return None;
            }
            ClientMessage::React(r.to_string())
        }
        "ping" => {
            let at = field("at").as_f64()?;
            if !at.is_finite() {
                return None;
            }
            ClientMessage::Ping(at)
        }
        _ => return None,
    })
}

/// Something the host should do after handling a message or a wake-up.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "do", rename_all = "camelCase")]
pub enum Effect {
    /// Send every socket its own fresh view.
    Broadcast,
    /// Send this exact JSON to the socket that sent the message.
    Reply { json: String },
    /// Send this exact JSON to every socket.
    Shout { json: String },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
struct BotDue {
    seat: String,
    at: Ms,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Room {
    pub game: Game,
    rng: Rng,
    bots: Vec<BotDue>,
    /// The decision (hand, 0 for the nod or 1 for the call) bots were last scheduled for.
    scheduled_for: Option<(u8, u8)>,
    /// Last reaction time per seat, for rate limiting.
    reacted: Vec<(String, Ms)>,
}

/// The outcome of a `hello`.
#[derive(Clone, Debug, PartialEq)]
pub struct Welcome {
    pub seat: Option<String>,
    pub effects: Vec<Effect>,
}

fn error_json(code: &str, message: &str) -> String {
    serde_json::json!({ "t": "error", "code": code, "message": message }).to_string()
}

fn bartender(e: &GameError) -> &'static str {
    match e {
        GameError::Full => "Every chair is taken. Pull up a stool and watch.",
        GameError::NotHost => "That's the host's call.",
        GameError::TooFew => "You need at least two at the table.",
        GameError::AlreadyLocked => "You already decided. It's in.",
        GameError::SelfNod => "Nodding at yourself. Bold. Not allowed.",
        GameError::NotSeated => "You're not at the table.",
        GameError::BadPhase => "Not now.",
    }
}

impl Room {
    pub fn new(code: &str, seed: u64) -> Room {
        Room {
            game: Game::new(code, seed),
            rng: Rng::seeded(seed ^ 0x5bd1_e995),
            bots: Vec::new(),
            scheduled_for: None,
            reacted: Vec::new(),
        }
    }

    /// A socket said hello. Seats it (or not) and returns what to send.
    pub fn hello(&mut self, pid: &str, name: &str, avatar: &str, now: Ms) -> Welcome {
        let seat = self.game.join(pid, name, avatar);
        let welcome = serde_json::json!({ "t": "welcome", "seat": seat, "token": "" }).to_string();
        self.after_change(now);
        Welcome {
            seat,
            effects: vec![Effect::Reply { json: welcome }, Effect::Broadcast],
        }
    }

    /// A socket holding `seat` closed.
    pub fn left(&mut self, seat: &str, now: Ms) -> Vec<Effect> {
        self.game.set_connected(seat, false, now);
        self.after_change(now);
        vec![Effect::Broadcast]
    }

    /// Handle a validated message from a socket holding `seat` (`None` = spectator).
    pub fn handle(&mut self, seat: Option<&str>, msg: ClientMessage, now: Ms) -> Vec<Effect> {
        if let ClientMessage::Ping(at) = msg {
            let json = serde_json::json!({ "t": "pong", "at": at, "now": now }).to_string();
            return vec![Effect::Reply { json }];
        }
        let Some(seat) = seat else {
            return vec![Effect::Reply {
                json: error_json("bad-phase", "Spectators watch. That's the deal."),
            }];
        };
        let result = match msg {
            ClientMessage::Hello { .. } | ClientMessage::Ping(_) => Ok(()),
            ClientMessage::Rename { name, avatar } => {
                self.game.rename(seat, &name, &avatar);
                Ok(())
            }
            ClientMessage::Config { difficulty, timer } => {
                self.game.set_config(seat, difficulty, timer)
            }
            ClientMessage::Bot { add: true } => self.game.add_bot(seat).map(|_| ()),
            ClientMessage::Bot { add: false } => self.game.remove_bot(seat),
            ClientMessage::Kick { seat: target } => self.game.kick(seat, &target),
            ClientMessage::Start => self.game.start(seat, now),
            ClientMessage::Nod(at) => self.game.nod(seat, at.as_deref(), now),
            ClientMessage::Call(stance) => self.game.call(seat, stance, now),
            ClientMessage::Next => self.game.next(seat, now),
            ClientMessage::Again => self.game.again(seat),
            ClientMessage::React(r) => return self.react(seat, &r, now),
        };
        match result {
            Ok(()) => {
                self.after_change(now);
                vec![Effect::Broadcast]
            }
            Err(e) => vec![Effect::Reply {
                json: error_json(e.code(), bartender(&e)),
            }],
        }
    }

    fn react(&mut self, seat: &str, reaction: &str, now: Ms) -> Vec<Effect> {
        // Silence is the game: no reactions while anyone is deciding.
        if matches!(self.game.phase, Phase::Nod | Phase::Call) {
            return Vec::new();
        }
        let last = self
            .reacted
            .iter()
            .find(|(s, _)| s == seat)
            .map(|(_, t)| *t);
        if last.is_some_and(|t| now < t + 700) {
            return Vec::new();
        }
        self.reacted.retain(|(s, _)| s != seat);
        self.reacted.push((seat.to_string(), now));
        let json =
            serde_json::json!({ "t": "react", "seat": seat, "reaction": reaction }).to_string();
        vec![Effect::Shout { json }]
    }

    /// Timer wake-up: let due regulars act, then expire deadlines.
    pub fn wake(&mut self, now: Ms) -> Vec<Effect> {
        let before = self.game.version;
        loop {
            let due = self.bots.iter().position(|b| b.at <= now);
            let Some(i) = due else { break };
            let b = self.bots.remove(i);
            if !matches!(self.game.phase, Phase::Nod | Phase::Call) {
                continue;
            }
            let still_owes = self.game.awaiting().iter().any(|s| s.id == b.seat);
            if !still_owes {
                continue;
            }
            let Some(pid) = self.game.seat(&b.seat).map(|s| s.pid.clone()) else {
                continue;
            };
            let view = view_for(&self.game, Some(&b.seat), now);
            match decide(&view, &b.seat, Temperament::for_seat(&pid), &mut self.rng) {
                Some(Decision::Nod(at)) => {
                    let _ = self.game.nod(&b.seat, at.as_deref(), now);
                }
                Some(Decision::Call(stance)) => {
                    let _ = self.game.call(&b.seat, stance, now);
                }
                None => {}
            }
            self.after_change(now);
        }
        self.game.tick(now);
        self.after_change(now);
        if self.game.version != before {
            vec![Effect::Broadcast]
        } else {
            Vec::new()
        }
    }

    /// After any change: when a new decision opens, give each regular a human-ish think time.
    fn after_change(&mut self, now: Ms) {
        if !matches!(self.game.phase, Phase::Nod | Phase::Call) {
            self.bots.clear();
            self.scheduled_for = None;
            return;
        }
        let key = (self.game.hand, u8::from(self.game.phase == Phase::Call));
        if self.scheduled_for == Some(key) {
            return;
        }
        self.scheduled_for = Some(key);
        self.bots.clear();
        let budget = match self.game.config.timer {
            0 => 6_000,
            t => (u64::from(t) * 1000 / 3).min(6_000),
        };
        for seat in self.game.bots_to_act() {
            let think = 900 + u64::from(self.rng.below(budget.saturating_sub(900).max(1) as u32));
            self.bots.push(BotDue {
                seat,
                at: now + think,
            });
        }
    }

    /// When the host should call `wake` next, if ever.
    pub fn next_wake(&self) -> Option<Ms> {
        let bot = self.bots.iter().map(|b| b.at).min();
        match (bot, self.game.deadline) {
            (Some(a), Some(b)) => Some(a.min(b)),
            (a, b) => a.or(b),
        }
    }

    pub fn view(&self, seat: Option<&str>, now: Ms) -> GameView {
        view_for(&self.game, seat, now)
    }

    /// The `state` message for one socket.
    pub fn state_json(&self, seat: Option<&str>, now: Ms) -> String {
        #[derive(Serialize)]
        struct State<'a> {
            t: &'static str,
            view: &'a GameView,
        }
        let view = self.view(seat, now);
        serde_json::to_string(&State {
            t: "state",
            view: &view,
        })
        .expect("views always serialize")
    }

    /// True when the table has nobody to play for and can be forgotten.
    pub fn is_empty(&self) -> bool {
        !self.game.seats.iter().any(|s| !s.bot && s.connected)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(s: &str) -> ClientMessage {
        parse(s).unwrap_or_else(|| panic!("rejected {s}"))
    }

    #[test]
    fn parses_the_protocol() {
        assert_eq!(
            msg(r#"{"t":"hello","pid":"abcdefgh12","name":"  Mio \n ","avatar":"koi"}"#),
            ClientMessage::Hello {
                pid: "abcdefgh12".into(),
                name: "Mio".into(),
                avatar: "koi".into()
            }
        );
        assert_eq!(
            msg(r#"{"t":"call","stance":"in"}"#),
            ClientMessage::Call(Stance::In)
        );
        assert_eq!(
            msg(r#"{"t":"nod","at":"s2"}"#),
            ClientMessage::Nod(Some("s2".into()))
        );
        assert_eq!(msg(r#"{"t":"nod","at":null}"#), ClientMessage::Nod(None));
        assert_eq!(
            msg(r#"{"t":"config","config":{"difficulty":"oyabun","timer":15}}"#),
            ClientMessage::Config {
                difficulty: Some(Difficulty::Oyabun),
                timer: Some(15)
            }
        );
        assert_eq!(
            msg(r#"{"t":"config","config":{"timer":17}}"#),
            ClientMessage::Config {
                difficulty: None,
                timer: None
            }
        );
    }

    #[test]
    fn rejects_junk() {
        for bad in [
            "",
            "null",
            "[]",
            r#"{"t":"call","stance":"allin"}"#,
            r#"{"t":"call","stance":"raise"}"#,
            r#"{"t":"nod","at":"s7"}"#,
            r#"{"t":"nod","at":3}"#,
            r#"{"t":"nod"}"#,
            r#"{"t":"hello","pid":"short"}"#,
            r#"{"t":"hello","pid":"has spaces in it"}"#,
            r#"{"t":"kick","seat":"s9"}"#,
            r#"{"t":"react","reaction":"<script>"}"#,
            r#"{"t":"teleport"}"#,
        ] {
            assert_eq!(parse(bad), None, "accepted {bad}");
        }
        assert_eq!(
            parse(&format!(r#"{{"t":"next","pad":"{}"}}"#, "x".repeat(3000))),
            None
        );
    }

    #[test]
    fn names_are_cleaned() {
        assert_eq!(clean_name(Some("")), "Stranger");
        assert_eq!(clean_name(Some("a\u{0}b")), "ab");
        assert_eq!(clean_name(Some("親分 さん")), "親分 さん");
        assert_eq!(clean_name(Some(&"x".repeat(40))).chars().count(), NAME_MAX);
    }

    fn room_with_bots() -> (Room, String) {
        let mut r = Room::new("K7QX2", 11);
        let w = r.hello("pid-aaaaaaaa", "A", "koi", 0);
        let me = w.seat.unwrap();
        r.handle(Some(&me), ClientMessage::Bot { add: true }, 0);
        r.handle(Some(&me), ClientMessage::Bot { add: true }, 0);
        (r, me)
    }

    #[test]
    fn regulars_think_then_act() {
        let (mut r, me) = room_with_bots();
        r.handle(Some(&me), ClientMessage::Start, 1_000);
        assert_eq!(r.game.bots_to_act().len(), 2);
        let wake = r.next_wake().expect("bots are scheduled");
        assert!(wake >= 1_900, "bots should not act instantly");
        // Nothing happens before they're due.
        r.wake(1_500);
        assert_eq!(r.game.bots_to_act().len(), 2);
        r.wake(8_000);
        assert!(r.game.bots_to_act().is_empty());
        // The nod waits on the human.
        assert_eq!(r.game.phase, Phase::Nod);
        r.handle(Some(&me), ClientMessage::Nod(None), 8_100);
        assert_eq!(r.game.phase, Phase::Call);
        // A new decision gets fresh think times.
        assert_eq!(r.game.bots_to_act().len(), 2);
        r.wake(20_000);
        assert!(r.game.bots_to_act().is_empty());
    }

    #[test]
    fn spectators_cannot_act() {
        let (mut r, _) = room_with_bots();
        let fx = r.handle(None, ClientMessage::Start, 0);
        assert!(matches!(&fx[0], Effect::Reply { json } if json.contains("error")));
    }

    #[test]
    fn reactions_are_silenced_during_calls_and_rate_limited() {
        let (mut r, me) = room_with_bots();
        assert_eq!(
            r.handle(Some(&me), ClientMessage::React("wink".into()), 0)
                .len(),
            1
        );
        assert!(
            r.handle(Some(&me), ClientMessage::React("wink".into()), 100)
                .is_empty()
        );
        r.handle(Some(&me), ClientMessage::Start, 1_000);
        assert!(
            r.handle(Some(&me), ClientMessage::React("wink".into()), 5_000)
                .is_empty()
        );
    }

    #[test]
    fn errors_speak_in_the_bartenders_voice() {
        let mut r = Room::new("K7QX2", 1);
        let me = r.hello("pid-aaaaaaaa", "A", "koi", 0).seat.unwrap();
        let fx = r.handle(Some(&me), ClientMessage::Start, 0);
        assert!(matches!(&fx[0], Effect::Reply { json } if json.contains("at least two")));
    }

    #[test]
    fn a_human_and_regulars_can_finish_a_night() {
        let (mut r, me) = room_with_bots();
        r.handle(Some(&me), ClientMessage::Start, 0);
        let mut now = 0;
        for _ in 0..2000 {
            if r.game.phase == Phase::Over {
                break;
            }
            now += 500;
            r.wake(now);
            match r.game.phase {
                Phase::Nod if r.game.awaiting().iter().any(|s| s.id == me) => {
                    r.handle(Some(&me), ClientMessage::Nod(None), now);
                }
                Phase::Call if r.game.awaiting().iter().any(|s| s.id == me) => {
                    r.handle(Some(&me), ClientMessage::Call(Stance::In), now);
                }
                Phase::Showdown => {
                    r.handle(Some(&me), ClientMessage::Next, now);
                }
                _ => {}
            }
        }
        assert_eq!(r.game.phase, Phase::Over);
        // State survives a save and load, as it must across Durable Object hibernation.
        let json = serde_json::to_string(&r).unwrap();
        let back: Room = serde_json::from_str(&json).unwrap();
        assert_eq!(back, r);
    }

    #[test]
    fn state_message_wraps_the_view() {
        let (r, me) = room_with_bots();
        let s = r.state_json(Some(&me), 5);
        assert!(
            s.starts_with(r#"{"t":"state","view":{"code":"K7QX2""#),
            "{s}"
        );
    }
}
