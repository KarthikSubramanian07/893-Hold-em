//! The night: seats, the deal, the nod, In or Out, the showdown, the verdict.
//!
//! The rules in four lines:
//!
//! 1. Everyone sees every hand but their own. The House shows one card.
//! 2. After the flop, each player may nod at one teammate: "you're good".
//! 3. After the river, everyone picks In or Out at once.
//! 4. The best hand that's In against the House: a win moves the marker one
//!    step toward the door per player in, a loss one step toward the sirens.
//!    Everyone Out moves nothing, but the clock runs: ten hands to the door.
//!
//! `Game` is the whole truth, including every hidden card. It is pure: time is
//! passed in as epoch milliseconds, randomness comes from the seeded `Rng` it
//! owns, and it never does I/O. The room layer feeds it messages and timer
//! wake-ups and sends each socket `view::view_for(...)`.
//!
//! The whole struct serializes, so a Durable Object can persist it between
//! messages and survive hibernation.

use serde::{Deserialize, Serialize};

use crate::card::{Card, Rng, full_deck};
use crate::eval::{HandValue, evaluate};
use crate::rules::{
    Difficulty, LAST_ORDERS, MAX_CREW, MIN_CREW, SHOWDOWN_SECONDS, door_for, house_cards,
    sirens_for,
};

pub type Ms = u64;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Stance {
    In,
    Out,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Lobby,
    /// The flop is out; each player may nod at one teammate.
    Nod,
    /// The river is out; each player picks In or Out.
    Call,
    Showdown,
    Over,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Verdict {
    /// The marker reached the door.
    Clean,
    /// The marker reached the sirens.
    Raid,
    /// Last orders came first.
    Dawn,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Outcome {
    Crew,
    House,
    Tie,
    Walked,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub difficulty: Difficulty,
    /// Seconds per decision; 0 = no timer.
    pub timer: u8,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            difficulty: Difficulty::Shitamachi,
            timer: 30,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Seat {
    /// "s0".."s5", stable for the life of the table.
    pub id: String,
    /// The browser id (or `bot:<n>`) that owns this seat.
    pub pid: String,
    pub name: String,
    pub avatar: String,
    pub bot: bool,
    pub connected: bool,
    pub hole: Vec<Card>,
    /// Has this seat settled its nod this hand (a nod or a pass)?
    pub nodded: bool,
    /// Who this seat nodded at this hand, if anyone.
    pub nod: Option<String>,
    /// In or Out, chosen during the call and not yet revealed.
    pub locked: Option<Stance>,
    /// In or Out, revealed at the showdown.
    pub stance: Option<Stance>,
}

impl Seat {
    fn fresh(id: String, pid: String, name: &str, avatar: &str, bot: bool) -> Seat {
        Seat {
            id,
            pid,
            name: name.to_string(),
            avatar: avatar.to_string(),
            bot,
            connected: true,
            hole: Vec::new(),
            nodded: false,
            nod: None,
            locked: None,
            stance: None,
        }
    }

    fn clear_hand(&mut self) {
        self.hole.clear();
        self.nodded = false;
        self.nod = None;
        self.locked = None;
        self.stance = None;
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandResult {
    pub outcome: Outcome,
    /// Steps the marker moved: positive toward the door, negative toward the sirens.
    pub moved: i32,
    /// Seat ids that were In.
    pub ins: Vec<String>,
    pub crew_best: Option<HandValue>,
    pub house_best: HandValue,
    /// Seat ids whose hand was the crew's best (more than one on a tie).
    pub crew_champions: Vec<String>,
    /// Seat ids whose hand would have beaten the House had they been In.
    pub could_have: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub hand: u8,
    pub outcome: Outcome,
    pub moved: i32,
    /// How many were In.
    pub ins: u32,
    pub crew_best_name: Option<String>,
    pub house_best_name: String,
    /// The name of the seat whose hand carried the crew, if any.
    pub carrier: Option<String>,
    /// Nods the carrier received this hand.
    pub carrier_nods: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GameError {
    Full,
    NotHost,
    BadPhase,
    NotSeated,
    AlreadyLocked,
    SelfNod,
    TooFew,
}

impl GameError {
    /// The wire error code (see `ErrorCode` in `src/protocol.ts`).
    pub fn code(&self) -> &'static str {
        match self {
            GameError::Full => "full",
            GameError::NotHost => "not-host",
            _ => "bad-phase",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Game {
    pub code: String,
    pub phase: Phase,
    pub config: Config,
    pub seats: Vec<Seat>,
    /// Seat id of the host.
    pub host: Option<String>,
    pub rng: Rng,
    /// Full board for this hand, dealt up front and revealed in two steps.
    pub board: Vec<Card>,
    /// The House's cards; the first `HOUSE_UP` are face up.
    pub house: Vec<Card>,
    pub hand: u8,
    /// Where the marker stands: 0 at the start, `door` to escape, `-sirens` for a raid.
    pub meter: i32,
    pub door: u32,
    pub sirens: u32,
    pub deadline: Option<Ms>,
    pub result: Option<HandResult>,
    pub history: Vec<HistoryEntry>,
    pub verdict: Option<Verdict>,
    pub ready: Vec<String>,
    /// Counter for naming bots.
    pub bots_made: u32,
    /// Bumps on every change, so clients and the room can drop stale work.
    pub version: u64,
    /// Nights started at this table, so a second night reads differently.
    pub night: u32,
}

const BOT_NAMES: [&str; 12] = [
    "Tetsu", "Okami", "Hana", "Gin", "Kuro", "Sumi", "Rin", "Jun", "Mame", "Taka", "Nao", "Fuji",
];
const AVATARS: [&str; 8] = [
    "kitsune", "tanuki", "koi", "tsuru", "tora", "usagi", "karasu", "hebi",
];

impl Game {
    pub fn new(code: &str, seed: u64) -> Game {
        let config = Config::default();
        Game {
            code: code.to_string(),
            phase: Phase::Lobby,
            door: door_for(config.difficulty, MIN_CREW),
            sirens: sirens_for(config.difficulty, MIN_CREW),
            config,
            seats: Vec::new(),
            host: None,
            rng: Rng::seeded(seed),
            board: Vec::new(),
            house: Vec::new(),
            hand: 0,
            meter: 0,
            deadline: None,
            result: None,
            history: Vec::new(),
            verdict: None,
            ready: Vec::new(),
            bots_made: 0,
            version: 0,
            night: 0,
        }
    }

    // ---------------------------------------------------------------- lookups

    pub fn seat(&self, id: &str) -> Option<&Seat> {
        self.seats.iter().find(|s| s.id == id)
    }

    fn seat_mut(&mut self, id: &str) -> Option<&mut Seat> {
        self.seats.iter_mut().find(|s| s.id == id)
    }

    pub fn seat_of_pid(&self, pid: &str) -> Option<&Seat> {
        self.seats.iter().find(|s| s.pid == pid)
    }

    /// The host, or, when the host is away, any connected human may act for the table.
    pub fn can_host(&self, seat: &str) -> bool {
        if self.host.as_deref() == Some(seat) {
            return true;
        }
        let host_here = self
            .host
            .as_deref()
            .and_then(|h| self.seat(h))
            .is_some_and(|h| h.connected);
        !host_here && self.seat(seat).is_some_and(|s| !s.bot && s.connected)
    }

    fn free_seat_id(&self) -> Option<String> {
        (0..MAX_CREW)
            .map(|i| format!("s{i}"))
            .find(|id| self.seat(id).is_none())
    }

    fn touch(&mut self) {
        self.version += 1;
    }

    fn sort_seats(&mut self) {
        self.seats.sort_by(|a, b| a.id.cmp(&b.id));
    }

    /// Nods this seat received this hand (only meaningful once nods are revealed).
    pub fn nods_on(&self, seat: &str) -> u32 {
        self.seats
            .iter()
            .filter(|s| s.nod.as_deref() == Some(seat))
            .count() as u32
    }

    // ------------------------------------------------------------------ lobby

    /// Take a seat, or reclaim the one this `pid` already holds. Returns the seat
    /// id, or `None` when the viewer must spectate (table full or night running).
    pub fn join(&mut self, pid: &str, name: &str, avatar: &str) -> Option<String> {
        if let Some(id) = self.seat_of_pid(pid).map(|s| s.id.clone()) {
            let s = self.seat_mut(&id).expect("seat exists");
            s.connected = true;
            s.name = name.to_string();
            s.avatar = avatar.to_string();
            self.touch();
            return Some(id);
        }
        if self.phase != Phase::Lobby {
            return None;
        }
        let id = self.free_seat_id()?;
        self.seats
            .push(Seat::fresh(id.clone(), pid.to_string(), name, avatar, false));
        self.sort_seats();
        if self.host.is_none() {
            self.host = Some(id.clone());
        }
        self.retrack();
        self.touch();
        Some(id)
    }

    pub fn rename(&mut self, seat: &str, name: &str, avatar: &str) {
        if let Some(s) = self.seat_mut(seat) {
            s.name = name.to_string();
            s.avatar = avatar.to_string();
            self.touch();
        }
    }

    /// A socket for this seat opened or closed. Mid-hand, a seat that drops
    /// can unblock the table, so this may advance the game.
    pub fn set_connected(&mut self, seat: &str, connected: bool, now: Ms) {
        let Some(s) = self.seat_mut(seat) else { return };
        if s.connected == connected {
            return;
        }
        s.connected = connected;
        self.touch();
        match self.phase {
            // Leaving the lobby frees the chair, so a closed tab doesn't hold a seat forever.
            Phase::Lobby if !connected => self.remove_seat(seat),
            Phase::Nod | Phase::Call => self.maybe_resolve(now),
            Phase::Showdown => self.maybe_advance_showdown(now),
            _ => {}
        }
    }

    fn remove_seat(&mut self, seat: &str) {
        self.seats.retain(|s| s.id != seat);
        if self.host.as_deref() == Some(seat) {
            self.host = self.seats.iter().find(|s| !s.bot).map(|s| s.id.clone());
        }
        self.retrack();
        self.touch();
    }

    /// The track's length follows the table and the crew while in the lobby.
    fn retrack(&mut self) {
        if self.phase == Phase::Lobby {
            let crew = self.seats.len().max(MIN_CREW);
            self.door = door_for(self.config.difficulty, crew);
            self.sirens = sirens_for(self.config.difficulty, crew);
        }
    }

    pub fn kick(&mut self, by: &str, seat: &str) -> Result<(), GameError> {
        if !self.can_host(by) {
            return Err(GameError::NotHost);
        }
        if self.phase != Phase::Lobby || by == seat {
            return Err(GameError::BadPhase);
        }
        if self.seat(seat).is_none() {
            return Err(GameError::NotSeated);
        }
        self.remove_seat(seat);
        Ok(())
    }

    pub fn add_bot(&mut self, by: &str) -> Result<String, GameError> {
        if !self.can_host(by) {
            return Err(GameError::NotHost);
        }
        if self.phase != Phase::Lobby {
            return Err(GameError::BadPhase);
        }
        let id = self.free_seat_id().ok_or(GameError::Full)?;
        let taken: Vec<&str> = self.seats.iter().map(|s| s.name.as_str()).collect();
        let start = self.rng.below(BOT_NAMES.len() as u32) as usize;
        let name = (0..BOT_NAMES.len())
            .map(|i| BOT_NAMES[(start + i) % BOT_NAMES.len()])
            .find(|n| !taken.contains(n))
            .unwrap_or("Regular");
        let used: Vec<&str> = self.seats.iter().map(|s| s.avatar.as_str()).collect();
        let avatar = AVATARS
            .iter()
            .find(|a| !used.contains(a))
            .unwrap_or(&AVATARS[0]);
        self.bots_made += 1;
        let pid = format!("bot:{}", self.bots_made);
        self.seats
            .push(Seat::fresh(id.clone(), pid, name, avatar, true));
        self.sort_seats();
        self.retrack();
        self.touch();
        Ok(id)
    }

    pub fn remove_bot(&mut self, by: &str) -> Result<(), GameError> {
        if !self.can_host(by) {
            return Err(GameError::NotHost);
        }
        if self.phase != Phase::Lobby {
            return Err(GameError::BadPhase);
        }
        let id = self
            .seats
            .iter()
            .rev()
            .find(|s| s.bot)
            .map(|s| s.id.clone())
            .ok_or(GameError::NotSeated)?;
        self.remove_seat(&id);
        Ok(())
    }

    pub fn set_config(
        &mut self,
        by: &str,
        difficulty: Option<Difficulty>,
        timer: Option<u8>,
    ) -> Result<(), GameError> {
        if !self.can_host(by) {
            return Err(GameError::NotHost);
        }
        if self.phase != Phase::Lobby {
            return Err(GameError::BadPhase);
        }
        if let Some(d) = difficulty {
            self.config.difficulty = d;
        }
        if let Some(t) = timer.filter(|t| matches!(t, 0 | 15 | 30 | 60)) {
            self.config.timer = t;
        }
        self.retrack();
        self.touch();
        Ok(())
    }

    // ------------------------------------------------------------------ night

    pub fn start(&mut self, by: &str, now: Ms) -> Result<(), GameError> {
        if !self.can_host(by) {
            return Err(GameError::NotHost);
        }
        if self.phase != Phase::Lobby {
            return Err(GameError::BadPhase);
        }
        if self.seats.len() < MIN_CREW {
            return Err(GameError::TooFew);
        }
        self.retrack();
        self.night += 1;
        self.meter = 0;
        self.hand = 0;
        self.history.clear();
        self.verdict = None;
        self.deal(now);
        Ok(())
    }

    /// Back to the lobby with the same crew, for another night.
    pub fn again(&mut self, by: &str) -> Result<(), GameError> {
        if !self.can_host(by) {
            return Err(GameError::NotHost);
        }
        if self.phase != Phase::Over {
            return Err(GameError::BadPhase);
        }
        self.phase = Phase::Lobby;
        // Humans who left mid-night give their chair back now.
        let gone: Vec<String> = self
            .seats
            .iter()
            .filter(|s| !s.bot && !s.connected)
            .map(|s| s.id.clone())
            .collect();
        for id in gone {
            self.remove_seat(&id);
        }
        for s in &mut self.seats {
            s.clear_hand();
        }
        self.board.clear();
        self.house.clear();
        self.hand = 0;
        self.meter = 0;
        self.result = None;
        self.history.clear();
        self.verdict = None;
        self.ready.clear();
        self.deadline = None;
        self.retrack();
        self.touch();
        Ok(())
    }

    fn deal(&mut self, now: Ms) {
        self.hand += 1;
        let mut deck = full_deck();
        self.rng.shuffle(&mut deck);
        let mut draw = || {
            deck.pop()
                .expect("52 cards cover 6 seats, the House, and a board")
        };
        for i in 0..self.seats.len() {
            let hole = vec![draw(), draw()];
            let s = &mut self.seats[i];
            s.clear_hand();
            s.hole = hole;
        }
        self.house = (0..house_cards(self.config.difficulty, self.seats.len()))
            .map(|_| draw())
            .collect();
        self.board = (0..5).map(|_| draw()).collect();
        self.result = None;
        self.ready.clear();
        self.phase = Phase::Nod;
        self.deadline = self.decision_deadline(now);
        self.touch();
    }

    fn decision_deadline(&self, now: Ms) -> Option<Ms> {
        (self.config.timer > 0).then(|| now + u64::from(self.config.timer) * 1000)
    }

    /// Seats that still owe a decision in the current phase.
    pub fn awaiting(&self) -> Vec<&Seat> {
        match self.phase {
            Phase::Nod => self.seats.iter().filter(|s| !s.nodded).collect(),
            Phase::Call => self.seats.iter().filter(|s| s.locked.is_none()).collect(),
            _ => Vec::new(),
        }
    }

    /// Nod at a teammate (`Some(seat)`), or pass (`None`).
    pub fn nod(&mut self, seat: &str, at: Option<&str>, now: Ms) -> Result<(), GameError> {
        if self.phase != Phase::Nod {
            return Err(GameError::BadPhase);
        }
        if at == Some(seat) {
            return Err(GameError::SelfNod);
        }
        if let Some(t) = at
            && self.seat(t).is_none()
        {
            return Err(GameError::NotSeated);
        }
        let s = self.seat_mut(seat).ok_or(GameError::NotSeated)?;
        if s.nodded {
            return Err(GameError::AlreadyLocked);
        }
        s.nodded = true;
        s.nod = at.map(str::to_string);
        self.touch();
        self.maybe_resolve(now);
        Ok(())
    }

    /// Pick In or Out.
    pub fn call(&mut self, seat: &str, stance: Stance, now: Ms) -> Result<(), GameError> {
        if self.phase != Phase::Call {
            return Err(GameError::BadPhase);
        }
        let s = self.seat_mut(seat).ok_or(GameError::NotSeated)?;
        if s.locked.is_some() {
            return Err(GameError::AlreadyLocked);
        }
        s.locked = Some(stance);
        self.touch();
        self.maybe_resolve(now);
        Ok(())
    }

    /// Move on once every connected seat has decided. Disconnected seats
    /// never hold up the table: they pass on the nod and sit Out.
    fn maybe_resolve(&mut self, now: Ms) {
        let blocked = self.awaiting().iter().any(|s| s.connected);
        if !blocked {
            self.resolve(now);
        }
    }

    fn resolve(&mut self, now: Ms) {
        match self.phase {
            Phase::Nod => {
                for s in &mut self.seats {
                    s.nodded = true;
                }
                self.phase = Phase::Call;
                self.deadline = self.decision_deadline(now);
                self.touch();
            }
            Phase::Call => {
                for s in &mut self.seats {
                    s.stance = Some(s.locked.take().unwrap_or(Stance::Out));
                }
                self.showdown(now);
            }
            _ => {}
        }
    }

    pub fn evaluate_seat(&self, s: &Seat) -> HandValue {
        let mut cards = s.hole.clone();
        cards.extend_from_slice(&self.board);
        evaluate(&cards)
    }

    pub fn house_value(&self) -> HandValue {
        let mut cards = self.house.clone();
        cards.extend_from_slice(&self.board);
        evaluate(&cards)
    }

    fn showdown(&mut self, now: Ms) {
        let house_best = self.house_value();
        let values: Vec<(String, HandValue)> = self
            .seats
            .iter()
            .map(|s| (s.id.clone(), self.evaluate_seat(s)))
            .collect();
        let ins: Vec<String> = self
            .seats
            .iter()
            .filter(|s| s.stance == Some(Stance::In))
            .map(|s| s.id.clone())
            .collect();
        let crew_top = values
            .iter()
            .filter(|(id, _)| ins.contains(id))
            .map(|(_, v)| v.score)
            .max();
        let crew_champions: Vec<String> = match crew_top {
            Some(top) => values
                .iter()
                .filter(|(id, v)| ins.contains(id) && v.score == top)
                .map(|(id, _)| id.clone())
                .collect(),
            None => Vec::new(),
        };
        let crew_best = crew_top
            .and_then(|top| values.iter().find(|(_, v)| v.score == top))
            .map(|(_, v)| v.clone());
        let could_have: Vec<String> = values
            .iter()
            .filter(|(_, v)| v.score > house_best.score)
            .map(|(id, _)| id.clone())
            .collect();

        let n = ins.len() as i32;
        let outcome = match crew_top {
            None => Outcome::Walked,
            Some(c) if c > house_best.score => Outcome::Crew,
            Some(c) if c == house_best.score => Outcome::Tie,
            Some(_) => Outcome::House,
        };
        let moved = match outcome {
            Outcome::Crew => n,
            Outcome::House => -n,
            Outcome::Tie => 0,
            // Nobody risked anything; the clock still runs.
            Outcome::Walked => 0,
        };
        self.meter += moved;

        let carrier = crew_champions.first().cloned();
        self.history.push(HistoryEntry {
            hand: self.hand,
            outcome,
            moved,
            ins: n as u32,
            crew_best_name: crew_best.as_ref().map(|v| v.name.clone()),
            house_best_name: house_best.name.clone(),
            carrier: carrier
                .as_deref()
                .and_then(|id| self.seat(id))
                .map(|s| s.name.clone()),
            carrier_nods: carrier.as_deref().map_or(0, |id| self.nods_on(id)),
        });
        self.result = Some(HandResult {
            outcome,
            moved,
            ins,
            crew_best,
            house_best,
            crew_champions,
            could_have,
        });
        self.ready.clear();

        if self.meter >= self.door as i32 {
            self.finish(Verdict::Clean);
        } else if self.meter <= -(self.sirens as i32) {
            self.finish(Verdict::Raid);
        } else if self.hand >= LAST_ORDERS {
            self.finish(Verdict::Dawn);
        } else {
            self.phase = Phase::Showdown;
            self.deadline = Some(now + SHOWDOWN_SECONDS * 1000);
        }
        self.touch();
    }

    fn finish(&mut self, verdict: Verdict) {
        self.verdict = Some(verdict);
        self.phase = Phase::Over;
        self.deadline = None;
    }

    /// "Next" pressed during the showdown.
    pub fn next(&mut self, seat: &str, now: Ms) -> Result<(), GameError> {
        if self.phase != Phase::Showdown {
            return Err(GameError::BadPhase);
        }
        if self.seat(seat).is_none() {
            return Err(GameError::NotSeated);
        }
        if !self.ready.iter().any(|r| r == seat) {
            self.ready.push(seat.to_string());
            self.touch();
        }
        self.maybe_advance_showdown(now);
        Ok(())
    }

    fn maybe_advance_showdown(&mut self, now: Ms) {
        if self.phase != Phase::Showdown {
            return;
        }
        let waiting = self
            .seats
            .iter()
            .any(|s| !s.bot && s.connected && !self.ready.contains(&s.id));
        if !waiting {
            self.deal(now);
        }
    }

    /// Timer wake-up. An expired nod is a pass, an expired call is Out, and
    /// an expired showdown deals on.
    pub fn tick(&mut self, now: Ms) {
        let Some(deadline) = self.deadline else {
            return;
        };
        if now < deadline {
            return;
        }
        match self.phase {
            Phase::Nod | Phase::Call => self.resolve(now),
            Phase::Showdown => self.deal(now),
            Phase::Lobby | Phase::Over => self.deadline = None,
        }
    }

    /// Board cards face up so far.
    pub fn dealt_board(&self) -> usize {
        match self.phase {
            Phase::Lobby => 0,
            Phase::Nod => 3,
            Phase::Call | Phase::Showdown | Phase::Over => self.board.len(),
        }
    }

    /// Bots that still owe a decision in this phase.
    pub fn bots_to_act(&self) -> Vec<String> {
        self.awaiting()
            .into_iter()
            .filter(|s| s.bot)
            .map(|s| s.id.clone())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rules::HOUSE_UP;

    fn table_of(humans: usize, bots: usize) -> (Game, Vec<String>) {
        let mut g = Game::new("K7QX2", 1);
        let mut ids = Vec::new();
        for i in 0..humans {
            ids.push(
                g.join(&format!("pid-{i:08}"), &format!("P{i}"), "koi")
                    .unwrap(),
            );
        }
        for _ in 0..bots {
            ids.push(g.add_bot(&ids[0]).unwrap());
        }
        (g, ids)
    }

    fn all_pass(g: &mut Game, ids: &[String], now: Ms) {
        for id in ids {
            if g.phase == Phase::Nod {
                let _ = g.nod(id, None, now);
            }
        }
    }

    fn all_call(g: &mut Game, ids: &[String], stance: Stance, now: Ms) {
        for id in ids {
            if g.phase == Phase::Call {
                let _ = g.call(id, stance, now);
            }
        }
    }

    #[test]
    fn first_joiner_hosts_and_seats_fill_in_order() {
        let (g, ids) = table_of(3, 0);
        assert_eq!(ids, vec!["s0", "s1", "s2"]);
        assert_eq!(g.host.as_deref(), Some("s0"));
    }

    #[test]
    fn rejoining_reclaims_the_same_seat_mid_night() {
        let (mut g, ids) = table_of(2, 0);
        g.start(&ids[0], 0).unwrap();
        g.set_connected(&ids[1], false, 10);
        assert_eq!(
            g.join("pid-00000001", "Back", "tora"),
            Some("s1".to_string())
        );
        assert!(g.seat("s1").unwrap().connected);
        // A stranger mid-night spectates.
        assert_eq!(g.join("pid-stranger", "X", "koi"), None);
    }

    #[test]
    fn table_seats_six_at_most() {
        let (mut g, ids) = table_of(1, 5);
        assert_eq!(g.add_bot(&ids[0]), Err(GameError::Full));
        assert_eq!(g.join("pid-latecomer", "Late", "koi"), None);
    }

    #[test]
    fn only_the_host_runs_the_lobby() {
        let (mut g, ids) = table_of(2, 0);
        assert_eq!(g.add_bot(&ids[1]), Err(GameError::NotHost));
        assert_eq!(g.start(&ids[1], 0), Err(GameError::NotHost));
        // Host steps away mid-lobby: their chair frees up and the next human hosts.
        g.set_connected(&ids[0], false, 0);
        assert_eq!(g.host.as_deref(), Some("s1"));
    }

    #[test]
    fn a_night_needs_two() {
        let (mut g, ids) = table_of(1, 0);
        assert_eq!(g.start(&ids[0], 0), Err(GameError::TooFew));
    }

    #[test]
    fn the_track_follows_the_table_and_the_crew() {
        let (mut g, ids) = table_of(2, 0);
        assert_eq!(g.door, door_for(Difficulty::Shitamachi, 2));
        g.add_bot(&ids[0]).unwrap();
        assert_eq!(g.door, door_for(Difficulty::Shitamachi, 3));
        g.set_config(&ids[0], Some(Difficulty::Oyabun), None)
            .unwrap();
        assert_eq!(g.sirens, sirens_for(Difficulty::Oyabun, 3));
    }

    #[test]
    fn deal_gives_two_cards_each_and_the_house_its_table_size() {
        let (mut g, ids) = table_of(2, 4);
        g.set_config(&ids[0], Some(Difficulty::Oyabun), None)
            .unwrap();
        g.start(&ids[0], 0).unwrap();
        let mut all: Vec<Card> = g.board.clone();
        for s in &g.seats {
            assert_eq!(s.hole.len(), 2);
            all.extend(&s.hole);
        }
        assert_eq!(g.house.len(), 8);
        assert!(HOUSE_UP < g.house.len());
        all.extend(&g.house);
        let n = all.len();
        all.sort();
        all.dedup();
        assert_eq!(all.len(), n, "duplicate card dealt");
        assert_eq!(g.phase, Phase::Nod);
        assert_eq!(g.dealt_board(), 3);
    }

    #[test]
    fn nods_wait_for_everyone_then_the_call_opens() {
        let (mut g, ids) = table_of(3, 0);
        g.start(&ids[0], 0).unwrap();
        assert_eq!(g.nod(&ids[0], Some("s0"), 1), Err(GameError::SelfNod));
        assert_eq!(g.nod(&ids[0], Some("s9"), 1), Err(GameError::NotSeated));
        g.nod(&ids[0], Some("s1"), 1).unwrap();
        assert_eq!(g.nod(&ids[0], None, 1), Err(GameError::AlreadyLocked));
        g.nod(&ids[1], Some("s0"), 1).unwrap();
        assert_eq!(g.phase, Phase::Nod);
        assert_eq!(g.call(&ids[0], Stance::In, 1), Err(GameError::BadPhase));
        g.nod(&ids[2], Some("s1"), 1).unwrap();
        assert_eq!(g.phase, Phase::Call);
        assert_eq!(g.dealt_board(), 5);
        assert_eq!(g.nods_on("s1"), 2);
        assert_eq!(g.nods_on("s0"), 1);
        assert_eq!(g.nods_on("s2"), 0);
    }

    #[test]
    fn the_marker_moves_one_step_per_player_in() {
        for seed in 0..300 {
            let mut g = Game::new("K7QX2", seed);
            let a = g.join("pid-aaaaaaaa", "A", "koi").unwrap();
            let b = g.join("pid-bbbbbbbb", "B", "koi").unwrap();
            let c = g.add_bot(&a).unwrap();
            g.start(&a, 0).unwrap();
            let ids = [a.clone(), b.clone(), c.clone()];
            all_pass(&mut g, &ids, 1);
            g.call(&a, Stance::In, 2).unwrap();
            g.call(&b, Stance::In, 2).unwrap();
            g.call(&c, Stance::Out, 2).unwrap();
            let r = g.result.clone().unwrap();
            let house = g.house_value().score;
            let best = [&a, &b]
                .iter()
                .map(|id| g.evaluate_seat(g.seat(id).unwrap()).score)
                .max()
                .unwrap();
            let expect = if best > house {
                2
            } else if best == house {
                0
            } else {
                -2
            };
            assert_eq!(r.moved, expect, "{r:?}");
            assert_eq!(g.meter, expect);
            assert_eq!(r.ins, vec![a.clone(), b.clone()]);
            assert!(!r.crew_champions.contains(&c), "Out never carries");
            let c_beats = g.evaluate_seat(g.seat(&c).unwrap()).score > house;
            assert_eq!(r.could_have.contains(&c), c_beats);
        }
    }

    #[test]
    fn everyone_out_moves_nothing_but_the_clock_runs() {
        let (mut g, ids) = table_of(2, 0);
        g.start(&ids[0], 0).unwrap();
        all_pass(&mut g, &ids, 1);
        all_call(&mut g, &ids, Stance::Out, 2);
        let r = g.result.clone().unwrap();
        assert_eq!(r.outcome, Outcome::Walked);
        assert_eq!(g.meter, 0);
        assert_eq!(g.history.len(), 1);
        assert_eq!(g.phase, Phase::Showdown);
    }

    #[test]
    fn timers_pass_the_nod_and_sit_you_out() {
        let (mut g, ids) = table_of(2, 0);
        g.config.timer = 15;
        g.start(&ids[0], 1_000).unwrap();
        assert_eq!(g.deadline, Some(16_000));
        g.nod(&ids[0], Some("s1"), 2_000).unwrap();
        g.tick(15_999);
        assert_eq!(g.phase, Phase::Nod);
        g.tick(16_000);
        assert_eq!(g.phase, Phase::Call);
        assert_eq!(g.seat("s1").unwrap().nod, None);
        g.call(&ids[0], Stance::In, 17_000).unwrap();
        g.tick(16_000 + 15_000);
        assert_eq!(g.seat("s1").unwrap().stance, Some(Stance::Out));
        assert_eq!(g.seat("s0").unwrap().stance, Some(Stance::In));
    }

    #[test]
    fn disconnected_seats_do_not_block_the_table() {
        let (mut g, ids) = table_of(2, 0);
        g.config.timer = 0;
        g.start(&ids[0], 0).unwrap();
        g.nod(&ids[0], None, 1).unwrap();
        g.set_connected(&ids[1], false, 2);
        assert_eq!(g.phase, Phase::Call);
        g.call(&ids[0], Stance::Out, 3).unwrap();
        assert_eq!(g.seat("s1").unwrap().stance, Some(Stance::Out));
    }

    #[test]
    fn a_full_night_ends_at_the_door_the_sirens_or_last_orders() {
        for seed in 0..40 {
            let mut g = Game::new("K7QX2", seed);
            let a = g.join("pid-aaaaaaaa", "A", "koi").unwrap();
            let mut ids = vec![a.clone()];
            ids.push(g.add_bot(&a).unwrap());
            ids.push(g.add_bot(&a).unwrap());
            g.start(&a, 0).unwrap();
            let mut now = 0;
            let mut guard = 0;
            while g.phase != Phase::Over {
                guard += 1;
                assert!(guard < 100, "night never ended");
                now += 1000;
                match g.phase {
                    Phase::Nod => all_pass(&mut g, &ids, now),
                    Phase::Call => {
                        let stance = if seed % 2 == 0 { Stance::In } else { Stance::Out };
                        all_call(&mut g, &ids, stance, now)
                    }
                    Phase::Showdown => g.next(&a, now).unwrap(),
                    _ => unreachable!(),
                }
            }
            assert_eq!(g.history.len(), g.hand as usize);
            match g.verdict.unwrap() {
                Verdict::Clean => assert!(g.meter >= g.door as i32),
                Verdict::Raid => assert!(g.meter <= -(g.sirens as i32)),
                Verdict::Dawn => assert_eq!(g.hand, LAST_ORDERS),
            }
            let sum: i32 = g.history.iter().map(|h| h.moved).sum();
            assert_eq!(sum, g.meter);
            g.again(&a).unwrap();
            assert_eq!(g.phase, Phase::Lobby);
            assert_eq!(g.meter, 0);
            g.start(&a, now).unwrap();
            assert_eq!(g.night, 2, "another night counts");
        }
    }

    #[test]
    fn showdown_waits_for_humans_or_the_clock() {
        let (mut g, ids) = table_of(2, 1);
        g.start(&ids[0], 0).unwrap();
        all_pass(&mut g, &ids, 1);
        all_call(&mut g, &ids, Stance::Out, 1);
        assert_eq!(g.phase, Phase::Showdown);
        g.next(&ids[0], 2).unwrap();
        assert_eq!(g.hand, 1);
        g.tick(1 + SHOWDOWN_SECONDS * 1000);
        assert_eq!(g.hand, 2);
        assert_eq!(g.phase, Phase::Nod);
    }

    #[test]
    fn history_names_the_carrier_and_their_nods() {
        let (mut g, ids) = table_of(2, 1);
        g.start(&ids[0], 0).unwrap();
        // Make s1 a lock: a royal flush on the board for s1 only isn't possible,
        // so give s1 the nuts by hand.
        g.board = crate::card::cards("Ah Kh Qh 2c 3d");
        g.seats[1].hole = crate::card::cards("Jh Th");
        g.seats[0].hole = crate::card::cards("4s 5s");
        g.seats[2].hole = crate::card::cards("7c 8d");
        g.house = crate::card::cards("9s 9c 6d");
        g.nod(&ids[0], Some("s1"), 1).unwrap();
        g.nod(&ids[1], None, 1).unwrap();
        g.nod(&ids[2], Some("s1"), 1).unwrap();
        g.call(&ids[0], Stance::In, 2).unwrap();
        g.call(&ids[1], Stance::In, 2).unwrap();
        g.call(&ids[2], Stance::Out, 2).unwrap();
        let h = g.history.last().unwrap();
        assert_eq!(h.outcome, Outcome::Crew);
        assert_eq!(h.moved, 2);
        assert_eq!(h.carrier.as_deref(), Some("P1"));
        assert_eq!(h.carrier_nods, 2);
    }

    #[test]
    fn game_round_trips_through_json() {
        let (mut g, ids) = table_of(2, 1);
        g.start(&ids[0], 0).unwrap();
        let json = serde_json::to_string(&g).unwrap();
        let back: Game = serde_json::from_str(&json).unwrap();
        assert_eq!(back, g);
    }
}
