// Everything the bar says, in banks keyed by moment. The narrator picks one
// variant per moment with `pick(bank, code, hand, event)`, so every client at a
// table reads the same line at the same time.
//
// Voice rules (tested): no exclamation points, no emoji, short sentences.
// Templates use {name}, {names}, {need}, {mask}, {table}, {left}.

import type { Difficulty, RuleId, Verdict } from '../../engine/types';
import { MASKS } from './masks';
import { REGULARS, isRegular } from './regulars';
import type { HeatMark, MaskId, RegularName, ShowdownKind, Speaker } from './types';

export type Bank = readonly string[];

// ---------------------------------------------------------------------------
// The Master
// ---------------------------------------------------------------------------

export const MASTER = {
  name: 'The Master',
  kanji: '主',
  /** On the liquor licence, which nobody reads. 八 eight, 九 nine (ku), 三 three (sabu). */
  realName: 'Hachikubo Saburō',
  realKanji: '八久保 三郎',
  story:
    'Dealt oicho-kabu for the family for twenty years, then took the bar instead of a pension. Pours for both sides. Has never been seen sitting down.',
} as const;

/** The bar cat. She is the nine. */
export const CAT = { name: 'Kyū', kanji: '九', story: 'A black cat with one white sock. Sleeps on the ledger. Has used at least four of her lives.' } as const;

// ---------------------------------------------------------------------------
// Arriving
// ---------------------------------------------------------------------------

export const WELCOME = {
  first: [
    'Sit anywhere. Send the link to fill the stools, or add bots. The bots don’t tip.',
    'Six stools, one table, one cat. The House sits across. The cat sits wherever she likes.',
    'Send the link to bring your crew. Strangers welcome. Everyone here was a stranger once, and owed money twice.',
  ],
  returning: ['Back again. Same stool. I didn’t dust it.', 'Welcome back. Your tab is still zero. Let’s keep it that way.'],
  rejoin: ['Your seat held. You were dealt in while you were gone.'],
  spectator: ['The table is full tonight. You can watch.'],
  code893: ['Table eight-nine-three. Somebody upstairs is laughing.'],
  oyabun: ['You wrote “Oyabun” on the board. He’s going to see that.'],
  master: ['There’s only one Master in here. Pick another name. Or don’t, and confuse everyone.'],
  cat: ['That’s the cat’s name. She’ll allow it, this once.'],
  threeAm: ['It really is three in the morning. Good hour for it.'],
} as const;

export const JOIN_OYABUN: Bank = ['{name}. Bold name. He’s going to see that.', 'Somebody calling themselves {name}. He’ll enjoy that. Briefly.'];

export const JOIN: Bank = ['{name} sat down.', '{name} made it up the stairs. Most do.', '{name} joined. Mind the cat.', '{name} is here. Somebody pour.'];

// ---------------------------------------------------------------------------
// Chapters: the three tables, and how each night can end
// ---------------------------------------------------------------------------

export interface Chapter {
  id: Difficulty;
  number: string;
  kanji: string;
  name: string;
  title: string;
  /** For the matchbook and the docs. */
  synopsis: string;
  intro: Bank;
  /** Each variant is a short run of lines, said in order. */
  epilogue: Record<Verdict, readonly (readonly string[])[]>;
}

export const CHAPTERS: Record<Difficulty, Chapter> = {
  shitamachi: {
    id: 'shitamachi',
    number: '一',
    kanji: '下町',
    name: 'Shitamachi',
    title: 'Small Debts',
    synopsis:
      'The corner table, the low end of the debt. The family sends its collectors: Okame who smiles, Hyottoko who sweats, and Ebisu who writes it all down.',
    intro: [
      'Shitamachi, the forgiving table. House Rules start on hand two. The masks here are mostly bark.',
      'The corner table. Small debts, House Rules from hand two. Okame smiles at everyone. Don’t take it personally.',
    ],
    epilogue: {
      clean: [['Clean getaway. The corner debt is paid. Okame is still smiling, which is either good or terrible.']],
      raid: [['Raided. Out the back, past the bins. Fold the weak hands sooner next time.']],
      short: [['Came up short. Close isn’t money. Raise the strong hands sooner.']],
    },
  },
  kabukicho: {
    id: 'kabukicho',
    number: '二',
    kanji: '歌舞伎町',
    name: 'Kabukichō',
    title: 'Every Sign Is Lying',
    synopsis:
      'The lieutenants come down from the fourth floor: Kitsune the dealer, Tengu the purist, and Hannya, who only comes when something needs breaking.',
    intro: [
      'Kabukichō. Eight House Rules in the deck, from hand two. Every sign outside is lying. So is the fox.',
      'The lieutenants came down for this. Eight House Rules, from hand two. They took the stairs. That’s serious.',
    ],
    epilogue: {
      clean: [['Clean getaway from Kabukichō. Few crews manage it. The boss has heard your names. Congratulations, I think.']],
      raid: [['Raided. The Tengu was out the window before the first knock. Fold the weak hands sooner next time.']],
      short: [['Came up short. The fox counted twice and smiled once. Raise the strong hands sooner.']],
    },
  },
  oyabun: {
    id: 'oyabun',
    number: '三',
    kanji: '親分',
    name: 'Oyabun',
    title: 'The Old Man Upstairs',
    synopsis:
      'The room at the top of the stairs, with tatami and the one good chair. The Oyabun sits behind the Okina mask and plays the first hand himself.',
    intro: [
      'The boss’s table. A House Rule every hand, starting now. Shoes off. He notices.',
      'Top of the stairs. House Rules from the first hand. He drinks only water, which is somehow more frightening.',
    ],
    epilogue: {
      clean: [['Clean getaway from the boss’s table. He bowed. I’ve poured for him thirty years. He has never bowed.']],
      raid: [['Raided, even up here. He finished his tea first. Fold the weak hands sooner next time.']],
      short: [['Came up short. He poured you a drink himself. That’s worse than shouting.']],
    },
  },
};

/** Said once at the end of any clean night when heat was one from the limit. */
export const CLOSE_CALL: Bank = ['One heat from a raid, and still clean. I’m going to need a minute.'];

/** Said once at the end of a night where the crew took all six. */
export const CLEAN_SWEEP: Bank = ['Six hands, six wins. I’m checking the deck.'];

// ---------------------------------------------------------------------------
// Hands and rules
// ---------------------------------------------------------------------------

export const LAST_HAND = {
  short: ['Last hand. You need {need} more take. No pressure. Some pressure.'],
  made: ['Last hand. Target met. Only a raid can ruin this now, so fold anything ugly.'],
  hot: ['Last hand, one heat from a raid. If your cards look like a bus timetable, fold.'],
} as const;

/** The Fox, when the narrator can't tell whose cards are up. */
export const KITSUNE_ANON: Bank = ['Fox: one crew member’s cards are face up this hand. Somebody wave.'];

export const RULE_LINES: Record<RuleId, Bank> = {
  kiri: ['Fog: the river is dealt face down until the showdown. Bet on vibes.', 'Fog: you won’t see the river until the showdown. Neither will they, allegedly.'],
  kagami: ['Mirror: each mask shows one of its two cards. The House calls this transparency.', 'Mirror: one card per mask, face up. Look closely. They want you to.'],
  oni: ['Oni: the House plays an extra hand this time. He didn’t knock. He never knocks.', 'Oni: one more mask across, so the House’s best gets stronger. Make room.'],
  shizuka: ['Hush: you’ll see who folds, but not who stays or raises. Poker faces, everyone.', 'Hush: calls stay hidden until the showdown, except folds. Eyebrows are now a strategy.'],
  homura: ['Blaze: take and heat both count double. Big swing. Keep your sleeves clear of the charcoal.', 'Blaze: everything doubles this hand. The money and the trouble.'],
  kizuna: ['Bond: any raise raises everyone still in. Choose like family. Or don’t, like most families.', 'Bond: one raise lifts every bet at the table. Nobody raises alone.'],
  hebi: ['Serpent: ties go to the House this hand. The House calls this tradition.', 'Serpent: a tie counts as a loss. Win it outright or don’t bother.'],
  kitsune: ['Fox: {name}’s cards are face up for everyone, the House included. Wave, {name}.', 'Fox: {name} is playing with the cards showing. Very brave. Not voluntary.'],
  gyaku: ['Reversal: the weaker hand wins this one. Finally, a use for your cards.', 'Reversal: low is high. Whoever’s been dealt garbage all night, this is your moment.'],
};

// ---------------------------------------------------------------------------
// The showdown
// ---------------------------------------------------------------------------

/**
 * Only the rare moments get a line; the showdown panel already says who won,
 * what was paid, and who was seen.
 */
export const SHOWDOWN: Record<ShowdownKind, Bank> = {
  crew: [],
  house: [],
  tie: [],
  walked: ['Everybody folded. Even the cat looked disappointed.', 'All folded. Walking away still costs heat. The street saw you leave.'],
  seen: [],
  royal: ['A royal flush. I’ve poured for two in thirty years. I’m framing this one.'],
  yakuza: ['Eight, nine, three: ya-ku-za, the worst hand in the old game. Naming a bar after it seemed funny at the time.'],
  'bad-beat': ['{Hand}, and it still lost. I’ll get you a towel.', '{Hand}. Lost. Some nights the cards just want to see you suffer.'],
  serpent: ['A tie under the Serpent. The House wins on a technicality. It loves those.'],
  reversal: ['Reversal, and the crew’s worse hand won. I’ve never been prouder of bad cards.'],
  'quiet-champion': ['{name} never raised and carried the whole hand. Watch the quiet ones.', 'Nobody bet on {name}. Not even {name}. And yet.'],
  'trash-rider': ['{name} got paid holding {hand}. That’s the crew. That’s the whole idea.', '{name} rode in on {hand} and left with money. I respect it.'],
};

export const TAKE: Bank = ['That’s the target. Only heat can stop you now. Don’t do anything a cop would find interesting.'];

export const HEAT: Record<HeatMark, Bank> = {
  half: ['Heat at half. Somebody downstairs is pretending not to listen.', 'Halfway to a raid. The yakitori man stopped fanning his coals to look up.'],
  'three-quarters': ['Heat at three-quarters. I’ve moved the good bottles under the counter. Fold the weak hands.', 'Three-quarters of the way to a raid. There’s a patrol car idling at the corner. Probably nothing.'],
  'one-away': ['One more heat and they come up the stairs. I’ve unlocked the back door. No reason.', 'One heat from a raid. Fold anything you wouldn’t defend in court.'],
};

// ---------------------------------------------------------------------------
// Regulars with something to add, when they're at the table
// ---------------------------------------------------------------------------

export const REGULAR_MOMENTS: Partial<Record<RegularName, Partial<Record<'heat' | 'last' | 'take' | 'walked' | 'yakuza', Bank>>>> = {
  Gin: { take: ['Counted. Twice. That’s the target.'] },
  Nao: { last: ['Meter’s running downstairs. Last one, please.'] },
  Taka: { heat: ['That engine’s unmarked. Two blocks out. Just saying.'] },
};

// ---------------------------------------------------------------------------
// The lobby, while nothing is happening
// ---------------------------------------------------------------------------

export const IDLE: Bank = [
  'Send the link to fill the stools, or add bots. The bots never complain about the music.',
  'Each round, everyone picks at once. No talking about your cards. Eyebrows are a gray area.',
  'Folding costs nothing. Staying in with junk can cost heat. Ask anyone at this bar.',
  'If the crew’s best hand wins, everyone still in gets paid. Even whoever’s holding seven-deuce.',
  'New here? Shitamachi is the forgiving table. Forgiving is a strong word.',
  'Same record for eleven years. Nobody’s asked me to change it. Nobody dares.',
  'Somebody left an umbrella here in 1994. I’m still holding it for them. Debts are debts.',
]

export const IDLE_CAT: Bank = ['Kyū’s asleep on the ledger. Let her.'];

// ---------------------------------------------------------------------------
// Easter eggs
// ---------------------------------------------------------------------------

export const EGG_LINES = {
  neon: ['Eight, nine, three. The sign heard you.', 'Careful. The neon’s old. So am I.'],
  konami: ['Up, up, down, down. That’s how my knees go on these stairs.'],
  buta: ['That card isn’t in the deck. It never was. Put it back.'],
  lantern: ['Leave the lantern. It’s older than me.', 'Eight times. The lantern counts too, you know.'],
  kanpai: ['Kanpai. To bad hands.', 'Kanpai. Drink before the cards get cold.'],
  cat: ['That’s Kyū. She’s the nine. I’m the eight and the three. Don’t ask.'],
  matchbook: ['Keep the matches. Everyone does. Nobody smokes anymore.'],
} as const;

// ---------------------------------------------------------------------------
// The cold open: the first thing anyone sees
// ---------------------------------------------------------------------------

export interface ColdOpenBeat {
  text: string;
  /** Shown faintly with the line. */
  kanji?: string;
  /** The final beat presses a seal. */
  seal?: boolean;
  hold: number;
}

export const COLD_OPEN: readonly ColdOpenBeat[] = [
  { text: 'Shinjuku. Golden Gai. Three in the morning.', hold: 2600 },
  { text: 'In the old card game, eight, nine and three add up to nothing.', hold: 3200 },
  { text: 'Ya. Ku. Za.\nThe worst hand there is.', kanji: '八九三', seal: true, hold: 3200 },
  { text: 'A co-op poker game. Your crew against the House. No talking about your cards.', hold: 3400 },
];

// ---------------------------------------------------------------------------
// Who's talking
// ---------------------------------------------------------------------------

export interface SpeakerInfo {
  name: string;
  /** For the vertical seal. One to three characters. */
  seal: string;
  kind: 'master' | 'house' | 'mask' | 'regular';
}

export function speakerInfo(speaker: Speaker): SpeakerInfo {
  if (speaker === 'master') return { name: MASTER.name, seal: MASTER.kanji, kind: 'master' };
  if (speaker === 'house') return { name: 'The House', seal: '胴元', kind: 'house' };
  if (isRegular(speaker)) return { name: speaker, seal: REGULARS[speaker].kanji, kind: 'regular' };
  const mask = MASKS[speaker as MaskId];
  return { name: mask.name, seal: mask.kanji, kind: 'mask' };
}
