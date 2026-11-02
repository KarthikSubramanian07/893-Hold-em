// The table connection, as a zustand store. Components read `view` and call
// `send`. The real WebSocket transport is wired in here; with `?fixture=<name>`
// in the URL the store serves a static mock view instead, for UI work.
import { create } from 'zustand';
import type { Avatar, GameView } from '../../engine/types';
import type { ClientMessage, ErrorCode, Reaction } from '../../protocol';
import { FIXTURES } from '../dev/fixtures';

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
  leave(): void;
}

export function fixtureName(): string | null {
  if (typeof location === 'undefined') return null;
  return new URLSearchParams(location.search).get('fixture');
}

export const useTable = create<TableStore>((set) => ({
  status: 'idle',
  code: null,
  view: null,
  skew: 0,
  error: null,
  reactions: [],
  connect(code) {
    const f = fixtureName();
    const view = f ? FIXTURES[f] : undefined;
    if (view) {
      set({ status: 'open', code, view: { ...view, code, now: Date.now() } });
      return;
    }
    // Real transport lands with the rooms server.
    set({ status: 'connecting', code });
  },
  send(msg) {
    if (fixtureName()) console.info('[fixture] send', msg);
  },
  leave() {
    set({ status: 'idle', code: null, view: null, error: null, reactions: [] });
  },
}));
