// Views for the story: small builders on top of the dev fixtures, and one
// scripted night the lab steps through. Tests build their own edge cases from
// the same pieces.

import type { Card, GameView, HandResult, HandValue, HistoryEntry, SeatView, Slot } from '../../engine/types';
import { FIXTURES } from '../dev/fixtures';

export const hv = (score: number, category: HandValue['category'], name: string, best: Card[]): HandValue => ({
  score,
  category,
  name,
  best,
});

/** A copy of a dev fixture with overrides; seats and house are deep enough copies to mutate. */
export function fixture(name: keyof typeof FIXTURES, over: Partial<GameView> = {}): GameView {
  const base = FIXTURES[name]!;
  return {
    ...structuredClone(base),
    ...over,
  };
}

export function seatOver(view: GameView, id: string, over: Partial<SeatView>): GameView {
  return { ...view, seats: view.seats.map((s) => (s.id === id ? { ...s, ...over } : s)) };
}

export function withResult(view: GameView, result: Partial<HandResult> & { burned?: string[] }): GameView {
  const base = view.result ?? { outcome: 'crew', take: 0, heat: 0, crewBest: null, houseBest: hv(1, 'high', 'King high', ['Kh', '9c', '7d', '5s', '2c']) };
  return { ...view, phase: 'showdown', result: { ...base, ...result } as HandResult };
}

const H = (hand: number, outcome: HistoryEntry['outcome'], take: number, heat: number): HistoryEntry => ({
  hand,
  rule: null,
  outcome,
  take,
  heat,
  crewBestName: 'Pair of nines',
  houseBestName: 'King high',
});

export interface Step {
  label: string;
  view: GameView;
}

/**
 * One night at Kabukichō, from an empty lobby to a narrow clean getaway: two
 * regulars sit down, an 8-9-3 showdown, the Fox, players seen on a winning
 * hand, the heat climbing to one from the raid, and a quiet champion.
 */
export function scriptedNight(): Step[] {
  const lobby0 = fixture('lobby', { code: 'R8N4Q', seats: fixture('lobby').seats.slice(0, 2) });
  const lobby1 = fixture('lobby', {
    code: 'R8N4Q',
    seats: [...lobby0.seats, { ...fixture('lobby').seats[2]!, id: 's3', name: 'Sumi', bot: true }],
  });
  const lobby2 = { ...lobby1, seats: [...lobby1.seats, { ...lobby1.seats[2]!, id: 's4', name: 'Taka', avatar: 'karasu' as const }] };

  const seats = (cards: Slot[][], over: Partial<SeatView>[] = []): SeatView[] =>
    lobby2.seats.map((s, i) => ({
      ...s,
      cards: cards[i] ?? ['back', 'back'],
      active: true,
      stake: 1,
      locked: false,
      calls: [null, null, null, null],
      hand: null,
      champion: false,
      ...over[i],
    }));

  const house2 = [
    { cards: ['back', 'back'] as GameView['house'][number]['cards'], hand: null, champion: false },
    { cards: ['back', 'back'] as GameView['house'][number]['cards'], hand: null, champion: false },
  ];

  const night = (over: Partial<GameView>): GameView => ({
    ...lobby2,
    phase: 'call',
    target: 20,
    heatLimit: 8,
    house: house2,
    deadline: null,
    ...over,
  });

  const h1 = night({ hand: 1, seats: seats([['Ah', 'Kd']]) });
  const h1sd = night({
    phase: 'showdown',
    hand: 1,
    take: 4,
    board: ['9h', '3s', 'Td', 'Jc', '2h'],
    seats: seats(
      [['Ah', 'Kd'], ['7h', '5s'], ['8c', '8d'], ['Qs', '4c']],
      [
        { hand: hv(1_100_000, 'high', 'Ace high', ['Ah', 'Kd', 'Jc', 'Td', '9h']) },
        { hand: hv(1_000_000, 'high', 'Jack high', ['Jc', 'Td', '9h', '7h', '5s']) },
        { hand: hv(2_800_000, 'pair', 'Pair of eights', ['8c', '8d', 'Jc', 'Td', '9h']), champion: true, calls: ['raise', 'stay', 'stay', 'stay'], stake: 2 },
        { hand: hv(1_050_000, 'high', 'Queen high', ['Qs', 'Jc', 'Td', '9h', '4c']) },
      ],
    ),
    house: [
      { cards: ['Kc', '6d'], hand: hv(1_090_000, 'high', 'King high', ['Kc', 'Jc', 'Td', '9h', '6d']), champion: true },
      { cards: ['5d', '4h'], hand: hv(1_010_000, 'high', 'Jack high', ['Jc', 'Td', '9h', '5d', '4h']), champion: false },
    ],
    result: {
      outcome: 'crew',
      take: 5,
      heat: 0,
      crewBest: hv(2_800_000, 'pair', 'Pair of eights', ['8c', '8d', 'Jc', 'Td', '9h']),
      houseBest: hv(1_090_000, 'high', 'King high', ['Kc', 'Jc', 'Td', '9h', '6d']),
    },
    history: [H(1, 'crew', 5, 0)],
  });

  const h2 = night({ hand: 2, take: 5, rule: 'kitsune', seats: seats([['Qd', 'Qc'], ['back', 'back'], ['back', 'back'], ['Js', 'Jh']]), history: h1sd.history });
  const h2sd = withResult(
    night({
      hand: 2,
      take: 5,
      heat: 4,
      rule: 'kitsune',
      board: ['Ks', 'Kh', '6c', '2d', 'As'],
      seats: seats([['Qd', 'Qc'], ['7d', '2s'], ['Td', '9s'], ['Js', 'Jh']], [{ champion: true, hand: hv(3_500_000, 'two-pair', 'Two pair, kings and queens', ['Ks', 'Kh', 'Qd', 'Qc', 'As']) }]),
      history: [...h1sd.history, H(2, 'house', 0, 4)],
    }),
    { outcome: 'house', take: 0, heat: 4, crewBest: hv(3_500_000, 'two-pair', 'Two pair, kings and queens', ['Ks', 'Kh', 'Qd', 'Qc', 'As']), houseBest: hv(4_000_000, 'trips', 'Trip kings', ['Ks', 'Kh', 'Kd', 'As', '6c']) },
  );
  const h3 = night({ hand: 3, take: 5, heat: 4, rule: 'hebi', seats: seats([['6h', '4c']]), history: h2sd.history });
  const h3sd = withResult(
    night({
      hand: 3,
      take: 17,
      heat: 4,
      rule: 'hebi',
      board: ['3h', '7c', 'Kd', '2s', '5h'],
      seats: seats(
        [['6h', '4c'], ['Ad', '4s'], ['Tc', 'Th'], ['6s', '6d']],
        [
          { champion: true, stake: 3, calls: ['raise', 'raise', 'stay', 'stay'], hand: hv(5_000_300, 'straight', 'Straight, seven high', ['7c', '6h', '5h', '4c', '3h']) },
          { stake: 3, hand: hv(5_000_100, 'straight', 'Straight, five high', ['5h', '4s', '3h', '2s', 'Ad']) },
          { stake: 3, hand: hv(2_000_000, 'pair', 'Pair of tens', ['Tc', 'Th', 'Kd', '7c', '5h']) },
          { stake: 3, hand: hv(2_000_000, 'pair', 'Pair of sixes', ['6s', '6d', 'Kd', '7c', '5h']) },
        ],
      ),
      history: [...h2sd.history, H(3, 'crew', 12, 0)],
    }),
    { outcome: 'crew', take: 12, heat: 0, crewBest: hv(5_000_300, 'straight', 'Straight, seven high', ['7c', '6h', '5h', '4c', '3h']), houseBest: hv(3_000_000, 'two-pair', 'Two pair, kings and sevens', ['Kd', 'Ks', '7c', '7h', '5h']) },
  );
  const h4 = night({ hand: 4, take: 17, heat: 4, rule: 'homura', seats: seats([['Ts', '9d']]), history: h3sd.history });
  const h4sd = withResult(
    night({
      hand: 4,
      take: 19,
      heat: 6,
      rule: 'homura',
      board: ['Ac', 'Kc', '4d', '4s', 'Jh'],
      seats: seats(
        [['Ts', '9d'], ['Ah', '7s'], ['Qd', 'Jd'], ['2h', '2d']],
        [
          { hand: hv(2_000_000, 'pair', 'Pair of fours', ['4d', '4s', 'Ac', 'Kc', 'Jh']) },
          { champion: true, hand: hv(3_400_000, 'two-pair', 'Two pair, aces and fours', ['Ah', 'Ac', '4d', '4s', 'Kc']) },
          { hand: hv(3_100_000, 'two-pair', 'Two pair, jacks and fours', ['Jd', 'Jh', '4d', '4s', 'Ac']) },
          { hand: hv(3_000_000, 'two-pair', 'Two pair, fours and twos', ['4d', '4s', '2h', '2d', 'Ac']) },
        ],
      ),
      history: [...h3sd.history, H(4, 'crew', 2, 2)],
    }),
    { outcome: 'crew', take: 2, heat: 2, burned: ['s0'], crewBest: hv(3_400_000, 'two-pair', 'Two pair, aces and fours', ['Ah', 'Ac', '4d', '4s', 'Kc']), houseBest: hv(2_500_000, 'pair', 'Pair of fours', ['4d', '4s', 'Ac', 'Kc', 'Jh']) },
  );
  const h5 = night({ hand: 5, take: 19, heat: 6, rule: 'shizuka', seats: seats([['5c', '5d']]), history: h4sd.history });
  const h5sd = withResult(
    night({ hand: 5, take: 23, heat: 7, rule: 'shizuka', board: ['5h', 'Kd', '9s', '7c', '2d'], seats: seats([['5c', '5d']]), history: [...h4sd.history, H(5, 'crew', 4, 1)] }),
    { outcome: 'crew', take: 4, heat: 1, burned: ['s3'], crewBest: hv(4_000_000, 'trips', 'Trip fives', ['5c', '5d', '5h', 'Kd', '9s']), houseBest: hv(2_000_000, 'pair', 'Pair of kings', ['Kd', 'Kh', '9s', '7c', '2d']) },
  );
  const h6 = night({ hand: 6, take: 23, heat: 7, rule: 'kiri', seats: seats([['Kh', '2c']]), history: h5sd.history });
  const h6sd = withResult(
    night({
      hand: 6,
      take: 26,
      heat: 7,
      rule: 'kiri',
      board: ['8d', '9h', 'Tc', '3d', 'Qs'],
      seats: seats(
        [['Kh', '2c'], ['7d', '6s'], ['Ac', 'Qd'], ['4s', '4h']],
        [
          { calls: ['raise', 'stay', 'stay', 'stay'], stake: 2, hand: hv(2_100_000, 'pair', 'Pair of queens', ['Qs', 'Qd', 'Ac', 'Td', '9h']) },
          { champion: true, calls: ['stay', 'stay', 'stay', 'stay'], hand: hv(5_000_200, 'straight', 'Straight, ten high', ['Tc', '9h', '8d', '7d', '6s']) },
          { hand: hv(2_100_000, 'pair', 'Pair of queens', ['Qs', 'Qd', 'Ac', 'Tc', '9h']) },
          { hand: hv(2_050_000, 'pair', 'Pair of fours', ['4s', '4h', 'Qs', 'Tc', '9h']) },
        ],
      ),
      history: [...h5sd.history, H(6, 'crew', 3, 0)],
    }),
    { outcome: 'crew', take: 3, heat: 0, crewBest: hv(5_000_200, 'straight', 'Straight, ten high', ['Tc', '9h', '8d', '7d', '6s']), houseBest: hv(2_000_000, 'pair', 'Pair of queens', ['Qs', 'Qh', 'Kd', 'Tc', '9h']) },
  );
  const over = { ...h6sd, phase: 'over' as const, verdict: 'clean' as const };

  return [
    { label: 'Lobby: you arrive', view: lobby0 },
    { label: 'Lobby: Sumi sits down', view: lobby1 },
    { label: 'Lobby: Taka takes the stool by the door', view: lobby2 },
    { label: 'Hand 1: the night starts', view: h1 },
    { label: 'Hand 1: showdown, eight-nine-three', view: h1sd },
    { label: 'Hand 2: the Fox', view: h2 },
    { label: 'Hand 2: the House takes it, heat to half', view: h2sd },
    { label: 'Hand 3: the Serpent', view: h3 },
    { label: 'Hand 3: a straight under the snake', view: h3sd },
    { label: 'Hand 4: Blaze', view: h4 },
    { label: 'Hand 4: paid, but seen; Taka hears an engine', view: h4sd },
    { label: 'Hand 5: Hush', view: h5 },
    { label: 'Hand 5: the debt covered, one from the raid', view: h5sd },
    { label: 'Hand 6: the last hand, in fog', view: h6 },
    { label: 'Hand 6: the quiet one carries it', view: h6sd },
    { label: 'Over: a clean getaway, barely', view: over },
  ];
}
