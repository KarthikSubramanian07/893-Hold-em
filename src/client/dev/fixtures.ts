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
    active: true,
    stake: 1,
    locked: false,
    calls: [null, null, null, null],
    hand: null,
    champion: false,
    watcher: Math.floor(i / 2),
    ...over,
  };
}

const base: GameView = {
  code: 'K7QX2',
  phase: 'lobby',
  config: { difficulty: 'kabukicho', timer: 30 },
  you: 's0',
  seats: [],
  house: [],
  board: [null, null, null, null, null],
  street: 0,
  night: 1,
  hand: 0,
  hands: 6,
  take: 0,
  heat: 0,
  target: 20,
  heatLimit: 8,
  rule: null,
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

export const FIXTURES: Record<string, GameView> = {
  lobby: {
    ...base,
    seats: [seat(0, { cards: [] }), seat(1, { cards: [] }), seat(3, { cards: [], bot: true })],
  },

  preflop: {
    ...base,
    phase: 'call',
    hand: 1,
    seats: [
      seat(0, { cards: ['Ah', 'Kd'] }),
      seat(1, { locked: true }),
      seat(2),
      seat(3, { locked: true }),
    ],
    house: [{ cards: ['back', 'back'], hand: null, champion: false }, { cards: ['back', 'back'], hand: null, champion: false }],
    deadline: NOW + 22_000,
  },

  river: {
    ...base,
    phase: 'call',
    hand: 3,
    street: 3,
    take: 7,
    heat: 3,
    rule: 'kagami',
    board: ['Kh', '7s', '7d', '2c', 'Qh'],
    seats: [
      seat(0, { cards: ['Ah', 'Kd'], stake: 2, calls: ['stay', 'raise', 'stay', null] }),
      seat(1, { stake: 3, locked: true, calls: ['raise', 'raise', 'stay', null] }),
      seat(2, { active: false, stake: 1, calls: ['stay', 'fold', null, null] }),
      seat(3, { stake: 1, locked: true, calls: ['stay', 'stay', 'stay', null] }),
      seat(4, { stake: 1, calls: ['stay', 'stay', 'stay', null] }),
    ],
    house: [
      { cards: ['9c', 'back'], hand: null, champion: false },
      { cards: ['Js', 'back'], hand: null, champion: false },
      { cards: ['4h', 'back'], hand: null, champion: false },
    ],
    history: [
      { hand: 1, rule: null, outcome: 'crew', take: 4, heat: 0, crewBestName: 'Flush, ace high', houseBestName: 'Two pair, jacks and fours' },
      { hand: 2, rule: 'oni', outcome: 'house', take: 0, heat: 3, crewBestName: 'Pair of nines', houseBestName: 'Trip queens' },
    ],
    deadline: NOW + 14_000,
  },

  showdown: {
    ...base,
    phase: 'showdown',
    hand: 3,
    street: 3,
    take: 13,
    heat: 3,
    rule: 'kagami',
    board: ['Kh', '7s', '7d', '2c', 'Qh'],
    seats: [
      seat(0, {
        cards: ['Ah', 'Kd'],
        stake: 2,
        calls: ['stay', 'raise', 'stay', 'stay'],
        hand: hv(3_000_000, 'two-pair', 'Two pair, kings and sevens', ['Kh', 'Kd', '7s', '7d', 'Ah']),
        champion: false,
      }),
      seat(1, {
        cards: ['7h', 'Qs'],
        stake: 3,
        calls: ['raise', 'raise', 'stay', 'stay'],
        hand: hv(7_000_000, 'full-house', 'Full house, sevens full of queens', ['7h', '7s', '7d', 'Qs', 'Qh']),
        champion: true,
      }),
      seat(2, {
        cards: ['5c', '3d'],
        active: false,
        calls: ['stay', 'fold', null, null],
        hand: hv(2_000_000, 'pair', 'Pair of sevens', ['7s', '7d', 'Kh', 'Qh', '5c']),
      }),
      seat(3, {
        cards: ['Ts', 'Jc'],
        calls: ['stay', 'stay', 'stay', 'stay'],
        hand: hv(2_100_000, 'pair', 'Pair of sevens', ['7s', '7d', 'Kh', 'Qh', 'Jc']),
      }),
    ],
    house: [
      { cards: ['9c', '9d'], hand: hv(3_100_000, 'two-pair', 'Two pair, nines and sevens', ['9c', '9d', '7s', '7d', 'Kh']), champion: false },
      { cards: ['Js', 'Kc'], hand: hv(3_200_000, 'two-pair', 'Two pair, kings and sevens', ['Kh', 'Kc', '7s', '7d', 'Qh']), champion: true },
    ],
    result: {
      outcome: 'crew',
      take: 6,
      heat: 1,
      crewBest: hv(7_000_000, 'full-house', 'Full house, sevens full of queens', ['7h', '7s', '7d', 'Qs', 'Qh']),
      houseBest: hv(3_200_000, 'two-pair', 'Two pair, kings and sevens', ['Kh', 'Kc', '7s', '7d', 'Qh']),
      crewChampions: ['s1'],
      houseChampions: [1],
      burned: ['s3'],
    },
    ready: ['s1'],
  },

  over: {
    ...base,
    phase: 'over',
    hand: 6,
    take: 24,
    heat: 5,
    verdict: 'clean',
    seats: [seat(0, { cards: [] }), seat(1, { cards: [] }), seat(2, { cards: [] }), seat(3, { cards: [] })],
    history: [
      { hand: 1, rule: null, outcome: 'crew', take: 4, heat: 0, crewBestName: 'Flush, ace high', houseBestName: 'Two pair, jacks and fours' },
      { hand: 2, rule: 'oni', outcome: 'house', take: 0, heat: 3, crewBestName: 'Pair of nines', houseBestName: 'Trip queens' },
      { hand: 3, rule: 'kagami', outcome: 'crew', take: 6, heat: 0, crewBestName: 'Full house, sevens full of queens', houseBestName: 'Two pair, kings and sevens' },
      { hand: 4, rule: 'hebi', outcome: 'tie', take: 0, heat: 0, crewBestName: 'Straight, ten high', houseBestName: 'Straight, ten high' },
      { hand: 5, rule: 'homura', outcome: 'crew', take: 10, heat: 0, crewBestName: 'Trip aces', houseBestName: 'Pair of jacks' },
      { hand: 6, rule: 'kiri', outcome: 'house', take: 0, heat: 2, crewBestName: 'Ace high', houseBestName: 'Pair of fours' },
    ],
  },
};
