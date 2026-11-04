//! Balancing simulator.
//!
//! Plays full nights with a regular (bot) in every chair, for every table and
//! crew size, and measures them. Two modes (see `crates/sim/README.md`):
//!
//! ```text
//! hachi-sim [nights=300] [samples=200]          # tune BALANCE (steps to the door)
//! hachi-sim probe [nights=300] [samples=200]    # measure BALANCE as it stands
//! ```
//!
//! Tuning: the sirens sit a fixed distance from the start per table and crew
//! (closer at the harder tables). The door is then the distance that gets the
//! regulars away clean closest to 70% / 50% / 30% of nights, found by bisection,
//! with every candidate played at its own numbers (the regulars weigh steps by
//! how far each end is), and confirmed on fresh deals.
//!
//! The probe compares the regulars with weaker crews on the same deals, which
//! is how we know the game is cooperative: a crew that nods at random, never
//! nods, or ignores the nods it gets should do clearly worse.
//!
//! Env: `KNOBS="nod_min=0.5,caution=1.2"` overrides policy knobs;
//! `THREADS=2` caps worker threads.

use std::sync::atomic::{AtomicU64, Ordering};

use hachi_engine::bot::{Decision, KNOBS, Knobs, Policy, Temperament, decide};
use hachi_engine::card::Rng;
use hachi_engine::game::{Game, Outcome, Phase, Stance, Verdict};
use hachi_engine::rules::{BALANCE, Difficulty, MAX_CREW, MIN_CREW};
use hachi_engine::view::view_for;

const TABLES: [Difficulty; 3] = [
    Difficulty::Shitamachi,
    Difficulty::Kabukicho,
    Difficulty::Oyabun,
];
const GOALS: [f64; 3] = [0.70, 0.50, 0.30];

fn table_name(d: Difficulty) -> &'static str {
    match d {
        Difficulty::Shitamachi => "shitamachi",
        Difficulty::Kabukicho => "kabukicho",
        Difficulty::Oyabun => "oyabun",
    }
}

/// The sirens' distance per table and crew: about two bad hands with the
/// whole crew In, a step closer at each harder table.
fn sirens_for(d: Difficulty, crew: usize) -> u32 {
    let base = 2 * crew as u32;
    match d {
        Difficulty::Shitamachi => base + 1,
        Difficulty::Kabukicho => base,
        Difficulty::Oyabun => base - 1,
    }
}

#[derive(Default, Clone, Copy)]
struct Stats {
    nights: u64,
    clean: u64,
    raid: u64,
    dawn: u64,
    hands: u64,
    decisions: u64,
    ins: u64,
    nods: u64,
    nod_chances: u64,
    crew_wins: u64,
    house_wins: u64,
    walked: u64,
    /// Hands where somebody's hand beat the House.
    winnable: u64,
    /// Winnable hands the crew won.
    converted: u64,
    /// Hands where the carrier had been nodded at.
    carried_nodded: u64,
    /// Nights won from the sirens' side of the track, or lost from the door's side.
    comebacks: u64,
}

impl Stats {
    fn add(&mut self, o: &Stats) {
        self.nights += o.nights;
        self.clean += o.clean;
        self.raid += o.raid;
        self.dawn += o.dawn;
        self.hands += o.hands;
        self.decisions += o.decisions;
        self.ins += o.ins;
        self.nods += o.nods;
        self.nod_chances += o.nod_chances;
        self.crew_wins += o.crew_wins;
        self.house_wins += o.house_wins;
        self.walked += o.walked;
        self.winnable += o.winnable;
        self.converted += o.converted;
        self.carried_nodded += o.carried_nodded;
        self.comebacks += o.comebacks;
    }
    fn pct(x: u64, of: u64) -> f64 {
        100.0 * x as f64 / of.max(1) as f64
    }
    fn clean_rate(&self) -> f64 {
        self.clean as f64 / self.nights.max(1) as f64
    }
}

fn play(
    d: Difficulty,
    crew: usize,
    seed: u64,
    samples: u32,
    knobs: &Knobs,
    (door, sirens): (u32, u32),
    policy: Policy,
) -> Stats {
    let mut st = Stats {
        nights: 1,
        ..Stats::default()
    };
    let mut g = Game::new("SIMUL", seed);
    let host = g.join("pid-simhost", "Host", "koi").expect("seat");
    for _ in 1..crew {
        g.add_bot(&host).expect("bot");
    }
    // The host plays as a regular too.
    g.seats[0].bot = true;
    g.set_config(&host, Some(d), Some(0)).expect("config");
    g.start(&host, 0).expect("start");
    g.door = door;
    g.sirens = sirens;
    let mut rng = Rng::seeded(seed.wrapping_mul(31) + 7);
    let mut now = 0;
    let (mut low, mut high) = (0i32, 0i32);
    while g.phase != Phase::Over {
        now += 1000;
        match g.phase {
            Phase::Nod | Phase::Call => {
                // Everyone decides from the same view, simultaneously.
                let views: Vec<_> = g
                    .bots_to_act()
                    .into_iter()
                    .map(|id| (id.clone(), view_for(&g, Some(&id), now)))
                    .collect();
                let mut out = Vec::new();
                for (id, view) in &views {
                    let pid = g.seat(id).map(|s| s.pid.clone()).unwrap_or_default();
                    let t = Temperament {
                        samples,
                        knobs: *knobs,
                        policy,
                        ..Temperament::for_seat(&pid)
                    };
                    out.push((id.clone(), decide(view, id, t, &mut rng)));
                }
                let calling = g.phase == Phase::Call;
                for (id, d) in out {
                    match d {
                        Some(Decision::Nod(at)) => {
                            st.nod_chances += 1;
                            st.nods += u64::from(at.is_some());
                            g.nod(&id, at.as_deref(), now).expect("legal nod");
                        }
                        Some(Decision::Call(s)) => {
                            st.decisions += 1;
                            st.ins += u64::from(s == Stance::In);
                            g.call(&id, s, now).expect("legal call");
                        }
                        None => {}
                    }
                }
                if calling && g.phase != Phase::Call {
                    let r = g.result.as_ref().expect("resolved");
                    st.hands += 1;
                    low = low.min(g.meter);
                    high = high.max(g.meter);
                    match r.outcome {
                        Outcome::Crew => st.crew_wins += 1,
                        Outcome::House => st.house_wins += 1,
                        Outcome::Walked => st.walked += 1,
                        Outcome::Tie => {}
                    }
                    if !r.could_have.is_empty() {
                        st.winnable += 1;
                        st.converted += u64::from(r.outcome == Outcome::Crew);
                    }
                    if r.outcome == Outcome::Crew
                        && r.crew_champions.iter().any(|c| g.nods_on(c) > 0)
                    {
                        st.carried_nodded += 1;
                    }
                }
            }
            Phase::Showdown => g.tick(now + 60_000),
            _ => unreachable!(),
        }
    }
    match g.verdict.expect("over") {
        Verdict::Clean => st.clean += 1,
        Verdict::Raid => st.raid += 1,
        Verdict::Dawn => st.dawn += 1,
    }
    // A comeback: the night ended at the end it had been heading away from.
    let comeback = match g.verdict {
        Some(Verdict::Clean) => low < 0,
        Some(Verdict::Raid) => high > 0,
        _ => false,
    };
    st.comebacks += u64::from(comeback);
    st
}

/// Run `f` for every index in `0..n` across threads, in order.
fn par_map<T: Send>(n: u64, f: impl Fn(u64) -> T + Sync) -> Vec<T> {
    let threads = std::env::var("THREADS")
        .ok()
        .and_then(|t| t.parse().ok())
        .unwrap_or_else(|| std::thread::available_parallelism().map_or(4, |p| p.get()))
        .clamp(1, 64) as u64;
    let next = AtomicU64::new(0);
    let mut out: Vec<(u64, T)> = std::thread::scope(|s| {
        let workers: Vec<_> = (0..threads.min(n.max(1)))
            .map(|_| {
                s.spawn(|| {
                    let mut mine = Vec::new();
                    loop {
                        let i = next.fetch_add(1, Ordering::Relaxed);
                        if i >= n {
                            break mine;
                        }
                        mine.push((i, f(i)));
                    }
                })
            })
            .collect();
        workers
            .into_iter()
            .flat_map(|w| w.join().expect("worker"))
            .collect()
    });
    out.sort_by_key(|x| x.0);
    out.into_iter().map(|x| x.1).collect()
}

#[allow(clippy::too_many_arguments)]
fn batch(
    d: Difficulty,
    crew: usize,
    nights: u64,
    seed0: u64,
    samples: u32,
    knobs: &Knobs,
    numbers: (u32, u32),
    policy: Policy,
) -> Stats {
    let runs = par_map(nights, |i| {
        play(d, crew, seed0 + i * 7919, samples, knobs, numbers, policy)
    });
    let mut st = Stats::default();
    for r in &runs {
        st.add(r);
    }
    st
}

fn knobs_from_env() -> Knobs {
    let mut k = KNOBS;
    if let Ok(spec) = std::env::var("KNOBS") {
        for kv in spec.split(',').filter(|s| !s.is_empty()) {
            let (key, val) = kv.split_once('=').expect("KNOBS entries look like key=value");
            let v: f64 = val.parse().expect("KNOBS values are numbers");
            match key {
                "nod_min" => k.nod_min = v,
                "nod_trust" => k.nod_trust = v,
                "nodded_in" => k.nodded_in = v,
                "visible_in" => k.visible_in = v,
                "caution" => k.caution = v,
                "urgency" => k.urgency = v,
                "in_margin" => k.in_margin = v,
                "jitter" => k.jitter = v,
                other => panic!("unknown knob {other}"),
            }
        }
    }
    k
}

fn arg(args: &[String], i: usize, default: u64) -> u64 {
    args.get(i).and_then(|a| a.parse().ok()).unwrap_or(default)
}

fn row(name: &str, crew: usize, numbers: (u32, u32), s: &Stats) {
    println!(
        "{name:<11} {crew:>3}  {:>4} {:>3} | {:>6.1}% {:>6.1}% {:>6.1}% | {:>5.2} | {:>5.1}% {:>5.1}% | {:>5.1}% {:>5.1}% {:>5.1}%",
        numbers.0,
        numbers.1,
        Stats::pct(s.clean, s.nights),
        Stats::pct(s.raid, s.nights),
        Stats::pct(s.dawn, s.nights),
        s.hands as f64 / s.nights.max(1) as f64,
        Stats::pct(s.ins, s.decisions),
        Stats::pct(s.nods, s.nod_chances),
        Stats::pct(s.converted, s.winnable),
        Stats::pct(s.carried_nodded, s.crew_wins),
        Stats::pct(s.comebacks, s.nights),
    );
}

fn header() {
    println!(
        "table      crew  door sir |  clean    raid    dawn | hands |   in%  nod%  | convert carried comeback"
    );
}

fn probe(nights: u64, samples: u32, knobs: &Knobs) {
    let policies = [
        ("regulars", Policy::Regular),
        ("random nod", Policy::RandomNods),
        ("no nods", Policy::NoNods),
        ("deaf", Policy::Deaf),
        ("always in", Policy::AlwaysIn),
    ];
    for (ti, d) in TABLES.iter().enumerate() {
        println!("\n== {} (goal {:.0}% clean)", table_name(*d), GOALS[ti] * 100.0);
        header();
        for crew in MIN_CREW..=MAX_CREW {
            let numbers = BALANCE[ti][crew - MIN_CREW];
            for (name, p) in policies {
                let s = batch(*d, crew, nights, 1, samples, knobs, numbers, p);
                row(name, crew, numbers, &s);
            }
            println!();
        }
    }
}

fn tune(nights: u64, samples: u32, knobs: &Knobs) {
    let mut table = [[(0u32, 0u32); 5]; 3];
    for (ti, d) in TABLES.iter().enumerate() {
        println!("\n== {} (goal {:.0}% clean)", table_name(*d), GOALS[ti] * 100.0);
        header();
        for crew in MIN_CREW..=MAX_CREW {
            let sirens = sirens_for(*d, crew);
            // Clean rate falls as the door moves away: bisect on the door. The
            // door is never so close that one lucky hand ends the night.
            let floor = crew as u32 + 1;
            let (mut lo, mut hi) = (floor, 5 * crew as u32);
            let mut best: Option<(u32, f64)> = None;
            while lo <= hi {
                let mid = (lo + hi) / 2;
                let s = batch(*d, crew, nights, 1, samples, knobs, (mid, sirens), Policy::Regular);
                let c = s.clean_rate();
                if best.is_none_or(|(_, b)| (c - GOALS[ti]).abs() < (b - GOALS[ti]).abs()) {
                    best = Some((mid, c));
                }
                if c > GOALS[ti] {
                    lo = mid + 1;
                } else {
                    hi = mid - 1;
                }
            }
            // One step either way on both ends, scored on the goal, on nights of
            // a sensible length, and on rarely running out the clock.
            let coarse = best.expect("searched").0;
            let score = |s: &Stats| {
                let hands = s.hands as f64 / s.nights.max(1) as f64;
                let dawn = s.dawn as f64 / s.nights.max(1) as f64;
                (s.clean_rate() - GOALS[ti]).abs()
                    + 0.05 * (5.0 - hands).max(0.0)
                    + 0.05 * (hands - 8.0).max(0.0)
                    + 0.5 * (dawn - 0.15).max(0.0)
            };
            let mut pick = (coarse, sirens, f64::MAX);
            for door in coarse.saturating_sub(1).max(floor)..=coarse + 1 {
                for sir in sirens.saturating_sub(1).max(crew as u32)..=sirens + 1 {
                    let s = batch(*d, crew, nights, 1, samples, knobs, (door, sir), Policy::Regular);
                    let v = score(&s);
                    if v < pick.2 {
                        pick = (door, sir, v);
                    }
                }
            }
            let (door, sirens) = (pick.0, pick.1);
            table[ti][crew - MIN_CREW] = (door, sirens);
            // Confirm on fresh deals.
            let s = batch(*d, crew, nights, 1_000_003, samples, knobs, (door, sirens), Policy::Regular);
            row("regulars", crew, (door, sirens), &s);
        }
    }
    println!("\npub const BALANCE: [[(u32, u32); 5]; 3] = [");
    for (ti, d) in TABLES.iter().enumerate() {
        let cells: Vec<String> = table[ti].iter().map(|(a, b)| format!("({a}, {b})")).collect();
        let name = table_name(*d);
        let title = name[..1].to_uppercase() + &name[1..];
        println!("    // {title}\n    [{}],", cells.join(", "));
    }
    println!("];");
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let knobs = knobs_from_env();
    if args.first().map(String::as_str) == Some("probe") {
        probe(arg(&args, 1, 300), arg(&args, 2, 200) as u32, &knobs);
    } else {
        tune(arg(&args, 0, 300), arg(&args, 1, 200) as u32, &knobs);
    }
}
