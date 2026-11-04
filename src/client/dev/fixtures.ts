// Hand-written GameViews for building and screenshotting the UI without a
// server. Open the app with `?fixture=<name>` to render one.

import type { GameView, HandValue, SeatView } from '../../engine/types';

const NOW = Date.now();

function seat(i: number, over: Partial<SeatView> = {}): SeatView {
  const names = ['Karthik', 'Mio', 'Ren', 'Daichi', 'Sora', 'Yuki'];
  const avatars = ['kitsune', 'koi', 'tora', 'tanuki', 'tsuru', 'karasu'] as const;
  return {
    id: `s${i}`,
    name: names[i]!,
    avatar: avatars[i]!,
    bot: i >= 3,
    host: i === 0,
    connected: true,
    cards: ['back', 'back'],
    locked: false,
    nod: null,
    stance: null,
    hand: null,
    champion: false,
    ...over,
  };
}

// Shitamachi with a crew of four: 11 steps to the door, 8 to the sirens.
const base: GameView = {
  code: 'K7QX2',
  phase: 'lobby',
  config: { difficulty: 'shitamachi', timer: 30 },
  you: 's0',
  seats: [],
  house: { cards: [], hand: null },
  board: [null, null, null, null, null],
  night: 1,
  hand: 0,
  lastOrders: 10,
  meter: 0,
  door: 11,
  sirens: 8,
  deadline: null,
  result: null,
  history: [],
  verdict: null,
  ready: [],
  now: NOW,
};

const hv = (score: number, category: HandValue['category'], name: string, best: HandValue['best']): HandValue => ({
  score,
  category,
  name,
  best,
});

const FULL_HOUSE = hv(7_000_000, 'full-house', 'Full house, sevens full of queens', ['7h', '7s', '7d', 'Qs', 'Qh']);
const HOUSE_TWO_PAIR = hv(3_100_000, 'two-pair', 'Two pair, kings and sevens', ['Kh', 'Kc', '7s', '7d', 'Qh']);

export const FIXTURES: Record<string, GameView> = {
  lobby: {
    ...base,
    seats: [seat(0, { cards: [] }), seat(1, { cards: [] }), seat(3, { cards: [], bot: true })],
    door: 9,
    sirens: 7,
  },

  /** The host is still drinking alone: the lobby offers the practice table. */
  'lobby-alone': {
    ...base,
    seats: [seat(0, { cards: [] })],
    door: 5,
    sirens: 5,
  },

  /** Hand one, the flop is out, two teammates have already nodded or passed. */
  nod: {
    ...base,
    phase: 'nod',
    hand: 1,
    board: ['Kh', '7s', '7d', null, null],
    seats: [
      seat(0),
      seat(1, { cards: ['7h', 'Qs'], locked: true }),
      seat(2, { cards: ['5c', '3d'] }),
      seat(3, { cards: ['Ts', 'Jc'], locked: true }),
    ],
    house: { cards: ['Kc', 'back', 'back'], hand: null },
    deadline: NOW + 22_000,
  },

  /** Hand three, the river is out, nods are on the table, In or Out. */
  call: {
    ...base,
    phase: 'call',
    hand: 3,
    meter: 1,
    board: ['Kh', '7s', '7d', '2c', 'Qh'],
    seats: [
      seat(0, { nod: 's1' }),
      seat(1, { cards: ['7h', 'Qs'], locked: true }),
      seat(2, { cards: ['5c', '3d'], nod: 's1' }),
      seat(3, { cards: ['Ts', 'Jc'], locked: true, nod: 's0' }),
    ],
    house: { cards: ['Kc', 'back', 'back'], hand: null },
    history: [
      { hand: 1, outcome: 'crew', moved: 3, ins: 3, crewBestName: 'Flush, ace high', houseBestName: 'Two pair, jacks and fours', carrier: 'Mio', carrierNods: 2 },
      { hand: 2, outcome: 'house', moved: -2, ins: 2, crewBestName: 'Pair of nines', houseBestName: 'Trip queens', carrier: null, carrierNods: 0 },
    ],
    deadline: NOW + 14_000,
  },

  showdown: {
    ...base,
    phase: 'showdown',
    hand: 3,
    meter: 4,
    board: ['Kh', '7s', '7d', '2c', 'Qh'],
    seats: [
      seat(0, {
        cards: ['Ah', 'Kd'],
        nod: 's1',
        stance: 'in',
        hand: hv(3_200_000, 'two-pair', 'Two pair, kings and sevens', ['Kh', 'Kd', '7s', '7d', 'Ah']),
      }),
      seat(1, { cards: ['7h', 'Qs'], stance: 'in', hand: FULL_HOUSE, champion: true }),
      seat(2, {
        cards: ['5c', '3d'],
        nod: 's1',
        stance: 'out',
        hand: hv(2_000_000, 'pair', 'Pair of sevens', ['7s', '7d', 'Kh', 'Qh', '5c']),
      }),
      seat(3, {
        cards: ['Ts', 'Jc'],
        nod: 's0',
        stance: 'in',
        hand: hv(2_100_000, 'pair', 'Pair of sevens', ['7s', '7d', 'Kh', 'Qh', 'Jc']),
      }),
    ],
    house: { cards: ['Kc', '9c', '4h'], hand: HOUSE_TWO_PAIR },
    result: {
      outcome: 'crew',
      moved: 3,
      ins: ['s0', 's1', 's3'],
      crewBest: FULL_HOUSE,
      houseBest: HOUSE_TWO_PAIR,
      crewChampions: ['s1'],
      couldHave: ['s0', 's1'],
    },
    history: [
      { hand: 1, outcome: 'crew', moved: 3, ins: 3, crewBestName: 'Flush, ace high', houseBestName: 'Two pair, jacks and fours', carrier: 'Mio', carrierNods: 2 },
      { hand: 2, outcome: 'house', moved: -2, ins: 2, crewBestName: 'Pair of nines', houseBestName: 'Trip queens', carrier: null, carrierNods: 0 },
      { hand: 3, outcome: 'crew', moved: 3, ins: 3, crewBestName: 'Full house, sevens full of queens', houseBestName: 'Two pair, kings and sevens', carrier: 'Mio', carrierNods: 2 },
    ],
    ready: ['s1'],
  },

  over: {
    ...base,
    phase: 'over',
    hand: 7,
    meter: 12,
    verdict: 'clean',
    seats: [seat(0, { cards: [] }), seat(1, { cards: [] }), seat(2, { cards: [] }), seat(3, { cards: [] })],
    history: [
      { hand: 1, outcome: 'crew', moved: 3, ins: 3, crewBestName: 'Flush, ace high', houseBestName: 'Two pair, jacks and fours', carrier: 'Mio', carrierNods: 2 },
      { hand: 2, outcome: 'house', moved: -2, ins: 2, crewBestName: 'Pair of nines', houseBestName: 'Trip queens', carrier: null, carrierNods: 0 },
      { hand: 3, outcome: 'crew', moved: 3, ins: 3, crewBestName: 'Full house, sevens full of queens', houseBestName: 'Two pair, kings and sevens', carrier: 'Mio', carrierNods: 2 },
      { hand: 4, outcome: 'tie', moved: 0, ins: 2, crewBestName: 'Straight, ten high', houseBestName: 'Straight, ten high', carrier: 'Ren', carrierNods: 1 },
      { hand: 5, outcome: 'walked', moved: 0, ins: 0, crewBestName: null, houseBestName: 'Pair of jacks', carrier: null, carrierNods: 0 },
      { hand: 6, outcome: 'crew', moved: 4, ins: 4, crewBestName: 'Trip aces', houseBestName: 'Pair of fours', carrier: 'Karthik', carrierNods: 3 },
      { hand: 7, outcome: 'crew', moved: 4, ins: 4, crewBestName: 'Straight, queen high', houseBestName: 'Two pair, aces and nines', carrier: 'Daichi', carrierNods: 0 },
    ],
  },
};

// Older names, kept so bookmarked screenshots and scripts still land somewhere sensible.
FIXTURES.preflop = FIXTURES.nod!;
FIXTURES.river = FIXTURES.call!;
