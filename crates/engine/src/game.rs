//! The night: seats, the deal, simultaneous calls, the showdown, the verdict.
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
    Difficulty, HANDS_PER_NIGHT, MAX_CREW, MAX_STAKE, MIN_CREW, RuleId, SHOWDOWN_SECONDS,
    heat_limit_for, house_hands, table, target_for,
};

pub type Ms = u64;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Stance {
    Fold,
    Stay,
    Raise,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Lobby,
    Call,
    Showdown,
    Over,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Verdict {
    Clean,
    Raid,
    Short,
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
    /// Seconds per call; 0 = no timer.
    pub timer: u8,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            difficulty: Difficulty::Kabukicho,
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
    pub active: bool,
    pub stake: u8,
    /// Calls made on each street this hand.
    pub calls: [Option<Stance>; 4],
    /// The call locked in for the current street, not yet revealed.
    pub locked: Option<Stance>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandResult {
    pub outcome: Outcome,
    pub take: u32,
    pub heat: u32,
    pub crew_best: Option<HandValue>,
    pub house_best: HandValue,
    /// Seat ids whose hand was the crew's best (more than one on a tie).
    pub crew_champions: Vec<String>,
    /// Indexes into `house` of the House's best hand(s).
    pub house_champions: Vec<usize>,
    /// Seat ids that stayed in, lost to the House on their own, and drew heat.
    pub burned: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub hand: u8,
    pub rule: Option<RuleId>,
    pub outcome: Outcome,
    pub take: u32,
    pub heat: u32,
    pub crew_best_name: Option<String>,
    pub house_best_name: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GameError {
    Full,
    NotHost,
    BadPhase,
    NotSeated,
    NotActive,
    AlreadyLocked,
    StakeCapped,
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
    /// Full board for this hand, dealt up front and revealed street by street.
    pub board: Vec<Card>,
    pub house: Vec<[Card; 2]>,
    pub street: u8,
    pub hand: u8,
    pub take: u32,
    pub heat: u32,
    pub target: u32,
    pub heat_limit: u32,
    pub rule: Option<RuleId>,
    /// House Rules still to draw this night; refilled and reshuffled when empty.
    pub rule_pile: Vec<RuleId>,
    /// Under Fox: the seat whose cards are public.
    pub fox: Option<String>,
    pub deadline: Option<Ms>,
    pub result: Option<HandResult>,
    pub history: Vec<HistoryEntry>,
    pub verdict: Option<Verdict>,
    pub ready: Vec<String>,
    /// Counter for naming bots.
    pub bots_made: u32,
    /// Bumps on every change, so clients and the room can drop stale work.
    pub version: u64,
    /// Simulator only: play all six hands even past the heat limit, so a
    /// night's whole trajectory can be measured.
    #[serde(default)]
    pub endless: bool,
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
        let heat_limit = heat_limit_for(config.difficulty, MIN_CREW);
        Game {
            code: code.to_string(),
            phase: Phase::Lobby,
            config,
            seats: Vec::new(),
            host: None,
            rng: Rng::seeded(seed),
            board: Vec::new(),
            house: Vec::new(),
            street: 0,
            hand: 0,
            take: 0,
            heat: 0,
            target: 0,
            heat_limit,
            endless: false,
            rule: None,
            rule_pile: Vec::new(),
            fox: None,
            deadline: None,
            result: None,
            history: Vec::new(),
            verdict: None,
            ready: Vec::new(),
            bots_made: 0,
            version: 0,
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
        self.seats.push(Seat {
            id: id.clone(),
            pid: pid.to_string(),
            name: name.to_string(),
            avatar: avatar.to_string(),
            bot: false,
            connected: true,
            hole: Vec::new(),
            active: true,
            stake: 1,
            calls: [None; 4],
            locked: None,
        });
        self.sort_seats();
        if self.host.is_none() {
            self.host = Some(id.clone());
        }
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

    /// A socket for this seat opened or closed. During a call, a seat that
    /// drops can unblock the street, so this may advance the game.
    pub fn set_connected(&mut self, seat: &str, connected: bool, now: Ms) {
        let Some(s) = self.seat_mut(seat) else { return };
        if s.connected == connected {
            return;
        }
        s.connected = connected;
        self.touch();
        if self.phase == Phase::Lobby && !connected {
            // Leaving the lobby frees the chair, so a closed tab doesn't hold a seat forever.
            self.remove_seat(seat);
        } else if self.phase == Phase::Call {
            self.maybe_resolve_street(now);
        } else if self.phase == Phase::Showdown {
            self.maybe_advance_showdown(now);
        }
    }

    fn remove_seat(&mut self, seat: &str) {
        self.seats.retain(|s| s.id != seat);
        if self.host.as_deref() == Some(seat) {
            self.host = self.seats.iter().find(|s| !s.bot).map(|s| s.id.clone());
        }
        self.touch();
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
        self.seats.push(Seat {
            id: id.clone(),
            pid: format!("bot:{}", self.bots_made),
            name: name.to_string(),
            avatar: avatar.to_string(),
            bot: true,
            connected: true,
            hole: Vec::new(),
            active: true,
            stake: 1,
            calls: [None; 4],
            locked: None,
        });
        self.sort_seats();
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
        self.heat_limit = heat_limit_for(self.config.difficulty, self.seats.len());
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
        self.take = 0;
        self.heat = 0;
        self.hand = 0;
        self.heat_limit = heat_limit_for(self.config.difficulty, self.seats.len());
        self.target = target_for(self.config.difficulty, self.seats.len());
        self.history.clear();
        self.verdict = None;
        self.rule = None;
        self.rule_pile.clear();
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
            s.hole.clear();
            s.active = true;
            s.stake = 1;
            s.calls = [None; 4];
            s.locked = None;
        }
        self.board.clear();
        self.house.clear();
        self.street = 0;
        self.hand = 0;
        self.take = 0;
        self.heat = 0;
        self.rule = None;
        self.fox = None;
        self.result = None;
        self.history.clear();
        self.verdict = None;
        self.ready.clear();
        self.deadline = None;
        self.touch();
        Ok(())
    }

    fn draw_rule(&mut self) -> Option<RuleId> {
        let spec = table(self.config.difficulty);
        if self.hand < spec.rule_from {
            return None;
        }
        if self.rule_pile.is_empty() {
            self.rule_pile = spec.deck.to_vec();
            self.rng.shuffle(&mut self.rule_pile);
            // Never the same rule twice in a row across a reshuffle.
            if self.rule_pile.len() > 1 && self.rule_pile.last() == self.rule.as_ref() {
                let n = self.rule_pile.len();
                self.rule_pile.swap(0, n - 1);
            }
        }
        self.rule_pile.pop()
    }

    fn deal(&mut self, now: Ms) {
        self.hand += 1;
        self.rule = self.draw_rule();
        let mut deck = full_deck();
        self.rng.shuffle(&mut deck);
        let mut draw = || {
            deck.pop()
                .expect("52 cards cover 6 seats, 4 masks, and a board")
        };

        for i in 0..self.seats.len() {
            let hole = vec![draw(), draw()];
            let s = &mut self.seats[i];
            s.hole = hole;
            s.active = true;
            s.stake = 1;
            s.calls = [None; 4];
            s.locked = None;
        }
        let masks = house_hands(self.seats.len(), self.rule);
        self.house = (0..masks).map(|_| [draw(), draw()]).collect();
        self.board = (0..5).map(|_| draw()).collect();

        self.fox = if self.rule == Some(RuleId::Kitsune) && !self.seats.is_empty() {
            let i = self.rng.below(self.seats.len() as u32) as usize;
            Some(self.seats[i].id.clone())
        } else {
            None
        };
        self.street = 0;
        self.result = None;
        self.ready.clear();
        self.phase = Phase::Call;
        self.deadline = self.call_deadline(now);
        self.touch();
    }

    fn call_deadline(&self, now: Ms) -> Option<Ms> {
        (self.config.timer > 0).then(|| now + u64::from(self.config.timer) * 1000)
    }

    /// Seats that still owe a call on this street.
    pub fn awaiting(&self) -> Vec<&Seat> {
        if self.phase != Phase::Call {
            return Vec::new();
        }
        self.seats
            .iter()
            .filter(|s| s.active && s.locked.is_none())
            .collect()
    }

    pub fn call(&mut self, seat: &str, stance: Stance, now: Ms) -> Result<(), GameError> {
        if self.phase != Phase::Call {
            return Err(GameError::BadPhase);
        }
        let s = self.seat_mut(seat).ok_or(GameError::NotSeated)?;
        if !s.active {
            return Err(GameError::NotActive);
        }
        if s.locked.is_some() {
            return Err(GameError::AlreadyLocked);
        }
        if stance == Stance::Raise && s.stake >= MAX_STAKE {
            return Err(GameError::StakeCapped);
        }
        s.locked = Some(stance);
        self.touch();
        self.maybe_resolve_street(now);
        Ok(())
    }

    /// Resolve the street once every connected active seat has locked in.
    /// Disconnected seats never hold up the table; they count as Stay.
    fn maybe_resolve_street(&mut self, now: Ms) {
        if self.phase != Phase::Call {
            return;
        }
        let blocked = self
            .seats
            .iter()
            .any(|s| s.active && s.locked.is_none() && s.connected);
        if !blocked {
            self.resolve_street(now);
        }
    }

    fn resolve_street(&mut self, now: Ms) {
        let street = self.street as usize;
        let bond = self.rule == Some(RuleId::Kizuna);
        let mut raises = 0u8;
        for s in self.seats.iter_mut().filter(|s| s.active) {
            let stance = s.locked.take().unwrap_or(Stance::Stay);
            s.calls[street] = Some(stance);
            match stance {
                Stance::Fold => s.active = false,
                Stance::Raise => {
                    raises += 1;
                    if !bond {
                        s.stake = (s.stake + 1).min(MAX_STAKE);
                    }
                }
                Stance::Stay => {}
            }
        }
        if bond && raises > 0 {
            for s in self.seats.iter_mut().filter(|s| s.active) {
                s.stake = (s.stake + raises).min(MAX_STAKE);
            }
        }
        let anyone_in = self.seats.iter().any(|s| s.active);
        if self.street >= 3 || !anyone_in {
            self.showdown(now);
        } else {
            self.street += 1;
            self.deadline = self.call_deadline(now);
            self.touch();
        }
    }

    fn showdown(&mut self, now: Ms) {
        let lowball = self.rule == Some(RuleId::Gyaku);
        let better = |a: u32, b: u32| if lowball { a < b } else { a > b };

        let house_values: Vec<HandValue> = self
            .house
            .iter()
            .map(|h| {
                evaluate(&[
                    h[0],
                    h[1],
                    self.board[0],
                    self.board[1],
                    self.board[2],
                    self.board[3],
                    self.board[4],
                ])
            })
            .collect();
        let house_top = house_values
            .iter()
            .map(|v| v.score)
            .reduce(|a, b| if better(a, b) { a } else { b })
            .expect("the House always sits at least one hand");
        let house_champions: Vec<usize> = (0..house_values.len())
            .filter(|&i| house_values[i].score == house_top)
            .collect();
        let house_best = house_values[house_champions[0]].clone();

        let crew: Vec<(String, HandValue)> = self
            .seats
            .iter()
            .filter(|s| s.active)
            .map(|s| (s.id.clone(), self.evaluate_seat(s)))
            .collect();
        let crew_top = crew
            .iter()
            .map(|(_, v)| v.score)
            .reduce(|a, b| if better(a, b) { a } else { b });
        let crew_champions: Vec<String> = match crew_top {
            Some(top) => crew
                .iter()
                .filter(|(_, v)| v.score == top)
                .map(|(id, _)| id.clone())
                .collect(),
            None => Vec::new(),
        };
        let crew_best = crew_top
            .and_then(|top| crew.iter().find(|(_, v)| v.score == top))
            .map(|(_, v)| v.clone());

        let mult = if self.rule == Some(RuleId::Homura) {
            2
        } else {
            1
        };
        let serpent = self.rule == Some(RuleId::Hebi);
        let outcome = match crew_top {
            None => Outcome::Walked,
            Some(c) if better(c, house_top) => Outcome::Crew,
            Some(c) if c == house_top && !serpent => Outcome::Tie,
            Some(_) => Outcome::House,
        };
        // Take: when the champion wins, every stake still in gets paid.
        let stakes: u32 = self
            .seats
            .iter()
            .filter(|s| s.active)
            .map(|s| u32::from(s.stake))
            .sum();
        // Heat: anyone still in whose own hand lost to the House was seen,
        // even if the champion carried the hand. Under Serpent a tie is a loss.
        let burned: Vec<(String, u32)> = crew
            .iter()
            .filter(|(_, v)| better(house_top, v.score) || (serpent && v.score == house_top))
            .map(|(id, _)| {
                let stake = self.seat(id).map_or(1, |s| u32::from(s.stake));
                (id.clone(), stake)
            })
            .collect();
        let take = if outcome == Outcome::Crew {
            stakes * mult
        } else {
            0
        };
        let heat = match outcome {
            Outcome::Walked => mult,
            _ => burned.iter().map(|(_, s)| s).sum::<u32>() * mult,
        };
        let burned: Vec<String> = burned.into_iter().map(|(id, _)| id).collect();
        self.take += take;
        self.heat += heat;
        self.history.push(HistoryEntry {
            hand: self.hand,
            rule: self.rule,
            outcome,
            take,
            heat,
            crew_best_name: crew_best.as_ref().map(|v| v.name.clone()),
            house_best_name: house_best.name.clone(),
        });
        self.result = Some(HandResult {
            outcome,
            take,
            heat,
            crew_best,
            house_best,
            crew_champions,
            house_champions,
            burned,
        });
        self.ready.clear();

        if self.heat >= self.heat_limit && !self.endless {
            self.finish(Verdict::Raid);
        } else if self.hand >= HANDS_PER_NIGHT {
            self.finish(if self.take >= self.target {
                Verdict::Clean
            } else {
                Verdict::Short
            });
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

    pub fn evaluate_seat(&self, s: &Seat) -> HandValue {
        let mut cards = s.hole.clone();
        cards.extend_from_slice(&self.board);
        evaluate(&cards)
    }

    pub fn house_value(&self, i: usize) -> HandValue {
        let h = self.house[i];
        let mut cards = vec![h[0], h[1]];
        cards.extend_from_slice(&self.board);
        evaluate(&cards)
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

    /// Timer wake-up. Expired calls count as Stay; an expired showdown deals on.
    pub fn tick(&mut self, now: Ms) {
        let Some(deadline) = self.deadline else {
            return;
        };
        if now < deadline {
            return;
        }
        match self.phase {
            Phase::Call => self.resolve_street(now),
            Phase::Showdown => self.deal(now),
            Phase::Lobby | Phase::Over => self.deadline = None,
        }
    }

    /// The board cards dealt so far (face-up or not), by street.
    pub fn dealt_board(&self) -> usize {
        match self.phase {
            Phase::Lobby => 0,
            Phase::Showdown | Phase::Over => self.board.len(),
            Phase::Call => match self.street {
                0 => 0,
                1 => 3,
                2 => 4,
                _ => 5,
            },
        }
    }

    /// Bots that still owe a call this street.
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

    fn all_call(g: &mut Game, ids: &[String], stance: Stance, now: Ms) {
        for id in ids {
            if g.seat(id).unwrap().active && g.phase == Phase::Call {
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
    fn deal_gives_every_seat_two_cards_and_no_duplicates() {
        let (mut g, ids) = table_of(2, 4);
        g.start(&ids[0], 0).unwrap();
        let mut all: Vec<Card> = g.board.clone();
        for s in &g.seats {
            assert_eq!(s.hole.len(), 2);
            all.extend(&s.hole);
        }
        for h in &g.house {
            all.extend(h);
        }
        let n = all.len();
        all.sort();
        all.dedup();
        assert_eq!(all.len(), n, "duplicate card dealt");
        assert_eq!(g.house.len(), house_hands(6, g.rule));
    }

    #[test]
    fn streets_wait_for_every_active_seat_then_advance() {
        let (mut g, ids) = table_of(3, 0);
        g.start(&ids[0], 0).unwrap();
        g.call(&ids[0], Stance::Raise, 1).unwrap();
        g.call(&ids[1], Stance::Stay, 1).unwrap();
        assert_eq!(g.street, 0);
        assert_eq!(
            g.call(&ids[0], Stance::Stay, 1),
            Err(GameError::AlreadyLocked)
        );
        g.call(&ids[2], Stance::Fold, 1).unwrap();
        assert_eq!(g.street, 1);
        assert_eq!(g.seat("s0").unwrap().stake, 2);
        assert!(!g.seat("s2").unwrap().active);
        assert_eq!(g.seat("s0").unwrap().calls[0], Some(Stance::Raise));
        assert_eq!(g.call(&ids[2], Stance::Stay, 2), Err(GameError::NotActive));
    }

    #[test]
    fn stake_caps_at_three() {
        let (mut g, ids) = table_of(2, 0);
        g.start(&ids[0], 0).unwrap();
        for _ in 0..2 {
            all_call(&mut g, &ids, Stance::Raise, 1);
        }
        assert_eq!(g.seat("s0").unwrap().stake, 3);
        assert_eq!(
            g.call(&ids[0], Stance::Raise, 2),
            Err(GameError::StakeCapped)
        );
    }

    #[test]
    fn timer_expiry_counts_as_stay() {
        let (mut g, ids) = table_of(2, 0);
        g.config.timer = 15;
        g.start(&ids[0], 1_000).unwrap();
        assert_eq!(g.deadline, Some(16_000));
        g.call(&ids[0], Stance::Raise, 2_000).unwrap();
        g.tick(15_999);
        assert_eq!(g.street, 0);
        g.tick(16_000);
        assert_eq!(g.street, 1);
        assert_eq!(g.seat("s1").unwrap().calls[0], Some(Stance::Stay));
    }

    #[test]
    fn disconnected_seats_do_not_block_the_table() {
        let (mut g, ids) = table_of(2, 0);
        g.config.timer = 0;
        g.start(&ids[0], 0).unwrap();
        g.call(&ids[0], Stance::Stay, 1).unwrap();
        g.set_connected(&ids[1], false, 2);
        assert_eq!(g.street, 1);
    }

    #[test]
    fn everyone_folding_walks_away_with_one_heat() {
        let (mut g, ids) = table_of(2, 0);
        g.start(&ids[0], 0).unwrap();
        all_call(&mut g, &ids, Stance::Fold, 1);
        let r = g.result.clone().unwrap();
        assert_eq!(r.outcome, Outcome::Walked);
        assert_eq!(g.heat, 1);
        assert_eq!(g.phase, Phase::Showdown);
    }

    #[test]
    fn showdown_pays_or_burns_the_sum_of_active_stakes() {
        // Play many hands; every resolved hand must satisfy the accounting identity.
        for seed in 0..200 {
            let mut g = Game::new("K7QX2", seed);
            let a = g.join("pid-aaaaaaaa", "A", "koi").unwrap();
            let b = g.join("pid-bbbbbbbb", "B", "koi").unwrap();
            let c = g.add_bot(&a).unwrap();
            g.config.difficulty = Difficulty::Shitamachi;
            g.start(&a, 0).unwrap();
            let ids = [a.clone(), b.clone(), c.clone()];
            g.call(&a, Stance::Raise, 1).unwrap();
            g.call(&b, Stance::Stay, 1).unwrap();
            g.call(&c, Stance::Fold, 1).unwrap();
            for _ in 0..3 {
                all_call(&mut g, &ids, Stance::Stay, 2);
            }
            let r = g.result.clone().unwrap();
            let mult = if g.rule == Some(RuleId::Homura) { 2 } else { 1 };
            let stake = |id: &str| u32::from(g.seat(id).unwrap().stake);
            // A at 2, B at 1, C folded.
            let paid = if r.outcome == Outcome::Crew {
                3 * mult
            } else {
                0
            };
            let burned: u32 = r.burned.iter().map(|id| stake(id)).sum::<u32>() * mult;
            assert_eq!(r.take, paid, "{r:?}");
            assert_eq!(r.heat, burned, "{r:?}");
            assert!(!r.burned.contains(&c), "folded seats never draw heat");
            if r.outcome == Outcome::House {
                assert_eq!(
                    r.burned.len(),
                    2,
                    "on a loss every active seat lost on its own"
                );
            }
            if r.outcome == Outcome::Crew {
                assert!(r.burned.len() <= 1, "the champion never burns on a win");
            }
            assert!(
                !r.crew_champions.contains(&c),
                "folded seats never carry the crew"
            );
        }
    }

    #[test]
    fn bond_shares_raises_across_the_crew() {
        let (mut g, ids) = table_of(3, 0);
        g.start(&ids[0], 0).unwrap();
        g.rule = Some(RuleId::Kizuna);
        g.call(&ids[0], Stance::Raise, 1).unwrap();
        g.call(&ids[1], Stance::Raise, 1).unwrap();
        g.call(&ids[2], Stance::Stay, 1).unwrap();
        for s in &g.seats {
            assert_eq!(s.stake, 3, "two raises lift every stake by two");
        }
    }

    #[test]
    fn a_full_night_ends_with_a_verdict_and_history() {
        let (mut g, ids) = table_of(2, 2);
        g.start(&ids[0], 0).unwrap();
        let mut now = 0;
        let mut guard = 0;
        while g.phase != Phase::Over {
            guard += 1;
            assert!(guard < 200, "night never ended");
            now += 1000;
            match g.phase {
                Phase::Call => all_call(&mut g, &ids, Stance::Stay, now),
                Phase::Showdown => {
                    for id in &ids {
                        let _ = g.next(id, now);
                    }
                }
                _ => unreachable!(),
            }
        }
        let v = g.verdict.unwrap();
        assert_eq!(g.history.len(), g.hand as usize);
        match v {
            Verdict::Raid => assert!(g.heat >= g.heat_limit),
            Verdict::Clean => assert!(g.take >= g.target && g.hand == HANDS_PER_NIGHT),
            Verdict::Short => assert!(g.take < g.target && g.hand == HANDS_PER_NIGHT),
        }
        g.again(&ids[0]).unwrap();
        assert_eq!(g.phase, Phase::Lobby);
        assert_eq!(g.seats.len(), 4);
    }

    #[test]
    fn showdown_waits_for_humans_or_the_clock() {
        let (mut g, ids) = table_of(2, 1);
        g.start(&ids[0], 0).unwrap();
        all_call(&mut g, &ids, Stance::Fold, 1);
        assert_eq!(g.phase, Phase::Showdown);
        g.next(&ids[0], 2).unwrap();
        assert_eq!(g.hand, 1);
        g.tick(1 + SHOWDOWN_SECONDS * 1000);
        assert_eq!(g.hand, 2);
        assert_eq!(g.phase, Phase::Call);
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
