// The practice table: the same wasm engine the rooms Worker runs, hosted in
// this tab. It mirrors worker/index.ts one for one: the first message must be a
// hello, effects are carried out the same way, and `wake()` is driven from
// `nextWake()`, with setTimeout standing in for the Durable Object's alarm.
//
// Hidden information still holds: the only thing this line ever hands the page
// is `stateFor(yourSeat)`, the same redacted view a server would send.
import type { ClientMessage } from '../../protocol';
import type { Line, LineHandlers } from './line';
import { PRACTICE_DEFAULTS } from './practice';
import { loadEngine } from './wasm';

/** The slice of the wasm `Table` this host uses. */
export interface Engine {
  hello(raw: string, now: number): string | undefined;
  message(seat: string | null | undefined, raw: string, now: number): string;
  left(seat: string, now: number): string;
  wake(now: number): string;
  nextWake(): number | undefined;
  stateFor(seat: string | null | undefined, now: number): string;
  save(): string;
  phase(): string;
  free(): void;
}

export interface EngineModule {
  create(code: string, seed: number): Engine;
  load(saved: string): Engine;
}

type Effect = { do: 'broadcast' } | { do: 'reply'; json: string } | { do: 'shout'; json: string };

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface PracticeOptions {
  code: string;
  /** Where the engine comes from. Defaults to the lazily fetched wasm package. */
  load?: () => Promise<EngineModule>;
  /** Where to keep the game so a reload resumes it. Defaults to sessionStorage; null to keep nothing. */
  storage?: Store | null;
  /** Deck seed. Defaults to a CSPRNG, like the Worker. */
  seed?: number;
  now?: () => number;
}

export const SAVE_KEY = '893:practice';
/** Same floor as the Worker's alarm: never spin faster than this. */
const MIN_WAKE_MS = 50;

function sessionStore(): Store | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null; // Storage can throw outright in locked-down browsers.
  }
}

function randomSeed(): number {
  const s = crypto.getRandomValues(new Uint32Array(2));
  return s[0]! * 2 ** 21 + (s[1]! >>> 11);
}

/** Open a practice table in this tab and return a line to it. */
export function dialPractice(h: LineHandlers, opts: PracticeOptions): Line {
  const now = opts.now ?? Date.now;
  const store = opts.storage === undefined ? sessionStore() : opts.storage;
  let engine: Engine | null = null;
  let closed = false;
  let greeted = false;
  let seat: string | null = null;
  /** True for a brand-new table: the first hello also seats the regulars. */
  let fresh = true;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const persist = () => {
    if (!engine || !store) return;
    try {
      if (engine.phase() === 'over') store.removeItem(SAVE_KEY);
      else store.setItem(SAVE_KEY, engine.save());
    } catch {
      // Out of quota or blocked: the game goes on, it just won't survive a reload.
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const next = engine?.nextWake();
    if (next === undefined || closed) return;
    timer = setTimeout(
      () => {
        timer = null;
        if (engine && !closed) apply(JSON.parse(engine.wake(now())) as Effect[]);
      },
      Math.max(next - now(), MIN_WAKE_MS),
    );
  };

  /** Carry out the engine's effects. One socket, so reply and shout both land here. */
  const apply = (effects: Effect[]) => {
    if (!engine) return;
    let dirty = false;
    for (const fx of effects) {
      if (fx.do === 'broadcast') dirty = true;
      else h.onMessage(fx.json);
    }
    if (dirty) {
      if (greeted) h.onMessage(engine.stateFor(seat, now()));
      persist();
    }
    schedule();
  };

  const run = (msg: ClientMessage): Effect[] =>
    engine ? (JSON.parse(engine.message(seat, JSON.stringify(msg), now())) as Effect[]) : [];

  const hello = (raw: string) => {
    if (!engine) return;
    const out = engine.hello(raw, now());
    if (!out) return; // The first message must be a valid hello, same as the server.
    const welcome = JSON.parse(out) as { seat: string | null; effects: Effect[] };
    greeted = true;
    seat = welcome.seat;
    const effects = welcome.effects;
    if (fresh && seat) {
      // Set the table the way the bartender would for someone learning.
      effects.push(...run({ t: 'config', config: PRACTICE_DEFAULTS.config }));
      for (let i = 0; i < PRACTICE_DEFAULTS.regulars; i++) effects.push(...run({ t: 'bot', op: 'add' }));
    }
    fresh = false;
    apply(effects);
  };

  const line: Line = {
    get open() {
      return engine !== null && !closed;
    },
    send(raw) {
      if (!engine || closed || raw.length > 2048) return;
      if (!greeted) hello(raw);
      else apply(JSON.parse(engine.message(seat, raw, now())) as Effect[]);
    },
    close() {
      if (closed) return;
      closed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      if (engine) {
        if (seat) engine.left(seat, now());
        persist();
        engine.free();
        engine = null;
      }
    },
  };

  void (opts.load ?? loadEngine)()
    .then((mod) => {
      if (closed) return;
      const saved = store?.getItem(SAVE_KEY);
      if (saved) {
        try {
          engine = mod.load(saved);
          fresh = false;
        } catch {
          store?.removeItem(SAVE_KEY); // From an older engine; start clean.
        }
      }
      engine ??= mod.create(opts.code, opts.seed ?? randomSeed());
      h.onOpen();
      // A restored table may have bots or a deadline already due.
      schedule();
    })
    .catch(() => {
      if (!closed) h.onClose();
    });

  return line;
}
