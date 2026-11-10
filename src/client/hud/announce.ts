// The table in words, for screen readers. The 3D scene has no words of its
// own, so everything it shows that matters to play (the board, the House's
// face-up card, the hands beside you, the nods, the marker) is said here: once
// as a standing description, and again as a short line each time play moves on.
import type { GameView, SeatView, Slot } from '../../engine/types';
import { cardLabel } from './MiniCard';
import {
  OUTCOME_LINE,
  VERDICT_LINE,
  VERDICT_SUB,
  handPhrase,
  inSight,
  listNames,
  meterProgress,
  movedLine,
  mySeat,
  nodPairs,
  revealLine,
  seatById,
} from '../net/selectors';

export function cardsInWords(slots: Slot[]): string {
  const up = slots.filter((s) => s && s !== 'back');
  return up.length ? listNames(up.map(cardLabel)) : 'nothing yet';
}

function who(view: GameView, id: string): string {
  return id === view.you ? 'you' : (seatById(view, id)?.name ?? 'someone');
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function markerInWords(view: Pick<GameView, 'meter' | 'door' | 'sirens'>): string {
  const p = meterProgress(view);
  return `${p.toDoor} ${p.toDoor === 1 ? 'step' : 'steps'} to the door, ${p.toSirens} to the sirens.`;
}

export function nodsInWords(view: GameView): string {
  const pairs = nodPairs(view);
  if (!pairs.length) return 'Nobody nodded.';
  return pairs.map((p) => `${cap(who(view, p.from))} nodded at ${who(view, p.to)}.`).join(' ');
}

function sightLine(view: GameView): string {
  const beside = inSight(view);
  if (!beside.length) return '';
  const hands = beside.map((s: SeatView, i) => `${i + 1}, ${s.name}: ${cardsInWords(s.cards)}`);
  return `Beside you: ${hands.join('; ')}.`;
}

/** Everything the table shows right now, as one paragraph. */
export function describeTable(view: GameView): string {
  if (view.phase === 'lobby') {
    return `The lobby of table ${view.code}. ${view.seats.length} at the table: ${listNames(view.seats.map((s) => s.name))}.`;
  }
  const parts: string[] = [];
  parts.push(`Hand ${view.hand} of ${view.lastOrders}.`);
  parts.push(`The board: ${cardsInWords(view.board)}.`);
  const house = view.house.cards;
  const hidden = house.filter((c) => c === 'back').length;
  parts.push(`The House shows ${cardsInWords(house)}${hidden ? `, and holds ${hidden} face down` : ''}.`);
  if (view.phase === 'nod' || view.phase === 'call') {
    const sight = sightLine(view);
    if (sight) parts.push(sight);
    if (view.phase === 'call') parts.push(nodsInWords(view));
  }
  if (view.phase === 'showdown' && view.result) {
    parts.push(OUTCOME_LINE[view.result.outcome]);
    const r = revealLine(view);
    if (r) parts.push(r);
  }
  if (view.phase === 'over' && view.verdict) parts.push(`${VERDICT_LINE[view.verdict]}. ${VERDICT_SUB[view.verdict]}`);
  parts.push(`The marker: ${markerInWords(view)}`);
  return parts.join(' ');
}

/** A short line for the change from `prev` to `next`, or null when nothing worth saying happened. */
export function announce(prev: GameView | null, next: GameView): string | null {
  const me = mySeat(next);
  const handChanged = !prev || prev.hand !== next.hand || prev.night !== next.night;
  if (next.phase === 'nod' && (handChanged || prev?.phase !== 'nod')) {
    const parts = [`Hand ${next.hand}. The turn.`, `The board: ${cardsInWords(next.board)}.`];
    parts.push(`The House shows ${cardsInWords(next.house.cards)}.`);
    const sight = sightLine(next);
    if (sight) parts.push(sight);
    if (me) parts.push(inSight(next).length > 1 ? 'Nod with 1 or 2, or pass with P.' : 'Nod with 1, or pass with P.');
    return parts.join(' ');
  }
  if (next.phase === 'call' && prev?.phase !== 'call') {
    const river = next.board[4];
    const parts = ['The nods turned over.', nodsInWords(next)];
    if (river && river !== 'back') parts.push(`The river: ${cardLabel(river)}.`);
    if (me) parts.push('In with I, Out with O.');
    return parts.join(' ');
  }
  if (next.phase === 'showdown' && next.result && (prev?.phase !== 'showdown' || handChanged)) {
    const parts = [`Showdown. ${OUTCOME_LINE[next.result.outcome]}`];
    const r = revealLine(next);
    if (r) parts.push(r);
    parts.push(`The House had ${handPhrase(next.result.houseBest)}.`);
    parts.push(movedLine(next.result.moved), markerInWords(next));
    return parts.join(' ');
  }
  if (next.phase === 'over' && next.verdict && prev?.phase !== 'over') {
    return `The night is over. ${VERDICT_LINE[next.verdict]}. ${VERDICT_SUB[next.verdict]}`;
  }
  return null;
}
