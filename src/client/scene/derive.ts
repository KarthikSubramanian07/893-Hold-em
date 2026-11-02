// Everything the scene shows is derived from the GameView here, as plain data.
// Components only damp toward these targets each frame, so any jump between two
// views (a skipped street, a reconnect, a fixture swap) lands gracefully.

import { MAX_CREW } from '../../engine/rules';
import type { Avatar, Card, GameView, HandOutcome, RuleId, SeatView, Slot, Stance, Street } from '../../engine/types';

export type MaskMood = 'idle' | 'lean' | 'flare' | 'retreat';

export interface CallMark {
  street: Street;
  stance: Stance | 'hidden';
  /** Stable key: changes exactly when a new call is revealed for this seat. */
  key: string;
}

export interface SeatTarget {
  /** Seat id, or `empty-<n>` for an open chair in the lobby. */
  key: string;
  empty: boolean;
  you: boolean;
  name: string;
  avatar: Avatar | null;
  connected: boolean;
  active: boolean;
  /** null = hidden under Hush. */
  stake: number | null;
  locked: boolean;
  cards: Slot[];
  /** Per hole card: part of the crew champion's best five at the showdown. */
  glow: boolean[];
  champion: boolean;
  lastCall: CallMark | null;
}

export interface HouseTarget {
  cards: Slot[];
  glow: boolean[];
  champion: boolean;
  mood: MaskMood;
}

export interface BoardTarget {
  slot: Slot;
  crew: boolean;
  house: boolean;
}

export interface SceneTargets {
  phase: GameView['phase'];
  hand: number;
  street: Street;
  /** Heat as a fraction of the limit, 0..1. */
  heat: number;
  outcome: HandOutcome | null;
  verdict: GameView['verdict'];
  rule: RuleId | null;
  seats: SeatTarget[];
  house: HouseTarget[];
  board: BoardTarget[];
  /** Your own hole cards (shown large near the camera), or empty for spectators. */
  heroCards: Slot[];
  heroGlow: boolean[];
  /** How bright the lantern burns, 1 = normal. */
  lantern: number;
  /** 0..1, police lights strobing through the window. */
  police: number;
  /** 0..1, how hard the neon burns. */
  neon: number;
  /** 0..1, heat haze over the House after it wins. */
  haze: number;
}

const has = (best: readonly Card[] | undefined, slot: Slot): boolean =>
  !!best && slot !== null && slot !== 'back' && best.includes(slot);

export function seatIndex(id: string): number {
  const n = Number.parseInt(id.replace(/^\D+/, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Rotate seats so the viewer comes first; spectators keep server order. */
export function orderSeats(seats: readonly SeatView[], you: string | null): SeatView[] {
  const sorted = [...seats].sort((a, b) => seatIndex(a.id) - seatIndex(b.id));
  const at = sorted.findIndex((s) => s.id === you);
  if (at <= 0) return sorted;
  return [...sorted.slice(at), ...sorted.slice(0, at)];
}

export function lastCall(seat: SeatView, hand: number): CallMark | null {
  for (let i = seat.calls.length - 1; i >= 0; i--) {
    const stance = seat.calls[i];
    if (stance) return { street: i as Street, stance, key: `${hand}:${i}:${stance}` };
  }
  return null;
}

export function heatRatio(view: Pick<GameView, 'heat' | 'heatLimit'>): number {
  if (view.heatLimit <= 0) return 0;
  return Math.min(1, Math.max(0, view.heat / view.heatLimit));
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function seatTarget(seat: SeatView, view: GameView, crewBest: readonly Card[] | undefined): SeatTarget {
  const showdown = view.phase === 'showdown';
  return {
    key: seat.id,
    empty: false,
    you: seat.id === view.you,
    name: seat.name,
    avatar: seat.avatar,
    connected: seat.connected,
    active: seat.active,
    stake: seat.stake,
    locked: view.phase === 'call' && seat.locked,
    cards: seat.cards,
    glow: seat.cards.map((c) => showdown && seat.champion && has(crewBest, c)),
    champion: showdown && seat.champion,
    lastCall: view.phase === 'lobby' ? null : lastCall(seat, view.hand),
  };
}

function emptySeat(n: number): SeatTarget {
  return {
    key: `empty-${n}`,
    empty: true,
    you: false,
    name: '',
    avatar: null,
    connected: false,
    active: false,
    stake: null,
    locked: false,
    cards: [],
    glow: [],
    champion: false,
    lastCall: null,
  };
}

/**
 * Seats in layout order (index 0 = the viewer). In the lobby every one of the
 * six chairs is shown at its fixed place so you can watch the room fill up.
 */
export function deriveSeats(view: GameView): SeatTarget[] {
  const crewBest = view.result?.crewBest?.best;
  if (view.phase !== 'lobby') {
    return orderSeats(view.seats, view.you).map((s) => seatTarget(s, view, crewBest));
  }
  const byIndex = new Map(view.seats.map((s) => [seatIndex(s.id), s]));
  const youIdx = view.you ? seatIndex(view.you) : 0;
  const out: SeatTarget[] = [];
  for (let k = 0; k < MAX_CREW; k++) {
    const idx = (youIdx + k) % MAX_CREW;
    const s = byIndex.get(idx);
    out.push(s ? seatTarget(s, view, crewBest) : emptySeat(idx));
  }
  return out;
}

export function maskMood(champion: boolean, view: GameView): MaskMood {
  if (view.phase !== 'showdown' || !view.result) return 'idle';
  switch (view.result.outcome) {
    case 'crew':
      return 'retreat';
    case 'house':
      return champion ? 'flare' : 'lean';
    case 'tie':
    case 'walked':
      return champion ? 'lean' : 'idle';
  }
}

export function deriveTargets(view: GameView): SceneTargets {
  const showdown = view.phase === 'showdown';
  const result = showdown ? view.result : null;
  const crewBest = result?.crewBest?.best;
  const houseBest = result?.houseBest.best;
  const heat = heatRatio(view);
  const raid = view.verdict === 'raid';
  const outcome = result?.outcome ?? null;

  const seats = deriveSeats(view);
  const hero = seats.find((s) => s.you && !s.empty);
  const playing = view.phase === 'call' || showdown;

  return {
    phase: view.phase,
    hand: view.hand,
    street: view.street,
    heat,
    outcome,
    verdict: view.verdict,
    rule: playing ? view.rule : null,
    seats,
    house: playing
      ? view.house.map((h) => ({
          cards: h.cards,
          champion: showdown && h.champion,
          glow: h.cards.map((c) => showdown && h.champion && has(houseBest, c)),
          mood: maskMood(h.champion, view),
        }))
      : [],
    board: (playing ? view.board : [null, null, null, null, null]).map((slot) => ({
      slot,
      crew: has(crewBest, slot),
      house: has(houseBest, slot),
    })),
    heroCards: playing && hero ? hero.cards : [],
    heroGlow: playing && hero ? hero.glow : [],
    lantern: outcome === 'walked' ? 0.35 : view.verdict === 'short' ? 0.6 : 1,
    police: raid ? 1 : smoothstep(0.5, 1, heat),
    neon: Math.min(1, 0.25 + heat * 0.75 + (outcome === 'house' ? 0.35 : 0) + (raid ? 0.3 : 0)),
    haze: outcome === 'house' ? 1 : raid ? 0.6 : 0,
  };
}
