// The rooms Worker: one Durable Object per table.
//
// This file is a thin shell. The rules, the bots, validation, and redaction all
// live in the Rust engine (crates/engine), compiled to WebAssembly
// (crates/wasm). This shell owns what only a Durable Object can: sockets that
// survive hibernation, storage, and alarms.

import { DurableObject } from 'cloudflare:workers';
import wasmModule from '../crates/wasm/pkg/hachi_wasm_bg.wasm';
import { initSync, Table as Engine } from '../crates/wasm/pkg/hachi_wasm.js';

initSync({ module: wasmModule });

export interface Env {
  TABLE: DurableObjectNamespace<Table>;
}

const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;
/** An empty table is forgotten after this long. */
const FORGET_AFTER_MS = 6 * 60 * 60 * 1000;
const MAX_SOCKETS = 24;
/** Per-socket flood limit: a burst of this many messages, refilled at this rate per second. */
const MSG_BURST = 30;
const MSG_PER_SECOND = 10;

type Effect = { do: 'broadcast' } | { do: 'reply'; json: string } | { do: 'shout'; json: string };

interface Attachment {
  /** Set after a valid hello. */
  hello: boolean;
  seat: string | null;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9]{5})$/);
    const code = m?.[1]?.toUpperCase();
    if (!code || !CODE_RE.test(code)) {
      return new Response('Bar 893. Knock on /room/<code>.', { status: 404 });
    }
    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('This door only opens for a websocket.', { status: 426 });
    }
    const stub = env.TABLE.get(env.TABLE.idFromName(code));
    return stub.fetch(new Request(`https://table/${code}`, req));
  },
} satisfies ExportedHandler<Env>;

export class Table extends DurableObject<Env> {
  private engine: Engine | null = null;
  /** Token buckets per socket. In memory only: hibernation resets them, which is fine. */
  private buckets = new WeakMap<WebSocket, { tokens: number; at: number }>();

  /** False when this socket has sent too much too fast; its message is dropped. */
  private allow(ws: WebSocket, now: number): boolean {
    const b = this.buckets.get(ws) ?? { tokens: MSG_BURST, at: now };
    b.tokens = Math.min(MSG_BURST, b.tokens + ((now - b.at) / 1000) * MSG_PER_SECOND);
    b.at = now;
    this.buckets.set(ws, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  /** Load the table from storage, or open a fresh one. */
  private async table(code?: string): Promise<Engine> {
    if (this.engine) return this.engine;
    const saved = await this.ctx.storage.get<string>('room');
    if (saved) {
      try {
        this.engine = Engine.load(saved);
        return this.engine;
      } catch {
        // Saved by an older version of the rules: start this table over.
        await this.ctx.storage.delete('room');
      }
    }
    const c = code ?? (await this.ctx.storage.get<string>('code')) ?? 'XXXXX';
    const seed = crypto.getRandomValues(new Uint32Array(2));
    this.engine = new Engine(c, seed[0]! * 2 ** 21 + (seed[1]! >>> 11));
    return this.engine;
  }

  override async fetch(req: Request): Promise<Response> {
    const code = new URL(req.url).pathname.slice(1);
    if (code && !(await this.ctx.storage.get('code'))) await this.ctx.storage.put('code', code);
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
      return new Response('The bar is packed. Try again in a minute.', { status: 503 });
    }
    await this.table(code);
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    // Hibernation-aware: the object can sleep between calls and wake on the
    // next message without dropping anyone, which keeps a quiet table free.
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ hello: false, seat: null } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    if (text.length > 2048) return;
    const now = Date.now();
    // Every accepted message can broadcast and write storage; a flooding client
    // must not be able to run the table's bill up or starve the others.
    if (!this.allow(ws, now)) return;
    const engine = await this.table();
    const att = (ws.deserializeAttachment() as Attachment | null) ?? { hello: false, seat: null };

    if (!att.hello) {
      const out = engine.hello(text, now);
      if (!out) return; // The first message must be a valid hello; ignore anything else.
      const { seat, effects } = JSON.parse(out) as { seat: string | null; effects: Effect[] };
      ws.serializeAttachment({ hello: true, seat } satisfies Attachment);
      await this.apply(engine, ws, effects, now);
      return;
    }
    const effects = JSON.parse(engine.message(att.seat, text, now)) as Effect[];
    await this.apply(engine, ws, effects, now);
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {
      // already closing
    }
    await this.departed(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.departed(ws);
  }

  private async departed(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att?.seat) return;
    // The same seat may be open in another tab; only leave when the last one closes.
    const stillHere = this.ctx
      .getWebSockets()
      .some((s) => s !== ws && (s.deserializeAttachment() as Attachment | null)?.seat === att.seat);
    if (stillHere) return;
    const engine = await this.table();
    const now = Date.now();
    await this.apply(engine, null, JSON.parse(engine.left(att.seat, now)) as Effect[], now);
  }

  override async alarm(): Promise<void> {
    const engine = await this.table();
    const now = Date.now();
    if (this.ctx.getWebSockets().length === 0 && engine.isEmpty()) {
      // Nobody has been here for a while: forget the table entirely.
      const last = (await this.ctx.storage.get<number>('touched')) ?? 0;
      if (now - last >= FORGET_AFTER_MS) {
        this.engine = null;
        await this.ctx.storage.deleteAll();
        return;
      }
    }
    await this.apply(engine, null, JSON.parse(engine.wake(now)) as Effect[], now);
  }

  /** Carry out the engine's effects, persist, and set the next alarm. */
  private async apply(engine: Engine, from: WebSocket | null, effects: Effect[], now: number): Promise<void> {
    const sockets = this.ctx.getWebSockets();
    for (const fx of effects) {
      if (fx.do === 'reply') {
        safeSend(from, fx.json);
      } else if (fx.do === 'shout') {
        for (const s of sockets) safeSend(s, fx.json);
      } else {
        for (const s of sockets) {
          const att = s.deserializeAttachment() as Attachment | null;
          if (att?.hello) safeSend(s, engine.stateFor(att.seat, now));
        }
      }
    }
    if (effects.some((fx) => fx.do === 'broadcast')) {
      await this.ctx.storage.put({ room: engine.save(), touched: now });
    }
    const next = engine.nextWake();
    if (next !== undefined) {
      await this.ctx.storage.setAlarm(Math.max(next, now + 50));
    } else {
      await this.ctx.storage.setAlarm(now + FORGET_AFTER_MS);
    }
  }
}

function safeSend(ws: WebSocket | null, data: string): void {
  if (!ws) return;
  try {
    ws.send(data);
  } catch {
    // The socket closed between the message and the reply.
  }
}
