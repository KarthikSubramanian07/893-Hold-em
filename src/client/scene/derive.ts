// Everything the scene shows is derived from the GameView here, as plain data.
// Components only damp toward these targets each frame, so any jump between two
// views (a skipped street, a reconnect, a fixture swap) lands gracefully.

import { MAX_CREW } from '../../engine/rules';
import type { Avatar, Card, Difficulty, GameView, HandOutcome, SeatView, Slot, Stance } from '../../engine/types';
import { masksFor } from '../story/masks';
import type { MaskId } from '../story/types';

export type MaskMood = 'idle' | 'lean' | 'flare' | 'retreat';

export interface SeatTarget {
  /** Seat id, or `empty-<n>` for an open chair in the lobby. */
  key: string;
  empty: boolean;
  you: boolean;
  name: string;
  avatar: Avatar | null;
  connected: boolean;
  /** Decided in the current phase (nodded or passed; picked In or Out). */
  locked: boolean;
  cards: Slot[];
  /** Per hole card: part of the crew champion's best five at the showdown. */
  glow: boolean[];
  champion: boolean;
  /** In or Out, once it is on the table (your own as soon as you pick). */
  stance: Stance | null;
  /** Sat this hand out: at the showdown the cards go dark. */
  out: boolean;
  /** Nods this seat received, once the nods are turned over. */
  nods: number;
  /** Stable key that changes exactly when this seat's stance slip should drop. */
  slipKey: string;
}

export interface HouseTarget {
  /** Which mask the House wears at this table. */
  mask: MaskId;
  /** 3, 4 or 5 cards; the first face up from the deal. */
  cards: Slot[];
  glow: boolean[];
  mood: MaskMood;
  /** Who it watches: every seat, or at the showdown the one that beat it. */
  watches: string[];
  /** A seat it stares down at the showdown (the carrier it lost to, or the one who lost to it). */
  saw: string[];
}

export interface NodThread {
  from: string;
  to: string;
}

export interface BoardTarget {
  slot: Slot;
  crew: boolean;
  house: boolean;
}

export interface SceneTargets {
  phase: GameView['phase'];
  /** Room code, for the things that only happen on some nights (the cat). */
  code: string;
  table: Difficulty;
  hand: number;
  /** How close the marker is to the sirens, 0 (safe) .. 1 (one step away). */
  danger: number;
  outcome: HandOutcome | null;
  verdict: GameView['verdict'];
  seats: SeatTarget[];
  /** One House, or none in the lobby. */
  house: HouseTarget[];
  board: BoardTarget[];
  /** Who nodded at whom, once the nods are turned over. */
  nods: NodThread[];
  /** Your own hole cards (shown large near the camera, backs until the showdown), or empty for spectators. */
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

/**
 * How close the marker is to the sirens: 0 at the start or better, rising to 1
 * when one more lost step would bring the raid.
 */
export function dangerRatio(view: Pick<GameView, 'meter' | 'door' | 'sirens'>): number {
  if (view.sirens <= 0) return 0;
  const toSirens = view.sirens + Math.min(0, view.meter);
  if (view.meter >= 0) return 0;
  return Math.min(1, Math.max(0, 1 - (toSirens - 1) / Math.max(1, view.sirens - 1)));
}

/** The seats each seat's nod points at, once the nods are public. */
export function nodThreads(view: GameView): NodThread[] {
  if (view.phase !== 'call' && view.phase !== 'showdown') return [];
  const ids = new Set(view.seats.map((s) => s.id));
  return view.seats.filter((s) => s.nod && s.nod !== s.id && ids.has(s.nod)).map((s) => ({ from: s.id, to: s.nod! }));
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function seatTarget(seat: SeatView, view: GameView, crewBest: readonly Card[] | undefined): SeatTarget {
  const showdown = view.phase === 'showdown';
  const nodsPublic = view.phase === 'call' || showdown;
  const stance = view.phase === 'lobby' ? null : seat.stance;
  return {
    key: seat.id,
    empty: false,
    you: seat.id === view.you,
    name: seat.name,
    avatar: seat.avatar,
    connected: seat.connected,
    locked: (view.phase === 'nod' || view.phase === 'call') && seat.locked,
    cards: seat.cards,
    glow: seat.cards.map((c) => showdown && seat.champion && has(crewBest, c)),
    champion: showdown && seat.champion,
    stance,
    out: showdown && stance === 'out',
    nods: nodsPublic ? view.seats.filter((o) => o.nod === seat.id && o.id !== seat.id).length : 0,
    slipKey: stance && (showdown || seat.id === view.you) ? `${view.night}:${view.hand}:${stance}:${showdown ? 'open' : 'mine'}` : '',
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
    locked: false,
    cards: [],
    glow: [],
    champion: false,
    stance: null,
    out: false,
    nods: 0,
    slipKey: '',
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

export function maskMood(view: GameView): MaskMood {
  if (view.phase !== 'showdown' || !view.result) return 'idle';
  switch (view.result.outcome) {
    case 'crew':
      return 'retreat';
    case 'house':
      return 'flare';
    case 'tie':
      return 'lean';
    case 'walked':
      return 'idle';
  }
}

/** The mask the House wears at this table. */
export function houseMask(table: Difficulty): MaskId {
  return masksFor(table, 1)[0]!.id;
}

export function deriveTargets(view: GameView): SceneTargets {
  const showdown = view.phase === 'showdown';
  const result = showdown ? view.result : null;
  const crewBest = result?.crewBest?.best;
  const houseBest = result?.houseBest.best;
  const danger = view.phase === 'lobby' ? 0 : dangerRatio(view);
  const raid = view.verdict === 'raid';
  const outcome = result?.outcome ?? null;

  const seats = deriveSeats(view);
  const hero = seats.find((s) => s.you && !s.empty);
  const playing = view.phase === 'nod' || view.phase === 'call' || showdown;
  const everyone = seats.filter((s) => !s.empty).map((s) => s.key);
  const stare = result ? (result.outcome === 'house' ? result.ins.slice(0, 1) : result.crewChampions.slice(0, 1)) : [];

  return {
    phase: view.phase,
    code: view.code,
    table: view.config.difficulty,
    hand: view.hand,
    danger,
    outcome,
    verdict: view.verdict,
    seats,
    house:
      playing && view.house.cards.length
        ? [
            {
              mask: houseMask(view.config.difficulty),
              cards: view.house.cards,
              glow: view.house.cards.map((c) => showdown && has(houseBest, c)),
              mood: maskMood(view),
              watches: everyone,
              saw: stare,
            },
          ]
        : [],
    board: (playing ? view.board : [null, null, null, null, null]).map((slot) => ({
      slot,
      crew: has(crewBest, slot),
      house: has(houseBest, slot),
    })),
    nods: nodThreads(view),
    heroCards: playing && hero ? hero.cards : [],
    heroGlow: playing && hero ? hero.glow : [],
    lantern: outcome === 'walked' ? 0.35 : view.verdict === 'dawn' ? 0.6 : 1,
    police: raid ? 1 : smoothstep(0.45, 1, danger),
    neon: Math.min(1, 0.25 + danger * 0.75 + (outcome === 'house' ? 0.35 : 0) + (raid ? 0.3 : 0)),
    haze: outcome === 'house' ? 1 : raid ? 0.6 : 0,
  };
}
