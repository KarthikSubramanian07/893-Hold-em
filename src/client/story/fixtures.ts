// Views for the story: small builders on top of the dev fixtures, and one
// scripted night the lab steps through. Tests build their own edge cases from
// the same pieces.

import type { Card, GameView, HandResult, HandValue, HistoryEntry, SeatView, Slot, Stance } from '../../engine/types';
import { FIXTURES } from '../dev/fixtures';

export const hv = (score: number, category: HandValue['category'], name: string, best: Card[]): HandValue => ({
  score,
  category,
  name,
  best,
});

/** A copy of a dev fixture with overrides; seats and house are deep enough copies to mutate. */
export function fixture(name: keyof typeof FIXTURES, over: Partial<GameView> = {}): GameView {
  return { ...structuredClone(FIXTURES[name]!), ...over };
}

export function seatOver(view: GameView, id: string, over: Partial<SeatView>): GameView {
  return { ...view, seats: view.seats.map((s) => (s.id === id ? { ...s, ...over } : s)) };
}

const KING_HIGH = hv(1, 'high', 'King high', ['Kh', '9c', '7d', '5s', '2c']);

export function withResult(view: GameView, result: Partial<HandResult>): GameView {
  const base: HandResult = view.result ?? { outcome: 'crew', moved: 0, ins: [], crewBest: null, houseBest: KING_HIGH, crewChampions: [], couldHave: [] };
  return { ...view, phase: 'showdown', result: { ...base, ...result } };
}

export const entry = (hand: number, outcome: HistoryEntry['outcome'], moved: number, ins: number, carrier: string | null = null, carrierNods = 0): HistoryEntry => ({
  hand,
  outcome,
  moved,
  ins,
  // Every In hand plays the House on its own: wins minus losses is the move.
  won: Math.max(0, Math.floor((ins + moved) / 2)),
  lost: Math.max(0, ins - Math.floor((ins + moved) / 2)),
  crewBestName: outcome === 'walked' ? null : 'Pair of nines',
  houseBestName: 'King high',
  carrier,
  carrierNods,
});

export interface Step {
  label: string;
  view: GameView;
}

/**
 * One night at Kabukichō, from an empty lobby to a narrow clean getaway: two
 * regulars sit down, the whole crew nods at one seat and it carries an 8-9-3,
 * a teammate sits out holding the winner, the marker slides to one step from
 * the sirens while your own flush turns over unseen, then everyone goes In
 * and the crew climbs back out the door.
 */
export function scriptedNight(): Step[] {
  const base = fixture('lobby');
  const lobby0 = fixture('lobby', { code: 'R8N4Q', config: { difficulty: 'kabukicho', timer: 30 }, seats: base.seats.slice(0, 2), door: 7, sirens: 5 });
  const lobby1 = { ...lobby0, seats: [...lobby0.seats, { ...base.seats[2]!, id: 's2', name: 'Sumi', avatar: 'tora' as const, bot: true }], door: 9, sirens: 6 };
  const lobby2 = { ...lobby1, seats: [...lobby1.seats, { ...lobby1.seats[2]!, id: 's3', name: 'Taka', avatar: 'karasu' as const }], door: 9, sirens: 6 };

  type Seat = { cards?: Slot[]; nod?: string | null; stance?: Stance | null; hand?: HandValue; champion?: boolean; locked?: boolean };
  const seats = (spec: Seat[] = [], open = false): SeatView[] =>
    lobby2.seats.map((s, i) => {
      const o = spec[i] ?? {};
      const cards = o.cards ?? ['back', 'back'];
      return {
        ...s,
        // During a hand you see the two beside you (Mio and Taka), never
        // your own, and not Sumi across the table.
        cards: !open && (i === 0 || i === 2) ? ['back', 'back'] : cards,
        inSight: i === 1 || i === 3,
        locked: o.locked ?? false,
        nod: o.nod ?? null,
        stance: o.stance ?? null,
        hand: open ? (o.hand ?? KING_HIGH) : null,
        champion: o.champion ?? false,
      };
    });

  const night = (over: Partial<GameView>): GameView => ({
    ...lobby2,
    phase: 'nod',
    house: { cards: ['Kc', 'back'], hand: null },
    board: ['9h', '3s', 'Td', 'Jc', null],
    deadline: null,
    ...over,
  });

  const show = (hand: number, meter: number, history: HistoryEntry[], spec: Seat[], result: Partial<HandResult>, board: Slot[], house: Slot[]): GameView =>
    withResult(night({ hand, meter, history, board, phase: 'showdown', house: { cards: house, hand: result.houseBest ?? KING_HIGH }, seats: seats(spec, true) }), result);

  // Hand 1: Mio and Taka, the two who can see Sumi, both nod at her; Sumi
  // wins with an eight-nine-three, and the two who went In with her win too.
  const holes1: Slot[][] = [['Ah', 'Kd'], ['7h', '5s'], ['8c', '9d'], ['Qs', '4c']];
  const h1 = night({ hand: 1, seats: seats(holes1.map((cards) => ({ cards }))) });
  const h1call = night({
    hand: 1,
    phase: 'call',
    board: ['9h', '3s', 'Td', 'Jc', '2h'],
    seats: seats(holes1.map((cards, i) => ({ cards, nod: i === 1 || i === 3 ? 's2' : null }))),
  });
  const sumiPair = hv(2_900_000, 'pair', 'Pair of nines', ['9d', '9h', 'Jc', 'Td', '8c']);
  const hist1 = [entry(1, 'crew', 3, 3, 'Sumi', 2)];
  const h1sd = show(
    1,
    3,
    hist1,
    holes1.map((cards, i) => ({ cards, nod: i === 1 || i === 3 ? 's2' : null, stance: i === 1 ? 'out' : 'in', champion: i === 2, hand: i === 2 ? sumiPair : undefined })),
    { outcome: 'crew', moved: 3, ins: ['s0', 's2', 's3'], crewBest: sumiPair, crewChampions: ['s0', 's2', 's3'], couldHave: ['s0', 's2', 's3'] },
    ['9h', '3s', 'Td', 'Jc', '2h'],
    ['Kc', '6d'],
  );

  // Hand 2: nobody nods; Mio sits out holding the winner; the House takes four steps.
  const holes2: Slot[][] = [['Qd', 'Qc'], ['Ks', 'Kd'], ['Td', '9s'], ['Js', 'Jh']];
  const h2 = night({ hand: 2, meter: 3, history: hist1, seats: seats(holes2.map((cards) => ({ cards }))) });
  const h2call = night({ hand: 2, meter: 3, history: hist1, phase: 'call', board: ['Kh', '6c', '2d', 'As', '8s'], seats: seats(holes2.map((cards) => ({ cards }))) });
  const mioTrips = hv(4_200_000, 'trips', 'Trip kings', ['Ks', 'Kd', 'Kh', 'As', '8s']);
  const houseTwoPair = hv(3_600_000, 'two-pair', 'Two pair, aces and sixes', ['Ac', 'As', '6h', '6c', 'Kh']);
  const hist2 = [...hist1, entry(2, 'house', -3, 3)];
  const h2sd = show(
    2,
    0,
    hist2,
    holes2.map((cards, i) => ({ cards, stance: i === 1 ? 'out' : 'in', hand: i === 1 ? mioTrips : undefined })),
    { outcome: 'house', moved: -3, ins: ['s0', 's2', 's3'], crewBest: hv(2_500_000, 'pair', 'Pair of queens', ['Qd', 'Qc', 'As', 'Kh', '8s']), houseBest: houseTwoPair, couldHave: ['s1'] },
    ['Kh', '6c', '2d', 'As', '8s'],
    ['Ac', '6h'],
  );

  // Hand 3: the House again, four In, and the marker one step from the sirens. You held a flush.
  const myFlush = hv(6_100_000, 'flush', 'Flush, ace high', ['Ah', 'Qh', '9h', '6h', '2h']);
  const hist3 = [...hist2, entry(3, 'house', -4, 4)];
  const h3 = night({ hand: 3, meter: 0, history: hist2, seats: seats([{}, { cards: ['7d', '7s'] }, { cards: ['5c', '5d'] }, { cards: ['Tc', '9c'] }]) });
  const h3sd = show(
    3,
    -4,
    hist3,
    [{ cards: ['Ah', 'Qh'], stance: 'in', hand: myFlush }, { cards: ['7d', '7s'], stance: 'in' }, { cards: ['5c', '5d'], stance: 'in' }, { cards: ['Tc', '9c'], stance: 'in' }],
    { outcome: 'house', moved: -4, ins: ['s0', 's1', 's2', 's3'], crewBest: myFlush, houseBest: hv(7_200_000, 'full-house', 'Full house, nines full of sixes', ['9h', '9s', '9d', '6h', '6s']), couldHave: [] },
    ['9h', '6h', '2h', '9s', '6s'],
    ['9d', 'Kc'],
  );

  // Hand 4: one more loss puts the marker a step from the sirens.
  const hist4 = [...hist3, entry(4, 'house', -1, 1)];
  const h4sd = show(
    4,
    -5,
    hist4,
    [{ stance: 'out' }, { stance: 'in', cards: ['4c', '2s'] }, { stance: 'out' }, { stance: 'out' }],
    { outcome: 'house', moved: -1, ins: ['s1'], crewBest: hv(2_000_000, 'pair', 'Pair of fours', ['4c', '4d', 'Kh', 'Jd', '9s']), couldHave: [] },
    ['4d', 'Kh', 'Jd', '9s', '7c'],
    ['Ks', 'Qd'],
  );

  // Hand 5: everyone In, and it holds.
  const hist5 = [...hist4, entry(5, 'crew', 4, 4, 'Mio', 2)];
  const mioStraight = hv(5_000_900, 'straight', 'Straight, nine high', ['9c', '8d', '7h', '6s', '5c']);
  const h5sd = show(
    5,
    -1,
    hist5,
    [{ stance: 'in', nod: 's1' }, { stance: 'in', champion: true, hand: mioStraight, cards: ['9c', '8d'] }, { stance: 'in', nod: 's1' }, { stance: 'in', nod: 's0' }],
    { outcome: 'crew', moved: 4, ins: ['s0', 's1', 's2', 's3'], crewBest: mioStraight, crewChampions: ['s0', 's1', 's2', 's3'], couldHave: ['s0', 's1', 's2', 's3'] },
    ['7h', '6s', '5c', 'Kd', '2c'],
    ['Kc', '7d'],
  );

  // Hand 6: Taka goes In with no nods and carries it.
  const hist6 = [...hist5, entry(6, 'crew', 4, 4, 'Taka', 0)];
  const takaTrips = hv(4_100_000, 'trips', 'Trip jacks', ['Jh', 'Js', 'Jd', 'Ad', '9c']);
  const h6sd = show(
    6,
    3,
    hist6,
    [{ stance: 'in', nod: 's1' }, { stance: 'in', nod: 's2' }, { stance: 'in', nod: 's1' }, { stance: 'in', champion: true, hand: takaTrips, cards: ['Jh', 'Js'] }],
    { outcome: 'crew', moved: 4, ins: ['s0', 's1', 's2', 's3'], crewBest: takaTrips, crewChampions: ['s0', 's1', 's2', 's3'], couldHave: ['s0', 's1', 's2', 's3'] },
    ['Jd', 'Ad', '9c', '5s', '3h'],
    ['Ac', 'Tc'],
  );

  // Hand 7: four steps more, and out the door.
  const hist7 = [...hist6, entry(7, 'crew', 4, 4, 'Karthik', 1)];
  const h7 = night({ hand: 7, meter: 3, history: hist6, seats: seats([{}, { cards: ['3c', '3d'] }, { cards: ['Ah', '2d'] }, { cards: ['Kd', 'Qd'] }]) });
  const h7sd = show(
    7,
    7,
    hist7,
    [{ stance: 'in', champion: true, cards: ['Td', 'Tc'], hand: hv(4_000_000, 'trips', 'Trip tens', ['Td', 'Tc', 'Th', 'Ks', '8s']) }, { stance: 'in', nod: 's0' }, { stance: 'in' }, { stance: 'in' }],
    { outcome: 'crew', moved: 4, ins: ['s0', 's1', 's2', 's3'], crewBest: hv(4_000_000, 'trips', 'Trip tens', ['Td', 'Tc', 'Th', 'Ks', '8s']), crewChampions: ['s0', 's1', 's2', 's3'], couldHave: ['s0', 's1', 's2', 's3'] },
    ['Th', 'Ks', '8s', '4c', '2d'],
    ['Kc', '9d'],
  );
  // Hand 8 (off screen): two more steps, and the marker reaches the door at 9.
  const over: GameView = { ...h7sd, phase: 'over', hand: 8, meter: 9, verdict: 'clean', history: [...hist7, entry(8, 'crew', 2, 2, 'Mio', 1)] };

  return [
    { label: 'Lobby: you arrive', view: lobby0 },
    { label: 'Lobby: Sumi sits down', view: lobby1 },
    { label: 'Lobby: Taka takes the stool by the door', view: lobby2 },
    { label: 'Hand 1: the turn, nod at a neighbour', view: h1 },
    { label: 'Hand 1: both of Sumi\'s neighbours nodded at her', view: h1call },
    { label: 'Hand 1: Sumi wins with an eight-nine-three', view: h1sd },
    { label: 'Hand 2: the turn', view: h2 },
    { label: 'Hand 2: not one nod', view: h2call },
    { label: 'Hand 2: Mio sat out with trip kings', view: h2sd },
    { label: 'Hand 3: the turn', view: h3 },
    { label: 'Hand 3: your flush, unseen, loses anyway', view: h3sd },
    { label: 'Hand 4: one step from the sirens', view: h4sd },
    { label: 'Hand 5: everyone In, and it holds', view: h5sd },
    { label: 'Hand 6: Taka, no nods, wins it', view: h6sd },
    { label: 'Hand 7: the turn', view: h7 },
    { label: 'Hand 7: you win it', view: h7sd },
    { label: 'Over: a clean getaway, after a close shave', view: over },
  ];
}
