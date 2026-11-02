// Who is watching whom. Each House mask watches two crew seats, in seat order:
// mask 0 watches the first two seats, mask 1 the next two, and so on. An Oni's
// extra mask watches nobody. At the showdown, anyone still in whose own hand
// lost to their watcher draws heat: they were seen.
//
// The server sends `SeatView.watcher`; these helpers only fall back to the
// seat-order rule when an older view leaves it out. All pure, all tested.

import type { Difficulty, GameView, RuleId, SeatView } from '../../engine/types';
import { masksFor } from '../story/masks';
import type { MaskId } from '../story/types';

/** What the showdown says about one seat's own hand against its watcher. */
export type Seen = 'seen' | 'clear' | null;

/**
 * The default rule, as the engine has it: the k-th seat (in the server's seat
 * order) is watched by mask ⌊k/2⌋, never past the last mask. With an Oni the
 * crew never reaches his extra mask, so he watches nobody.
 */
export function watcherBySeatOrder(order: number, houseCount: number): number | null {
  if (order < 0 || houseCount <= 0) return null;
  return Math.min(Math.floor(order / 2), houseCount - 1);
}

/**
 * The mask index watching each seat id, or null (the lobby, or no masks yet).
 * Uses the server's `watcher` when present and in range.
 */
export function watcherMap(seats: readonly SeatView[], houseCount: number, phase: GameView['phase']): Map<string, number | null> {
  const out = new Map<string, number | null>();
  seats.forEach((s, k) => {
    if (phase === 'lobby' || houseCount <= 0) {
      out.set(s.id, null);
      return;
    }
    const sent = (s as Partial<SeatView>).watcher;
    if (typeof sent === 'number' && sent >= 0 && sent < houseCount) out.set(s.id, sent);
    else if (sent === null) out.set(s.id, null);
    else out.set(s.id, watcherBySeatOrder(k, houseCount));
  });
  return out;
}

/** The seat ids each mask watches, in mask order. */
export function watchedBy(watchers: ReadonlyMap<string, number | null>, houseCount: number): string[][] {
  const out: string[][] = Array.from({ length: Math.max(0, houseCount) }, () => []);
  for (const [id, w] of watchers) if (w !== null && out[w]) out[w].push(id);
  return out;
}

/**
 * Seen or clear at the showdown. Burned seats were seen; anyone else still in
 * with a watcher got away with it. Folded seats, and every seat before the
 * showdown, are neither.
 */
export function seenState(seat: Pick<SeatView, 'id' | 'active'>, view: Pick<GameView, 'phase' | 'result'>, watcher: number | null): Seen {
  if (view.phase !== 'showdown' || !view.result || watcher === null) return null;
  const burned = (view.result as { burned?: readonly string[] }).burned ?? [];
  if (burned.includes(seat.id)) return 'seen';
  return seat.active ? 'clear' : null;
}

/** The mask identity for each House hand at this table, in hand order. */
export function maskIds(table: Difficulty, count: number, rule: RuleId | null): MaskId[] {
  return masksFor(table, count, rule).map((m) => m.id);
}

/** A small, distinct colour per mask, so a seat's tag says who is watching it. */
export const MASK_TAG: Record<MaskId, { color: string; ink: string; kanji: string }> = {
  okame: { color: '#f2a0b4', ink: '#3a1018', kanji: '亀' },
  hyottoko: { color: '#5b9bd5', ink: '#0d1a2a', kanji: '火' },
  ebisu: { color: '#e0b45a', ink: '#2a1d10', kanji: '恵' },
  kitsune: { color: '#f4efe4', ink: '#b8321f', kanji: '狐' },
  tengu: { color: '#e0412f', ink: '#fff2e0', kanji: '天' },
  hannya: { color: '#72c29a', ink: '#0d2418', kanji: '般' },
  okina: { color: '#d8b25c', ink: '#2a1d10', kanji: '翁' },
  oni: { color: '#a684e8', ink: '#160b26', kanji: '鬼' },
};

/** Which of a mask's seats it is looking at, `t` seconds in: it glances between them. */
export function gazeIndex(t: number, seats: number, phase: number): number {
  if (seats <= 1) return 0;
  // Dwell ~5.5 s on each seat, offset per mask so they never turn together.
  return Math.floor((t + phase) / 5.5) % seats;
}
