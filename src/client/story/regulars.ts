// The regulars: the bots who fill empty stools. Each one owes the family for
// a different reason, and each one gets a sentence, an introduction, and a few
// things to say when the cards go their way, or don't.

import type { RegularName } from './types';

export interface Regular {
  name: RegularName;
  kanji: string;
  /** One line of backstory, in the Master's words. */
  story: string;
  /** What they say when they sit down. */
  intro: readonly string[];
  /** When their hand carried the crew. */
  carried: readonly string[];
  /** When the House took it. */
  lost: readonly string[];
}

export const REGULARS: Record<RegularName, Regular> = {
  Tetsu: {
    name: 'Tetsu',
    kanji: '鉄',
    story: 'Ironworker. Built half the overpasses in Shinjuku. Lost two fingers and none of his patience.',
    intro: ['Tetsu. I’ll sit.', 'Tetsu. Don’t talk to me before the flop.'],
    carried: ['Steel.', 'Told you. I’ll sit.'],
    lost: ['Rust.', 'Next one.'],
  },
  Okami: {
    name: 'Okami',
    kanji: '女将',
    story: 'Ran an inn at Atami until the family bought the mortgage. Still bows to everyone, including the masks.',
    intro: ['Okami. Please, take the good stool. I insist.', 'Good evening. I’m Okami. I’ve brought towels for the rain.'],
    carried: ['How kind of the cards.', 'I’ll bow to that.'],
    lost: ['Thank you for having us anyway.', 'Oh dear.'],
  },
  Hana: {
    name: 'Hana',
    kanji: '花',
    story: 'Florist by the east exit. Closes at two, always smells of chrysanthemums, which are for funerals.',
    intro: ['Hana. I brought flowers. Not for anyone. Yet.', 'Hana. Don’t mind the smell. Chrysanthemums.'],
    carried: ['Bloomed.', 'Something nice for once.'],
    lost: ['I’ll save the lilies, then.', 'Wilted.'],
  },
  Gin: {
    name: 'Gin',
    kanji: '銀',
    story: 'Pachinko professional for forty years. Silver hair, silver balls, counts everything twice.',
    intro: ['Gin. I counted the exits on the way up. Two.', 'Gin. Nine stairs, six stools, one window. Good.'],
    carried: ['Counted it. It’s right.', 'Jackpot. Quietly.'],
    lost: ['The odds were the odds.', 'I counted that too.'],
  },
  Kuro: {
    name: 'Kuro',
    kanji: '黒',
    story: 'Session drummer at a jazz kissa in Shinjuku-sanchōme. Sunglasses indoors. Plays brushes on the bar while he thinks.',
    intro: ['Kuro. Don’t mind the tapping.', 'Kuro. I keep time. Somebody should.'],
    carried: ['On the one.', 'That’s the groove.'],
    lost: ['Dropped a beat.', 'Rest. Count it in again.'],
  },
  Sumi: {
    name: 'Sumi',
    kanji: '墨',
    story: 'Calligrapher. Carves hanko for a living, some of them for people who don’t exist.',
    intro: ['Sumi. If anyone needs a seal, I didn’t make it.', 'Sumi. Ink on my hands. It doesn’t come off.'],
    carried: ['Stamped.', 'Clean stroke.'],
    lost: ['A blot. It happens.', 'Smudged.'],
  },
  Rin: {
    name: 'Rin',
    kanji: '鈴',
    story: 'Night nurse at the hospital in Ōkubo. Nineteen-hour shifts. Has seen everything twice and been surprised once.',
    intro: ['Rin. I’m on at six. Let’s be done by six.', 'Rin. Wake me if it’s my turn.'],
    carried: ['Pulse is good.', 'Stable.'],
    lost: ['I’ve seen worse. Tonight, even.', 'Flatline. Next.'],
  },
  Jun: {
    name: 'Jun',
    kanji: '純',
    story: 'Second-year at Waseda, paying off his older brother’s debt. Far too young for this room and knows it.',
    intro: ['Jun. I’m older than I look. A little.', 'Jun. My brother says hello. He couldn’t come.'],
    carried: ['Wait. Did I do that.', 'Don’t tell my brother.'],
    lost: ['Sorry. Sorry.', 'I knew I should have folded.'],
  },
  Mame: {
    name: 'Mame',
    kanji: '豆',
    story: 'Runs the oden cart at the bottom of the stairs. Nobody knows why she owes the family. Possibly she doesn’t.',
    intro: ['Mame. Don’t let me win too much. It makes them nervous.', 'Mame. The daikon’s on. Let’s be quick.'],
    carried: ['Hm. Again, I suppose.', 'Beginner’s luck. For sixty years.'],
    lost: ['Good. Let them feel tall.', 'Ah well.'],
  },
  Taka: {
    name: 'Taka',
    kanji: '鷹',
    story: 'Was a detective at Shinjuku station for twenty years. Left for a reason he won’t name. Can hear a raid before it starts.',
    intro: ['Taka. Relax. I’m not on anyone’s side anymore.', 'Taka. I’ll take the stool by the door.'],
    carried: ['Case closed.', 'Didn’t see that coming. Nobody did.'],
    lost: ['Write it up.', 'Cold case.'],
  },
  Nao: {
    name: 'Nao',
    kanji: '直',
    story: 'Night taxi driver. Leaves the meter running downstairs, every time, on principle.',
    intro: ['Nao. Meter’s running. Let’s go.', 'Nao. I double-parked. Make it quick.'],
    carried: ['Green light.', 'Fare paid.'],
    lost: ['Wrong turn.', 'Traffic.'],
  },
  Fuji: {
    name: 'Fuji',
    kanji: '藤',
    story: 'Enka singer. Had one hit in 1989. Still sings it at karaoke when nobody asks.',
    intro: ['Fuji. You might know my song. You don’t.', 'Fuji. If they play my song, I’ll leave.'],
    carried: ['Encore.', 'That’s the chorus.'],
    lost: ['Off key.', 'They never liked the B-side.'],
  },
};

export function isRegular(name: string): name is RegularName {
  return Object.hasOwn(REGULARS, name);
}

/** The regular behind a bot seat, if the name is one of theirs. */
export function regularFor(name: string): Regular | null {
  return isRegular(name) ? REGULARS[name] : null;
}
