// The only thing we remember about you: a name, a seal, and a random id so a
// dropped connection can reclaim its seat. No accounts.
import type { Avatar } from '../../engine/types';
import { AVATARS, NAME_MAX } from '../../protocol';
import type { Profile } from '../net/store';

export const PROFILE_KEY = '893.profile';
export const PID_KEY = '893.pid';
export const MUTE_KEY = '893.muted';

export type KV = Pick<Storage, 'getItem' | 'setItem'>;

/** localStorage when it works; private modes and sandboxed iframes can throw. */
export function storage(): KV | null {
  try {
    const s = globalThis.localStorage;
    const k = '893.probe';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

export function isAvatar(x: unknown): x is Avatar {
  return typeof x === 'string' && (AVATARS as readonly string[]).includes(x);
}

/** Trim, collapse whitespace, cap at NAME_MAX code points. Empty stays empty so the form can ask again. */
export function tidyName(raw: string): string {
  return Array.from(raw.replace(/\s+/g, ' ').trimStart()).slice(0, NAME_MAX).join('');
}

export function loadProfile(kv: KV | null = storage()): Profile | null {
  if (!kv) return null;
  try {
    const raw = kv.getItem(PROFILE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    const name = typeof o.name === 'string' ? tidyName(o.name).trim() : '';
    if (!name || !isAvatar(o.avatar)) return null;
    return { name, avatar: o.avatar };
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile, kv: KV | null = storage()): Profile {
  const clean: Profile = { name: tidyName(p.name).trim() || 'Stranger', avatar: isAvatar(p.avatar) ? p.avatar : 'kitsune' };
  try {
    kv?.setItem(PROFILE_KEY, JSON.stringify(clean));
  } catch {
    /* storage full or blocked: the profile still works for this visit */
  }
  return clean;
}

const PID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function makePid(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 21; i++) s += PID_ALPHABET[Math.floor(rand() * PID_ALPHABET.length)];
  return s;
}

/** A stable per-browser id. Created once, then reused. */
export function getPid(kv: KV | null = storage(), rand?: () => number): string {
  const existing = kv?.getItem(PID_KEY);
  if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
  const pid = makePid(rand);
  try {
    kv?.setItem(PID_KEY, pid);
  } catch {
    /* ignore */
  }
  return pid;
}

export function loadMuted(kv: KV | null = storage()): boolean {
  return kv?.getItem(MUTE_KEY) === '1';
}

export function saveMuted(muted: boolean, kv: KV | null = storage()): void {
  try {
    kv?.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* ignore */
  }
}
