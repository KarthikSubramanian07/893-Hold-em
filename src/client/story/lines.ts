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
    'Mind the stairs. Sit anywhere. The House sits across.',
    'First time. Coat on the hook. Don’t touch the cat.',
    'Come in out of the rain. Everyone here owes something. You’ll fit right in.',
    'Six stools, one table, one way to pay. Sit down.',
  ],
  returning: [
    'Back again. Same stool.',
    'The usual. I’ll put it on your tab. You don’t have a tab.',
    'I kept your seat dry.',
    'You came back. They always do. I don’t know why.',
  ],
  rejoin: ['Your stool’s still warm. Sit.', 'They dealt you in while you were gone. Catch up.'],
  spectator: ['Standing room only. Don’t lean on the glass.', 'Watch if you like. Don’t breathe on the cards.'],
  code893: [
    'Table eight-nine-three. Somebody upstairs is laughing.',
    'Eight, nine, three. Of all the tables in this city.',
  ],
  oyabun: [
    'You wrote “Oyabun” on the board. He’s going to see that.',
    'Bold name. He’s sat in that chair longer than you’ve been alive.',
  ],
  master: ['There’s only one Master in here. Pick another name. Or don’t, and confuse everyone.'],
  cat: ['That’s the cat’s name. She’ll allow it, this once.'],
  threeAm: [
    'It really is three. Even I’m usually closing by now.',
    'Three in the morning. The only honest hour in Shinjuku.',
  ],
} as const;

export const JOIN_OYABUN: Bank = ['{name}. Bold name. He’s going to see that.', 'Somebody calling themselves {name}. He’ll enjoy that. Briefly.'];

export const JOIN: Bank = [
  '{name} came up the stairs.',
  'A new face. {name}. Mind the cat.',
  '{name}. Shake off the rain.',
  'The door again. {name}, this time.',
];

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
      'The corner table tonight. The collectors. They smile a lot. Don’t smile back.',
      'Shitamachi. Low ceiling, low stakes, low men. Keep your heads down.',
      'The first debt is the small one. They send their smallest masks for it.',
    ],
    epilogue: {
      clean: [
        ['That’s the corner debt paid. Okame will tell them you were polite.', 'Kabukichō will want to meet you now. That isn’t a compliment.'],
        ['Ebisu crossed you out. In ink.', 'Go home. Next time the masks are taller.'],
      ],
      raid: [
        ['Sirens on the stairs. Out the back, past the bins. You know the way now.', 'The corner table will still be here. So will the debt.'],
        ['Hyottoko ran first. I’ll give him that.', 'Tomorrow, then. Quieter.'],
      ],
      short: [
        ['Close isn’t money. Okame smiled the whole way down the stairs.', 'Come back tomorrow. It’ll be raining.'],
        ['Ebisu wrote it in pencil. That’s mercy, for him.', 'The debt keeps. Debts always keep.'],
      ],
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
      'Kabukichō. Every sign out there is lying to you, in neon.',
      'The lieutenants came down from the fourth floor for this. They never come down.',
      'The fox is dealing tonight. Count your cards. Then count them again.',
    ],
    epilogue: {
      clean: [
        ['You walked out of Kabukichō with money. People don’t, usually.', 'There’s a car downstairs. The boss wants a word. Not tonight.'],
        ['The Tengu said “luck” all the way to the door.', 'Upstairs has heard your names now. Sleep with the light on.'],
      ],
      raid: [
        ['Blue light through the rain. The Tengu was out the window before the first knock.', 'Nobody’s surprised. That’s the worst part.'],
        ['Hannya didn’t run. She just left. There’s a difference.', 'Lie low. The neon stays on without you.'],
      ],
      short: [
        ['The fox counted twice and smiled once. You owe what you owed.', 'The neon doesn’t care. It stays on.'],
        ['Kitsune bowed, briefly. That means you’ll be back.', 'Rest. Kabukichō never does.'],
      ],
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
      'Top of the stairs. The room with the tatami and the one good chair. He’s already sitting.',
      'The Oyabun plays the first hand himself. He always has.',
      'Shoes off. Voices down. Every hand in this room has a catch.',
    ],
    epilogue: {
      clean: [
        ['He bowed. I’ve poured for him for thirty years. He has never bowed.', 'The debt is paid. Go home. Come back only if you want to.'],
        ['He laughed. Once, softly, like a door closing.', 'You’re free. That has never meant what people think.'],
      ],
      raid: [
        ['Even the boss’s room gets raided. He finished his tea first.', 'He’ll forgive the police. He won’t forget you.'],
        ['Hannya held the door for him. Nobody held it for you.', 'Rest. He doesn’t hurry. Neither should you.'],
      ],
      short: [
        ['He said nothing. He poured you a drink himself. That’s worse.', 'Same time tomorrow. The rain will keep.'],
        ['“Patience,” he said. He has more of it than you have nights.', 'Come back when you’re ready. He’ll be sitting.'],
      ],
    },
  },
};

/** Said once at the end of any clean night when heat was one from the limit. */
export const CLOSE_CALL: Bank = ['One more mark and you’d have met the police on the stairs. Breathe.', 'That close. I had the back door open.'];

/** Said once at the end of a night where the crew took all six. */
export const CLEAN_SWEEP: Bank = ['Six for six. I’ve seen it once before. He doesn’t drink here anymore.', 'Six hands, six wins. Don’t tell anyone. Really.'];

// ---------------------------------------------------------------------------
// Hands and rules
// ---------------------------------------------------------------------------

export const LAST_HAND = {
  short: ['Last hand. You need {need}. I’ve seen it done. Once.', 'Sixth hand. {need} short. Make it count.'],
  made: ['Last hand. You’ve got what you came for. Don’t get greedy. Or do.', 'Last one. The debt’s covered. Now it’s only pride.'],
  hot: ['Last hand, and the street is listening. Fold if you must.', 'One more hand. One more mark and they come up the stairs.'],
} as const;

/** Only used if a hand starts with no House Rule. */
export const HAND: Bank = ['Next hand. Same rain.', 'Fresh cards. Old debts.', 'Deal.', 'Again.'];

/** The Fox, when the narrator can't tell whose cards are up. */
export const KITSUNE_ANON: Bank = ['One of you has no secrets this hand.', 'Somebody’s cards are face up. Play around them.'];

export const RULE_LINES: Record<RuleId, Bank> = {
  kiri: ['Window’s fogged. So’s the river.', 'Fog off the canal. You’ll see the last card when it’s too late.', 'Play what you can see. Pray about the rest.'],
  kagami: ['The masks are showing a card each. Generous. Suspicious.', 'Mirror on the table. Look, but don’t believe it.', 'A little honesty from the House. Don’t get used to it.'],
  oni: ['Somebody else came up the stairs. He doesn’t knock.', 'There’s a red mask in the doorway. Make room.', 'One more seat across. Count them.'],
  shizuka: ['Quiet now. Nobody shows their calls.', 'Hush. Even the rain is listening.', 'Keep your hands still. Keep your faces stiller.'],
  homura: ['Everything burns double this hand. Money too.', 'Somebody turned the charcoal up. Take and heat, doubled.', 'Big pot, big fire. Mind your sleeves.'],
  kizuna: ['One raise lifts everyone. Choose like family.', 'Bond. If one of you goes up, you all do.', 'Tied together this hand. Don’t pull.'],
  hebi: ['The snake’s on the table. A tie is a loss.', 'Serpent. Close isn’t enough. Win it outright.', 'Ties go to the House. They always did, really.'],
  kitsune: ['{name}’s cards are face up. Nothing to hide, nowhere to hide it.', 'The fox turned {name}’s cards over. Play around it.', 'Everyone can see what {name} holds. Including the House.'],
  gyaku: ['Upside down. The worst hand wins. Trust your trash.', 'Reversal. In here, low is high and the boss is smiling.', 'Lowball. Throw away your pride first.'],
};

// ---------------------------------------------------------------------------
// The showdown
// ---------------------------------------------------------------------------

export const SHOWDOWN: Record<ShowdownKind, Bank> = {
  crew: ['Paid.', 'That one’s yours. All of it.', 'Everyone who stayed gets paid. That’s the deal.', 'Good. Pour another.', 'The House pays. It hates that.'],
  house: ['The House takes it.', 'That’s heat. The street noticed.', 'Not this one.', 'They were holding. They usually are.'],
  tie: ['Dead even. Nobody pays, nobody bleeds.', 'A draw. The rain doesn’t care either.', 'Even. Let’s pretend that didn’t happen.'],
  walked: [
    'Everybody walked. The street still noticed.',
    'Every hand on the felt, face down. Somebody downstairs writes that down.',
    'Walking away is a choice. It isn’t free.',
  ],
  royal: [
    'A royal flush. In thirty years I’ve poured for two. Now three.',
    'Ten to the ace, one suit. Even the masks went quiet.',
  ],
  yakuza: [
    'Eight, nine, three. Ya, ku, za. The worst hand there is, and here it is.',
    'Eight, nine, three on the table. In the old game that’s nothing. In this room it’s a name.',
    'Ya-ku-za. Twenty, which counts as zero. Everybody here was dealt it once.',
  ],
  'bad-beat': [
    '{Hand}, and it still lost. Some nights are like that. Most, actually.',
    'That was {hand}. That should have been enough. I’m sorry.',
  ],
  serpent: ['Dead even, and the snake bites. Ties belong to the House.', 'A tie, under the Serpent. That’s a loss with good manners.'],
  reversal: ['The worst hand won. The boss likes it upside down. Tonight, so do you.', 'Lowball, and you went lower. Well done.'],
  'quiet-champion': [
    '{name} never raised once. Look who carried it.',
    'Nobody bet on {name}. Not even {name}. And yet.',
  ],
  'trash-rider': [
    '{name} rode in on nothing and got paid all the same. That’s the crew.',
    '{name} had {hand}. {name} gets paid anyway. Never forget that.',
  ],
  seen: [
    'Paid. But {names} got seen. The street remembers faces.',
    'The crew takes it. {names} lost to the masks, and the street noticed.',
    'Money in. Heat on {names}. Both count.',
  ],
};

export const TAKE: Bank = [
  'That’s the debt. Everything after this is yours.',
  'You can stop here. Nobody ever stops here.',
  'Enough to pay them. Now keep it.',
];

export const HEAT: Record<HeatMark, Bank> = {
  half: [
    'Half the street knows your faces now.',
    'Somebody downstairs just made a phone call.',
    'The yakitori man stopped fanning his coals to look up. Keep it down.',
  ],
  'three-quarters': [
    'That’s a patrol car idling at the corner. Probably nothing.',
    'I’ve moved the good bottles under the counter. No reason.',
    'The neon across the alley went off. It never goes off.',
  ],
  'one-away': [
    'One more and they come up the stairs.',
    'I’ve put the back door on the latch. Just in case.',
    'Footsteps in the rain. Not yet. One more mark.',
  ],
};

// ---------------------------------------------------------------------------
// Regulars with something to add, when they're at the table
// ---------------------------------------------------------------------------

export const REGULAR_MOMENTS: Partial<Record<RegularName, Partial<Record<'heat' | 'last' | 'take' | 'walked' | 'yakuza', Bank>>>> = {
  Taka: { heat: ['I know that engine. Unmarked. Two blocks.', 'Shift change at the kōban. We have ten minutes.'] },
  Nao: { last: ['Meter’s at eleven thousand. Just saying.', 'Last one. I can get us to Nakano in twelve.'] },
  Gin: { take: ['Counted. That’s enough.', 'That’s the number. I checked twice.'] },
  Mame: { walked: ['Even the ghosts here owe money.', 'Everybody out. Like the oden cart at closing.'] },
  Sumi: { yakuza: ['Eight, nine, three. I carved that seal once. For a man who isn’t alive.'] },
};

// ---------------------------------------------------------------------------
// The lobby, while nothing is happening
// ---------------------------------------------------------------------------

export const IDLE: Bank = [
  'The ice machine does that. Ignore it.',
  'Somebody left an umbrella here in 1994. I’m still holding it for them.',
  'Rain’s heavier. Good for business. Bad for umbrellas.',
  'Send the link. I’ll pour while we wait.',
  'Six stools. Bring friends, or I’ll seat the regulars.',
  'The lantern flickers on the hour. It isn’t a ghost. Probably.',
  'Same record for eleven years. Nobody’s asked me to change it.',
  'Last train left at 12:38. Nobody here was on it.',
  'They say the Oyabun drinks only water. They say a lot of things.',
];

export const IDLE_CAT: Bank = ['Kyū’s asleep on the ledger. Let her.', 'The cat’s watching the door. She knows something.'];

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
  { text: 'Everyone in this bar was dealt it. Come up. Play it together.', hold: 3400 },
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
