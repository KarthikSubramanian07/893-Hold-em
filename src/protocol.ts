// Wire protocol between the browser and a room. JSON over one WebSocket.
// Client messages are validated on the server by `parseClientMessage`; anything
// malformed is dropped silently.

import type { Avatar, GameView, Stance, TableConfig } from './engine/types';

export type Reaction = 'clink' | 'smoke' | 'wink' | 'bow' | 'fire' | 'ghost';
export const REACTIONS: readonly Reaction[] = ['clink', 'smoke', 'wink', 'bow', 'fire', 'ghost'];

export const AVATARS: readonly Avatar[] = [
  'kitsune',
  'tanuki',
  'koi',
  'tsuru',
  'tora',
  'usagi',
  'karasu',
  'hebi',
];

export type ClientMessage =
  /** First message on every socket. `pid` is a stable per-browser id; `token` reclaims a seat. */
  | { t: 'hello'; pid: string; token?: string; name: string; avatar: Avatar }
  | { t: 'rename'; name: string; avatar: Avatar }
  | { t: 'config'; config: Partial<TableConfig> } // host only, lobby only
  | { t: 'bot'; op: 'add' | 'remove' } // host only, lobby only
  | { t: 'kick'; seat: string } // host only, lobby only
  | { t: 'start' } // host only
  /** During `nod`: nod at a teammate's seat id, or `null` to pass. */
  | { t: 'nod'; at: string | null }
  /** During `call`: In or Out. */
  | { t: 'call'; stance: Stance }
  | { t: 'next' } // ready for the next hand
  | { t: 'again' } // host: new night, same crew
  | { t: 'react'; reaction: Reaction }
  | { t: 'ping'; at: number };

export type ServerMessage =
  | { t: 'welcome'; seat: string | null; token: string }
  | { t: 'state'; view: GameView }
  | { t: 'react'; seat: string; reaction: Reaction }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'pong'; at: number; now: number };

export type ErrorCode = 'full' | 'not-host' | 'bad-phase' | 'bad-message' | 'rate';

export const NAME_MAX = 16;

export function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  // Strip control chars and collapse whitespace; keep unicode (kanji names are welcome).
  const cleaned = s
    // oxlint-disable-next-line no-control-regex -- stripping control chars is the point
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(cleaned).slice(0, NAME_MAX).join('') || 'Stranger';
}

const STANCES: readonly Stance[] = ['in', 'out'];

function isAvatar(x: unknown): x is Avatar {
  return typeof x === 'string' && (AVATARS as readonly string[]).includes(x);
}

/** Validate an untrusted message. Returns null for anything malformed. */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > 2048) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  switch (o.t) {
    case 'hello': {
      const pid = o.pid;
      if (typeof pid !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(pid)) return null;
      const token = typeof o.token === 'string' && /^[A-Za-z0-9]{1,64}$/.test(o.token) ? o.token : undefined;
      return { t: 'hello', pid, token, name: cleanName(o.name), avatar: isAvatar(o.avatar) ? o.avatar : 'kitsune' };
    }
    case 'rename':
      return { t: 'rename', name: cleanName(o.name), avatar: isAvatar(o.avatar) ? o.avatar : 'kitsune' };
    case 'config': {
      const c = (o.config ?? {}) as Record<string, unknown>;
      const config: Partial<TableConfig> = {};
      if (c.difficulty === 'shitamachi' || c.difficulty === 'kabukicho' || c.difficulty === 'oyabun') {
        config.difficulty = c.difficulty;
      }
      if (c.timer === 0 || c.timer === 15 || c.timer === 30 || c.timer === 60) config.timer = c.timer;
      return { t: 'config', config };
    }
    case 'bot':
      return o.op === 'add' || o.op === 'remove' ? { t: 'bot', op: o.op } : null;
    case 'kick':
      return typeof o.seat === 'string' && /^s[0-5]$/.test(o.seat) ? { t: 'kick', seat: o.seat } : null;
    case 'start':
      return { t: 'start' };
    case 'nod':
      if (o.at === null) return { t: 'nod', at: null };
      return typeof o.at === 'string' && /^s[0-5]$/.test(o.at) ? { t: 'nod', at: o.at } : null;
    case 'call':
      return STANCES.includes(o.stance as Stance) ? { t: 'call', stance: o.stance as Stance } : null;
    case 'next':
      return { t: 'next' };
    case 'again':
      return { t: 'again' };
    case 'react':
      return REACTIONS.includes(o.reaction as Reaction) ? { t: 'react', reaction: o.reaction as Reaction } : null;
    case 'ping':
      return typeof o.at === 'number' && Number.isFinite(o.at) ? { t: 'ping', at: o.at } : null;
    default:
      return null;
  }
}

/** Room codes: five unambiguous characters, easy to read aloud or off a screen. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;

export function makeRoomCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}
