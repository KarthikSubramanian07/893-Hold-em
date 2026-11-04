// Who sits across the table. The House is one masked figure, and which mask it
// wears is fixed per table, so the 3D scene, the narrator, and the docs always
// agree on who just took your night. The other faces are friends of the family.
//
//   Shitamachi  Okame (the House), Hyottoko, Ebisu
//   Kabukichō   Kitsune (the House), Tengu, Hannya
//   Oyabun      Okina (the House), Hannya, Kitsune
//   any table   Oni, who turns up in the stories

import type { Difficulty } from '../../engine/types';
import type { MaskId } from './types';

export interface MaskPalette {
  /** The lacquered face. */
  face: string;
  /** Brows, mouth, outlines. */
  ink: string;
  /** Cheeks, markings, lips. */
  accent: string;
  /** Eye whites or gilded eyes. */
  eyes: string;
  /** Horns, beard, or hair, where the mask has any. */
  trim?: string;
  /** How the lantern should catch it: 0 matte paper, 1 wet lacquer. */
  gloss: number;
}

export interface MaskLines {
  /** When the mask first takes its seat. */
  intro: readonly string[];
  /** The House won and this mask held the hand. */
  win: readonly string[];
  /** The crew beat this mask's hand. */
  lose: readonly string[];
  /** A dead heat against this mask. */
  tie: readonly string[];
}

export interface Mask {
  id: MaskId;
  name: string;
  kanji: string;
  /** What the mask is, in one plain line. */
  what: string;
  /** Who wears it at this bar. */
  personality: string;
  palette: MaskPalette;
  lines: MaskLines;
}

export const MASKS: Record<MaskId, Mask> = {
  okame: {
    id: 'okame',
    name: 'Okame',
    kanji: '阿亀',
    what: 'The round-cheeked woman of festival dances. She is always smiling.',
    personality:
      'The collector. Brings mikan for the regulars and remembers their children’s names. The smile is painted on, and so is everything else.',
    palette: { face: '#f4ede1', ink: '#1b1a17', accent: '#e39a8e', eyes: '#1b1a17', trim: '#1b1a17', gloss: 0.55 },
    lines: {
      intro: [
        'There you are. We were so worried you wouldn’t come.',
        'Sit, sit. I brought mikan. Nobody ever takes one.',
        'Such a nice night for it. Isn’t it always.',
      ],
      win: [
        'Oh, don’t look like that. It’s only money.',
        'There. That wasn’t so bad.',
        'I’ll tell them you were very polite about it.',
      ],
      lose: [
        'Lovely. I’ll tell them you were lovely.',
        'Well. Aren’t you all clever tonight.',
        'I’m still smiling. You’ll notice I’m always smiling.',
      ],
      tie: ['Nobody wins. How restful.', 'Let’s call it a kindness.'],
    },
  },
  hyottoko: {
    id: 'hyottoko',
    name: 'Hyottoko',
    kanji: '火男',
    what: 'The fire-blower: a crooked mouth puckered at the coals.',
    personality:
      'The kid. Three weeks in the family and still sweating through his shirt. He keeps the charcoal going and counts the cards out loud when he thinks no one can hear.',
    palette: { face: '#e9cfa4', ink: '#231a12', accent: '#d2412a', eyes: '#f7f1e3', trim: '#231a12', gloss: 0.35 },
    lines: {
      intro: [
        'I’m just here to hold the cards. Honest.',
        'Sorry. Sorry. Is this my seat.',
        'They said this would be an easy one.',
      ],
      win: ['That’s mine? That’s mine.', 'I didn’t even do anything.', 'Okame, look. Look.'],
      lose: [
        'They’re going to hear about this.',
        'That’s fine. That’s completely fine.',
        'Don’t tell Okame.',
      ],
      tie: ['Is that allowed?', 'Does that count for me or not.'],
    },
  },
  ebisu: {
    id: 'ebisu',
    name: 'Ebisu',
    kanji: '恵比寿',
    what: 'The laughing god of fishermen and luck, cheeks like rice cakes.',
    personality:
      'The bookkeeper. Writes every debt in a ledger older than the bar, in beautiful brush hand. Laughs at everything, and the laugh never reaches the ledger.',
    palette: { face: '#e8c48a', ink: '#2a1d10', accent: '#c9a45c', eyes: '#2a1d10', trim: '#2a1d10', gloss: 0.7 },
    lines: {
      intro: [
        'Ebisu keeps the book. Smile for the book.',
        'Every name at this table is already written down. Don’t worry. In pencil.',
        'Luck is a fish. You either eat or you’re bait.',
      ],
      win: ['Into the book.', 'Ha. The book gets heavier.', 'I’ll use the good ink for that one.'],
      lose: ['Ink is ink. I’ll write it either way.', 'Ha. Even the book is surprised.', 'Crossed out. Neatly.'],
      tie: ['Nothing to write. How dull.', 'A blank line. I’ll leave it blank.'],
    },
  },
  kitsune: {
    id: 'kitsune',
    name: 'Kitsune',
    kanji: '狐',
    what: 'The white fox, red at the eyes, sly at the mouth.',
    personality:
      'The dealer. Runs three card rooms in Kabukichō and has never once been caught. Very polite. Very fond of you. Means neither.',
    palette: { face: '#f6f1e8', ink: '#1b1a17', accent: '#d2412a', eyes: '#c9a45c', trim: '#d2412a', gloss: 0.8 },
    lines: {
      intro: [
        'Shall we. I promise nothing.',
        'I’ve heard so much about you. None of it true, I hope.',
        'Cut the deck, if it makes you feel better.',
      ],
      win: ['You looked so sure.', 'There’s a lesson in that. I’ll keep it.', 'Thank you. I mean it, a little.'],
      lose: ['Clever. Remember that I said so.', 'Well played. Don’t do it again.', 'The fox bows. Briefly.'],
      tie: ['A draw. My favourite kind of lie.', 'Even. For now.'],
    },
  },
  tengu: {
    id: 'tengu',
    name: 'Tengu',
    kanji: '天狗',
    what: 'The long-nosed mountain goblin, red-faced and proud.',
    personality:
      'The purist. Believes he is the best player in Kabukichō and may be right. Has contempt for luck, and for anyone who needs it.',
    palette: { face: '#b52a1f', ink: '#140c0a', accent: '#efe8da', eyes: '#c9a45c', trim: '#efe8da', gloss: 0.9 },
    lines: {
      intro: [
        'I have never lost to luck. Once, to skill. 1997.',
        'Play properly or don’t play.',
        'I can smell a bluff from the stairs.',
      ],
      win: ['Skill.', 'Obviously.', 'Sit up. You’ll want to learn something.'],
      lose: ['Luck.', 'That was not poker. That was weather.', 'Hm. Write it down, Ebisu. I want to remember.'],
      tie: ['Neither.', 'Unsatisfying.'],
    },
  },
  hannya: {
    id: 'hannya',
    name: 'Hannya',
    kanji: '般若',
    what: 'The jealous demoness of noh: horns, gold eyes, a grief that turned to fury.',
    personality:
      'The enforcer. Rarely speaks. When something has to be broken, she is the one who arrives, and she is always on time.',
    palette: { face: '#ece2cc', ink: '#2b0d0b', accent: '#c9a45c', eyes: '#c9a45c', trim: '#e7dcc4', gloss: 0.85 },
    lines: {
      intro: ['…', 'Sit up straight.', 'Hands on the table.'],
      win: ['Mm.', 'Again.', 'That is what I came for.'],
      lose: ['Next time I watch your hands.', 'I’ll remember the faces.', '…Fine.'],
      tie: ['No.', 'Again.'],
    },
  },
  okina: {
    id: 'okina',
    name: 'Okina',
    kanji: '翁',
    what: 'The old man of noh, the most sacred mask there is: white brows, a gentle beard, eyes that smile.',
    personality:
      'The Oyabun himself. Soft-spoken, grandfatherly, and the reason the whole street is quiet after midnight. He plays the first hand of the night himself. He always has.',
    palette: { face: '#efe4cf', ink: '#3a2a1a', accent: '#c9a45c', eyes: '#1b1a17', trim: '#fbf8f1', gloss: 0.65 },
    lines: {
      intro: [
        'Sit, children. Sit. The rain will keep.',
        'I knew your fathers. Some of them still owe me.',
        'Master, the good bottle. They’ve come all this way.',
      ],
      win: [
        'There. Now we understand each other.',
        'Don’t be sad. Debts are only promises.',
        'Gently. Pick up your chips gently.',
      ],
      lose: ['Ah. Good. I like to be surprised.', 'Well done. I mean that.', 'You remind me of someone. He did well too.'],
      tie: ['Patience. Patience is cheap.', 'We’ll call that manners.'],
    },
  },
  oni: {
    id: 'oni',
    name: 'Oni',
    kanji: '鬼',
    what: 'The red demon: horns, tusks, a laugh like a truck in the alley.',
    personality:
      'A friend of the family. Nobody invited him. Nobody ever asks him to leave. He appears when the Oni card turns and takes the stool nobody wanted.',
    palette: { face: '#9c2a1e', ink: '#120807', accent: '#c9a45c', eyes: '#f2d27a', trim: '#e9dcc0', gloss: 0.75 },
    lines: {
      intro: ['Room for one more?', 'Don’t get up. I’ll squeeze in.', 'Somebody said there was a game.'],
      win: ['Ha.', 'Ha. Again.', 'Thanks for the drink.'],
      lose: ['Next time I bring friends.', 'Ha. Fine. Fine.', 'I liked that. Do it again and I won’t.'],
      tie: ['Boring. Ha.', 'Again, again.'],
    },
  },
};

/** The masks that hold the House's hands at each table, in seat order. */
export const TABLE_MASKS: Record<Difficulty, readonly MaskId[]> = {
  shitamachi: ['okame', 'hyottoko', 'ebisu'],
  kabukicho: ['kitsune', 'tengu', 'hannya'],
  oyabun: ['okina', 'hannya', 'kitsune'],
};

/**
 * The mask at `table`. The House wears the first one; the others are the
 * friends of the family who drift past (the lab and the story use them).
 */
export function maskFor(table: Difficulty, index = 0): Mask {
  const seats = TABLE_MASKS[table];
  return MASKS[seats[Math.max(0, Math.min(index, seats.length - 1))]!];
}

/** The first `count` masks at the table, House first. */
export function masksFor(table: Difficulty, count: number): Mask[] {
  return Array.from({ length: count }, (_, i) => maskFor(table, i));
}

/** The face the House wears tonight. */
export function houseMaskFor(table: Difficulty): Mask {
  return maskFor(table, 0);
}
