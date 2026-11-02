//! # hachi-engine
//!
//! The rules of 893 Hold'em, with no I/O. Everything the server and the browser
//! need to run a night at the table: cards and a seeded RNG, a 7-card hand
//! evaluator, Monte Carlo odds for the bots, the night state machine, and the
//! redaction that turns the full truth into what one seat is allowed to see.
//!
//! The crate compiles natively (tests, the balancing simulator) and to
//! `wasm32-unknown-unknown` (the rooms Worker and the browser).

pub mod card;
pub mod equity;
pub mod eval;
pub mod bot;
pub mod game;
pub mod rules;
pub mod view;
