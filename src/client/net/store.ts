// The table connection, as a zustand store. Components read `view` and call
// `send`. One WebSocket per table to `/room/<code>` on our own origin (a Pages
// Function forwards it to the rooms Worker; in dev, Vite proxies it). The
// practice table (`PRACTICE_CODE`) gets a line to the engine in this tab
// instead; everything above the line is the same.
// With `?fixture=<name>` in the URL the store serves a static mock view
// instead, for UI work and screenshots.
import { create } from 'zustand';
import type { Avatar, GameView, Stance } from '../../engine/types';
import type { ClientMessage, ErrorCode, Reaction, ServerMessage } from '../../protocol';
import { FIXTURES } from '../dev/fixtures';
import { dialSocket, type Line, type LineHandlers } from './line';
import { dialPractice } from './local';
import { isPracticeCode } from './practice';

export type NetStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface Profile {
  name: string;
  avatar: Avatar;
}

export interface ReactionEvent {
  id: number;
  seat: string;
  reaction: Reaction;
  at: number;
}

export interface TableStore {
  status: NetStatus;
  code: string | null;
  view: GameView | null;
  /** Offset to add to Date.now() to get server time. */
  skew: number;
  error: { code: ErrorCode | 'net'; message: string } | null;
  reactions: ReactionEvent[];
  connect(code: string, profile: Profile): void;
  send(msg: ClientMessage): void;
  /** During `nod`: nod at a teammate, or pass with `null`. */
  nod(at: string | null): void;
  /** During `call`: In or Out. */
  call(stance: Stance): void;
  leave(): void;
}

export function fixtureName(): string | null {
  if (typeof location === 'undefined') return null;
  return new URLSearchParams(location.search).get('fixture');
}

/** A stable, secret-ish id for this browser. Reclaims your seat after a reload or a dropped connection. */
export function browserId(): string {
  const key = '893:pid';
  try {
    const existing = localStorage.getItem(key);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
    const id = crypto.randomUUID().replace(/-/g, '');
    localStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID().replace(/-/g, '');
  }
}

export function socketUrl(code: string, loc: Pick<Location, 'protocol' | 'host'> = location): string {
  const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${loc.host}/room/${code}`;
}

/** Backoff for reconnect attempt n (0-based): 0.4s, 0.8s, 1.6s … capped at 8s, with jitter. */
export function backoff(n: number, rand: () => number = Math.random): number {
  const base = Math.min(8000, 400 * 2 ** n);
  return Math.round(base * (0.75 + rand() * 0.5));
}

let socket: Line | null = null;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let errorTimer: ReturnType<typeof setTimeout> | null = null;
let reactionId = 0;
let current: { code: string; profile: Profile } | null = null;

function clearTimers() {
  if (retryTimer) clearTimeout(retryTimer);
  if (pingTimer) clearInterval(pingTimer);
  retryTimer = null;
  pingTimer = null;
}

export const useTable = create<TableStore>((set, get) => {
  const flashError = (code: ErrorCode | 'net', message: string) => {
    set({ error: { code, message } });
    if (errorTimer) clearTimeout(errorTimer);
    errorTimer = setTimeout(() => set({ error: null }), 4500);
  };

  const onMessage = (raw: string) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }
    switch (msg.t) {
      case 'welcome':
        retry = 0;
        break;
      case 'state':
        set({ view: msg.view, skew: msg.view.now - Date.now() });
        break;
      case 'react': {
        const now = Date.now();
        const fresh = get().reactions.filter((r) => now - r.at < 4000);
        set({ reactions: [...fresh, { id: ++reactionId, seat: msg.seat, reaction: msg.reaction, at: now }] });
        break;
      }
      case 'error':
        flashError(msg.code, msg.message);
        break;
      case 'pong': {
        // Midpoint estimate: the server stamped `now` about half a round trip ago.
        const rtt = Date.now() - msg.at;
        set({ skew: msg.now + rtt / 2 - Date.now() });
        break;
      }
    }
  };

  const open = () => {
    if (!current) return;
    const { code, profile } = current;
    const handlers: LineHandlers = {
      onOpen() {
        set({ status: 'open' });
        line.send(JSON.stringify({ t: 'hello', pid: browserId(), name: profile.name, avatar: profile.avatar } satisfies ClientMessage));
        line.send(JSON.stringify({ t: 'ping', at: Date.now() } satisfies ClientMessage));
        pingTimer = setInterval(() => {
          if (line.open) line.send(JSON.stringify({ t: 'ping', at: Date.now() } satisfies ClientMessage));
        }, 20_000);
      },
      onMessage,
      onClose() {
        if (socket !== line) return;
        clearTimers();
        socket = null;
        if (!current) {
          set({ status: 'closed' });
          return;
        }
        set({ status: 'reconnecting' });
        retryTimer = setTimeout(open, backoff(retry++));
      },
    };
    const line = isPracticeCode(code) ? dialPractice(handlers, { code }) : dialSocket(socketUrl(code), handlers);
    socket = line;
    set({ status: retry === 0 ? 'connecting' : 'reconnecting' });
  };

  // A tab coming back to the foreground should reconnect at once, not after the backoff.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && current && !socket) {
        clearTimers();
        retry = 0;
        open();
      }
    });
  }

  return {
    status: 'idle',
    code: null,
    view: null,
    skew: 0,
    error: null,
    reactions: [],
    connect(code, profile) {
      const f = fixtureName();
      const fixture = f ? FIXTURES[f] : undefined;
      if (fixture) {
        set({ status: 'open', code, view: { ...fixture, code, now: Date.now() } });
        return;
      }
      if (current?.code === code && socket) {
        // Same table: just update the name and seal.
        current.profile = profile;
        get().send({ t: 'rename', name: profile.name, avatar: profile.avatar });
        return;
      }
      get().leave();
      current = { code, profile };
      retry = 0;
      set({ code, view: null, error: null, reactions: [] });
      open();
    },
    send(msg) {
      if (fixtureName()) {
        console.info('[fixture] send', msg);
        return;
      }
      if (socket?.open) socket.send(JSON.stringify(msg));
      else flashError('net', 'Lost the line to the bar. Knocking again.');
    },
    nod(at) {
      get().send({ t: 'nod', at });
    },
    call(stance) {
      get().send({ t: 'call', stance });
    },
    leave() {
      current = null;
      clearTimers();
      const line = socket;
      socket = null;
      line?.close();
      set({ status: 'idle', code: null, view: null, error: null, reactions: [] });
    },
  };
});
