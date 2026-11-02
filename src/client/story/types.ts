// The story's vocabulary. A Line is one subtitle: who says it, what they say,
// and how long it should stay on screen. Everything here is plain data so the
// narrator stays pure and every client at a table can compute the same lines.

import type { HandOutcome } from '../../engine/types';

/** The House's masks. See masks.ts for who wears them. */
export type MaskId = 'okame' | 'hyottoko' | 'ebisu' | 'kitsune' | 'tengu' | 'hannya' | 'okina' | 'oni';

/** The bot regulars, by the names the engine gives them. */
export type RegularName =
  | 'Tetsu'
  | 'Okami'
  | 'Hana'
  | 'Gin'
  | 'Kuro'
  | 'Sumi'
  | 'Rin'
  | 'Jun'
  | 'Mame'
  | 'Taka'
  | 'Nao'
  | 'Fuji';

/** `master` is the bartender. `house` is the House speaking as an institution. */
export type Speaker = 'master' | 'house' | MaskId | RegularName;

/** A hint for colour and pacing. The UI decides what it looks like. */
export type Mood = 'calm' | 'warm' | 'wry' | 'cold' | 'danger' | 'gold' | 'hush';

export interface Line {
  /** Stable for a given table, hand, and event, so clients can dedupe. */
  id: string;
  speaker: Speaker;
  text: string;
  /** An accent kanji for the moment (a rule, a table, 八九三), shown faintly behind the line. */
  kanji?: string;
  mood?: Mood;
  /** How long the line should stay up once it has typed on, in ms. */
  hold?: number;
}

/** Every kind of moment the narrator can speak to. Used as the selection key. */
export type StoryEvent =
  | 'welcome'
  | 'join'
  | 'night'
  | 'hand'
  | 'rule'
  | 'showdown'
  | 'take'
  | 'heat'
  | 'verdict'
  | 'idle'
  | 'egg';

/** Showdown flavours, most special first. */
export type ShowdownKind =
  | 'royal'
  | 'yakuza'
  | 'bad-beat'
  | 'serpent'
  | 'reversal'
  | 'quiet-champion'
  | 'trash-rider'
  | 'seen'
  | HandOutcome;

export type HeatMark = 'half' | 'three-quarters' | 'one-away';
