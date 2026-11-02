import type { Difficulty, RuleId } from './types';

export interface RuleInfo {
  id: RuleId;
  kanji: string;
  /** Romanized name, e.g. "Kiri". */
  romaji: string;
  /** English name, e.g. "Fog". */
  name: string;
  /** One sentence, rules-precise. */
  text: string;
  /** A line of flavour in the House's voice. */
  flavor: string;
  /** Does this rule help the crew? Used for colour, never for logic. */
  kind: 'boon' | 'bane' | 'wild';
}

export const RULES: Record<RuleId, RuleInfo> = {
  kiri: {
    id: 'kiri',
    kanji: '霧',
    romaji: 'Kiri',
    name: 'Fog',
    text: 'The river is dealt face down and turns over at the showdown.',
    flavor: 'Some things are better seen late.',
    kind: 'bane',
  },
  kagami: {
    id: 'kagami',
    kanji: '鏡',
    romaji: 'Kagami',
    name: 'Mirror',
    text: 'Each mask shows one of its hole cards from the start.',
    flavor: 'The House has nothing to hide. Tonight.',
    kind: 'boon',
  },
  oni: {
    id: 'oni',
    kanji: '鬼',
    romaji: 'Oni',
    name: 'Oni',
    text: 'The House sits one extra hand.',
    flavor: 'A friend of the family pulls up a chair.',
    kind: 'bane',
  },
  shizuka: {
    id: 'shizuka',
    kanji: '静',
    romaji: 'Shizuka',
    name: 'Hush',
    text: 'Calls are hidden. You only see who is in and who is out until the showdown.',
    flavor: 'Keep your hands still.',
    kind: 'bane',
  },
  homura: {
    id: 'homura',
    kanji: '炎',
    romaji: 'Homura',
    name: 'Blaze',
    text: 'Take and heat are doubled this hand.',
    flavor: 'Bigger pot. Bigger fire.',
    kind: 'wild',
  },
  kizuna: {
    id: 'kizuna',
    kanji: '絆',
    romaji: 'Kizuna',
    name: 'Bond',
    text: 'Stakes are shared: every raise raises every active stake.',
    flavor: 'One crew. One neck.',
    kind: 'wild',
  },
  hebi: {
    id: 'hebi',
    kanji: '蛇',
    romaji: 'Hebi',
    name: 'Serpent',
    text: 'Ties go to the House.',
    flavor: 'The House always had a little extra.',
    kind: 'bane',
  },
  kitsune: {
    id: 'kitsune',
    kanji: '狐',
    romaji: 'Kitsune',
    name: 'Fox',
    text: "One crew member's hole cards are dealt face up for everyone to see.",
    flavor: 'Someone at this table has no secrets.',
    kind: 'boon',
  },
  gyaku: {
    id: 'gyaku',
    kanji: '逆',
    romaji: 'Gyaku',
    name: 'Reversal',
    text: "Lowball: the weaker hand wins. The crew's weakest active hand faces the House's weakest.",
    flavor: 'Upside down, the way the boss likes it.',
    kind: 'wild',
  },
};

export interface TableInfo {
  id: Difficulty;
  kanji: string;
  name: string;
  blurb: string;
  deck: RuleId[];
  /** First hand (1-based) that draws a House Rule. */
  ruleFrom: number;
  heatLimit: number;
  /** Take target per crew seat; the night's target is round(perSeat × crew). Tuned by scripts/simulate.ts. */
  perSeat: number;
}

export const TABLES: Record<Difficulty, TableInfo> = {
  shitamachi: {
    id: 'shitamachi',
    kanji: '下町',
    name: 'Shitamachi',
    blurb: 'The corner bar. Forgiving, mostly.',
    deck: ['kagami', 'kitsune', 'homura', 'kiri'],
    ruleFrom: 2,
    heatLimit: 9,
    perSeat: 4,
  },
  kabukicho: {
    id: 'kabukicho',
    kanji: '歌舞伎町',
    name: 'Kabukichō',
    blurb: 'Neon, noise, and a House that pays attention.',
    deck: ['kiri', 'kagami', 'oni', 'shizuka', 'homura', 'kizuna', 'hebi', 'kitsune'],
    ruleFrom: 2,
    heatLimit: 8,
    perSeat: 5,
  },
  oyabun: {
    id: 'oyabun',
    kanji: '親分',
    name: 'Oyabun',
    blurb: "The boss's room. Every hand has a catch.",
    deck: ['kiri', 'kagami', 'oni', 'shizuka', 'homura', 'kizuna', 'hebi', 'kitsune', 'gyaku'],
    ruleFrom: 1,
    heatLimit: 7,
    perSeat: 6,
  },
};

export const HANDS_PER_NIGHT = 6;
export const MAX_STAKE = 3;
export const MIN_CREW = 2;
export const MAX_CREW = 6;

export function houseHandCount(crew: number, rule: RuleId | null): number {
  return Math.ceil(crew / 2) + (rule === 'oni' ? 1 : 0);
}

export function targetFor(difficulty: Difficulty, crew: number): number {
  return Math.round(TABLES[difficulty].perSeat * crew);
}
