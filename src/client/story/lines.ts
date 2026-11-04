// Everything the bar says, in banks keyed by moment. The narrator picks one
// variant per moment with `pick(bank, code, hand, event)`, so every client at a
// table reads the same line at the same time.
//
// Voice rules (tested): no exclamation points, no emoji, short sentences.
// Templates use {name}, {names}, {need}, {hand}, {Hand}.

import type { Difficulty, Verdict } from '../../engine/types';
import { MASKS } from './masks';
import { REGULARS, isRegular } from './regulars';
import type { MarkerMark, MaskId, NodKind, RegularName, ShowdownKind, Speaker } from './types';

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
  practice: [
    'Just you and the regulars tonight. Nobody is watching. Well, the cat.',
    'Practice table. Real cards, fake stakes. The regulars play like it’s neither.',
    'Learn the nod here. The regulars won’t tell anyone how it went. Tetsu might.',
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
      'The corner table, the low end of the debt. Okame deals for the family here, holding three cards and smiling at everyone.',
    intro: [
      'Shitamachi, the forgiving table. Okame holds three cards. Mostly bark.',
      'The corner table. Small debts. The House holds three. Okame smiles at everyone. Don’t take it personally.',
    ],
    epilogue: {
      clean: [['Clean getaway. The corner debt is paid. Okame is still smiling, which is either good or terrible.']],
      raid: [['Raided. Out the back, past the bins. Nod for the strong hands, not the friendly faces.']],
      dawn: [['Last orders, and the shutters came down. Nobody won. Nobody was caught. Go home.']],
    },
  },
  kabukicho: {
    id: 'kabukicho',
    number: '二',
    kanji: '歌舞伎町',
    name: 'Kabukichō',
    title: 'Every Sign Is Lying',
    synopsis:
      'The lieutenants come down from the fourth floor. Kitsune deals with four cards up her sleeve and one of them on the table.',
    intro: [
      'Kabukichō. The fox holds four cards. Every sign outside is lying. So is the fox.',
      'The lieutenants came down for this. The House holds four. They took the stairs. That’s serious.',
    ],
    epilogue: {
      clean: [['Clean getaway from Kabukichō. Few crews manage it. The boss has heard your names. Congratulations, I think.']],
      raid: [['Raided. The fox was out the window before the first knock. Trust the nods next time.']],
      dawn: [['Last orders in Kabukichō. The fox counted twice and smiled once. Dawn, and nothing to show.']],
    },
  },
  oyabun: {
    id: 'oyabun',
    number: '三',
    kanji: '親分',
    name: 'Oyabun',
    title: 'The Old Man Upstairs',
    synopsis:
      'The room at the top of the stairs, with tatami and the one good chair. The Oyabun sits behind the Okina mask and holds five cards.',
    intro: [
      'The boss’s table. He holds five cards and plays the best of them. Shoes off. He notices.',
      'Top of the stairs. Five cards in his hand. He drinks only water, which is somehow more frightening.',
    ],
    epilogue: {
      clean: [['Clean getaway from the boss’s table. He bowed. I’ve poured for him thirty years. He has never bowed.']],
      raid: [['Raided, even up here. He finished his tea first. Nod for the hands you’d bet your shoes on.']],
      dawn: [['Last orders at the top of the stairs. He poured you a drink himself. That’s worse than shouting.']],
    },
  },
};

/** Said once at the end of a clean night that passed within one step of the sirens. */
export const CLOSE_CALL: Bank = ['One step from the sirens, and still out clean. I’m going to need a minute.'];

/** Said once at the end of a clean night that never took a step toward the sirens. */
export const CLEAN_SWEEP: Bank = ['Not one step toward the sirens all night. I’m checking the deck.'];

// ---------------------------------------------------------------------------
// Hands and nods
// ---------------------------------------------------------------------------

export const LAST_ORDERS = {
  far: ['Last orders. One more hand, then the shutters. {need} steps to the door.'],
  near: ['Last orders. The door is right there. One good hand.'],
  hot: ['Last orders, and the sirens are close. Only go In if you mean it.'],
} as const;

/** When the nods turn over. Most turns get nothing; these are the ones worth a word. */
export const NODS: Record<NodKind, Bank> = {
  'all-pass': ['Nobody nodded at anybody. Very trusting crew.', 'Not one nod. Everyone’s keeping their opinions to themselves.'],
  'pile-on': ['Everyone nodded at {name}. No pressure, {name}.', 'The whole crew nodded at {name}. {name} can’t see why. That’s the game.'],
  mutual: ['{names} nodded at each other. Either a pact or a coincidence.'],
};

// ---------------------------------------------------------------------------
// The showdown
// ---------------------------------------------------------------------------

/**
 * Only the rare moments get a line; the showdown panel already says who won,
 * how far the marker moved, and what you were holding.
 */
export const SHOWDOWN: Record<ShowdownKind, Bank> = {
  crew: [],
  house: [],
  tie: ['Dead even. The marker stays. The House shrugs.'],
  walked: ['Everybody went Out. Even the cat looked disappointed.', 'All Out. Sitting on your hands still costs a step. The street saw you hesitate.'],
  royal: ['A royal flush. I’ve poured for two in thirty years. I’m framing this one.'],
  yakuza: ['Eight, nine, three: ya-ku-za, the worst hand in the old game. Naming a bar after it seemed funny at the time.'],
  'bad-beat': ['{Hand}, and it still lost. I’ll get you a towel.', '{Hand}. Lost. Some nights the cards just want to see you suffer.'],
  'sat-out': ['{name} went Out holding {hand}. That would have done it.', '{name} sat that one out with {hand}. Somebody should have nodded.'],
  'blind-carry': ['Nobody nodded at {name}. {name} went In anyway and carried it.', 'No nods for {name}, and {name} carried the crew. Blind faith pays sometimes.'],
  'nodded-carry': [],
  'all-in': ['Everyone In, and it held. That’s a crew.', 'The whole table went In. The marker ran for the door.'],
  'big-swing': [],
};

/** A big step one way or the other, after the showdown line. */
export const SWING = {
  up: ['That’s a long stride toward the door.'],
  down: ['That one hurt. The sirens got a lot closer.'],
} as const;

/** The marker crossing a line the room can feel. */
export const MARKER: Record<MarkerMark, Bank> = {
  'door-near': ['One step from the door. I can see the alley from here.', 'The door is one step away. Don’t trip on the mat.'],
  'sirens-near': ['One step from the sirens. I’ve unlocked the back door. No reason.', 'One more lost step and they come up the stairs. Only go In for real.'],
};

/** Personal: the first time you see your own cards, and they were a monster. */
export const REVEAL: Bank = [
  'You held {hand} the whole time and never knew. That’s this game.',
  '{Hand}, in your own hands, all along. Your crew could see it. You couldn’t.',
];

// ---------------------------------------------------------------------------
// Regulars with something to add, when they're at the table
// ---------------------------------------------------------------------------

export type RegularMoment = 'sirens' | 'last' | 'door' | 'walked' | 'yakuza';

export const REGULAR_MOMENTS: Partial<Record<RegularName, Partial<Record<RegularMoment, Bank>>>> = {
  Gin: { door: ['Counted. One step. Walk, don’t run.'] },
  Nao: { last: ['Meter’s running downstairs. Last one, please.'] },
  Taka: { sirens: ['That engine’s unmarked. Two blocks out. Just saying.'] },
};

// ---------------------------------------------------------------------------
// The lobby, while nothing is happening
// ---------------------------------------------------------------------------

export const IDLE: Bank = [
  'Send the link to fill the stools, or add bots. The bots never complain about the music.',
  'You see everyone’s cards but your own. Your crew sees yours. Trust them.',
  'After the flop, one nod each. It means you’re good. Use it wisely.',
  'In or Out, all at once. The best hand that’s In faces the House.',
  'A win moves you toward the door, one step for every player In. A loss, the other way.',
  'New here? Shitamachi is the forgiving table. Forgiving is a strong word.',
  'Same record for eleven years. Nobody’s asked me to change it. Nobody dares.',
  'Somebody left an umbrella here in 1994. I’m still holding it for them. Debts are debts.',
];

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
  { text: 'A co-op poker game. You see every hand but your own. No talking.', hold: 3400 },
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
