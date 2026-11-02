//! WebAssembly bindings: one `Table` per room, JSON strings in and out.
//!
//! The rooms Worker (a TypeScript Durable Object) owns sockets, storage, and
//! alarms; this owns the rules. The browser's practice mode loads the same
//! package and runs a table locally against regulars.

use hachi_engine::room::{ClientMessage, Effect, Room, parse};
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Table {
    room: Room,
}

#[derive(Serialize)]
struct Hello {
    seat: Option<String>,
    effects: Vec<Effect>,
}

fn json<T: Serialize>(v: &T) -> String {
    serde_json::to_string(v).expect("engine output always serializes")
}

fn ms(now: f64) -> u64 {
    if now.is_finite() && now > 0.0 {
        now as u64
    } else {
        0
    }
}

#[wasm_bindgen]
impl Table {
    /// A fresh table. `seed` should come from a CSPRNG; only its integer bits are used.
    #[wasm_bindgen(constructor)]
    pub fn new(code: &str, seed: f64) -> Table {
        Table {
            room: Room::new(code, seed.abs() as u64),
        }
    }

    /// Restore a table saved with `save`.
    pub fn load(saved: &str) -> Result<Table, JsError> {
        let room: Room =
            serde_json::from_str(saved).map_err(|e| JsError::new(&format!("bad save: {e}")))?;
        Ok(Table { room })
    }

    pub fn save(&self) -> String {
        json(&self.room)
    }

    /// Handle a socket's first message. Returns `{ seat, effects }` JSON, or
    /// `null` if the message is not a valid hello.
    pub fn hello(&mut self, raw: &str, now: f64) -> Option<String> {
        let Some(ClientMessage::Hello { pid, name, avatar }) = parse(raw) else {
            return None;
        };
        let w = self.room.hello(&pid, &name, &avatar, ms(now));
        Some(json(&Hello {
            seat: w.seat,
            effects: w.effects,
        }))
    }

    /// Handle any later message from a socket holding `seat` (none = spectator).
    /// Returns a JSON array of effects; malformed messages produce none.
    pub fn message(&mut self, seat: Option<String>, raw: &str, now: f64) -> String {
        match parse(raw) {
            Some(ClientMessage::Hello { .. }) | None => "[]".to_string(),
            Some(msg) => json(&self.room.handle(seat.as_deref(), msg, ms(now))),
        }
    }

    /// The last socket holding `seat` closed.
    pub fn left(&mut self, seat: &str, now: f64) -> String {
        json(&self.room.left(seat, ms(now)))
    }

    /// Timer wake-up. Returns a JSON array of effects.
    pub fn wake(&mut self, now: f64) -> String {
        json(&self.room.wake(ms(now)))
    }

    /// When to call `wake` next (epoch ms), if ever.
    #[wasm_bindgen(js_name = nextWake)]
    pub fn next_wake(&self) -> Option<f64> {
        self.room.next_wake().map(|t| t as f64)
    }

    /// The `state` message for a socket holding `seat` (none = spectator).
    #[wasm_bindgen(js_name = stateFor)]
    pub fn state_for(&self, seat: Option<String>, now: f64) -> String {
        self.room.state_json(seat.as_deref(), ms(now))
    }

    /// No connected humans at the table.
    #[wasm_bindgen(js_name = isEmpty)]
    pub fn is_empty(&self) -> bool {
        self.room.is_empty()
    }

    /// Bumps on every change.
    pub fn version(&self) -> f64 {
        self.room.game.version as f64
    }

    pub fn phase(&self) -> String {
        json(&self.room.game.phase).trim_matches('"').to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_table_round_trips_and_speaks_json() {
        let mut t = Table::new("K7QX2", 42.0);
        let h = t
            .hello(
                r#"{"t":"hello","pid":"pid-aaaaaaaa","name":"Mio","avatar":"koi"}"#,
                1000.0,
            )
            .unwrap();
        assert!(h.contains(r#""seat":"s0""#), "{h}");
        assert!(h.contains(r#""do":"broadcast""#), "{h}");
        assert_eq!(t.message(Some("s0".into()), "not json", 1.0), "[]");
        let fx = t.message(Some("s0".into()), r#"{"t":"bot","op":"add"}"#, 1100.0);
        assert!(fx.contains("broadcast"), "{fx}");
        let saved = t.save();
        let back = Table::load(&saved).unwrap();
        assert_eq!(back.save(), saved);
        assert!(
            t.state_for(Some("s0".into()), 1200.0)
                .contains(r#""you":"s0""#)
        );
        assert_eq!(t.phase(), "lobby");
    }

    #[test]
    fn hello_rejects_anything_else() {
        let mut t = Table::new("K7QX2", 1.0);
        assert!(t.hello(r#"{"t":"start"}"#, 0.0).is_none());
    }
}
