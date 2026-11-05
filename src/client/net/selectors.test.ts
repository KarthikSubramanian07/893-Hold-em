import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../dev/fixtures';
import {
  amHost,
  canReact,
  canStart,
  dockMode,
  handPhrase,
  listNames,
  lockedSeats,
  meterProgress,
  movedLine,
  myNod,
  mySeat,
  myStance,
  nodPairs,
  nodsOn,
  nodsRevealed,
  OUTCOME_LINE,
  readyQuorum,
  revealLine,
  signed,
  stillDeciding,
  teammates,
  VERDICT_LINE,
} from './selectors';

const f = (name: string) => structuredClone(FIXTURES[name]!);

describe('selectors', () => {
  it('finds your seat and host status', () => {
    const v = f('lobby');
    expect(mySeat(v)?.id).toBe('s0');
    expect(amHost(v)).toBe(true);
    expect(mySeat({ ...v, you: null })).toBeNull();
    expect(teammates(v).map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('lists who is locked and who is still deciding, excluding you', () => {
    const v = f('nod');
    expect(lockedSeats(v)).toEqual(['s1', 's3']);
    expect(stillDeciding(v).map((s) => s.id)).toEqual(['s2']);
    expect(stillDeciding(f('lobby'))).toEqual([]);
    expect(lockedSeats(f('showdown'))).toEqual([]);
  });

  it('picks the dock mode for each phase', () => {
    const nod = f('nod');
    expect(dockMode(nod, false)).toBe('nod');
    expect(dockMode(nod, true)).toBe('nodded');
    const call = f('call');
    expect(dockMode(call, false)).toBe('call');
    call.seats[0]!.locked = true;
    expect(dockMode(call, false)).toBe('called');
    expect(dockMode({ ...call, you: null }, false)).toBe('spectator');
    expect(dockMode(f('showdown'), false)).toBe('none');
    expect(dockMode(f('lobby'), false)).toBe('none');
  });

  it('reads your nod: undecided, passed, or a seat', () => {
    const v = f('nod');
    expect(myNod(v)).toBeUndefined();
    v.seats[0]!.locked = true;
    expect(myNod(v)).toBeNull();
    v.seats[0]!.nod = 's2';
    expect(myNod(v)).toBe('s2');
    expect(myNod(f('call'))).toBe('s1');
    const passed = f('call');
    passed.seats[0]!.nod = null;
    expect(myNod(passed)).toBeNull();
    expect(myNod(f('lobby'))).toBeUndefined();
  });

  it('counts nods once they are on the table', () => {
    const v = f('call');
    expect(nodsRevealed(v)).toBe(true);
    expect(nodsRevealed(f('nod'))).toBe(false);
    expect(nodsOn(v, 's1')).toBe(2);
    expect(nodsOn(v, 's0')).toBe(1);
    expect(nodsOn(v, 's2')).toBe(0);
    expect(nodPairs(v)).toEqual([
      { from: 's0', to: 's1' },
      { from: 's2', to: 's1' },
      { from: 's3', to: 's0' },
    ]);
  });

  it('reads your stance', () => {
    expect(myStance(f('call'))).toBeNull();
    expect(myStance(f('showdown'))).toBe('in');
  });

  it('turns the marker into progress along the track', () => {
    const p = meterProgress({ meter: 0, door: 11, sirens: 8 });
    expect(p.span).toBe(19);
    expect(p.toDoor).toBe(11);
    expect(p.toSirens).toBe(8);
    expect(p.fraction).toBeCloseTo(8 / 19);
    expect(p.danger).toBeLessThan(0.2);
    const edge = meterProgress({ meter: -7, door: 11, sirens: 8 });
    expect(edge.toSirens).toBe(1);
    expect(edge.danger).toBe(1);
    expect(meterProgress({ meter: 99, door: 5, sirens: 5 }).fraction).toBe(1);
  });

  it('counts the ready quorum among connected humans', () => {
    const v = f('showdown');
    // s0, s1, s2 are human; s3 is a bot.
    expect(readyQuorum(v)).toEqual({ ready: 1, needed: 3 });
    v.seats[2]!.connected = false;
    expect(readyQuorum(v)).toEqual({ ready: 1, needed: 2 });
  });

  it('gates reactions and start', () => {
    expect(canReact(f('lobby'))).toBe(true);
    expect(canReact(f('nod'))).toBe(false);
    expect(canStart(f('lobby'))).toBe(true);
    const solo = f('lobby');
    solo.seats = solo.seats.slice(0, 1);
    expect(canStart(solo)).toBe(false);
    const guest = f('lobby');
    guest.you = 's1';
    expect(canStart(guest)).toBe(false);
  });
});

describe('wording', () => {
  it('never reuses the end-of-night words for a single hand', () => {
    expect(Object.values(OUTCOME_LINE)).not.toContain(VERDICT_LINE.clean);
    expect(VERDICT_LINE).toEqual({ clean: 'Clean getaway', raid: 'Raid', dawn: 'Last orders' });
  });

  it('says how the marker moved in plain words', () => {
    expect(movedLine(3)).toBe('The marker moves 3 steps toward the door.');
    expect(movedLine(-1)).toBe('The marker moves one step toward the sirens.');
    expect(movedLine(0)).toBe('The marker stays put.');
    expect(signed(2)).toBe('+2');
    expect(signed(-2)).toBe('−2');
    expect(signed(0)).toBe('±0');
  });

  it('lists names like a person would', () => {
    expect(listNames(['Mio'])).toBe('Mio');
    expect(listNames(['Mio', 'Ren'])).toBe('Mio and Ren');
    expect(listNames(['Mio', 'Ren', 'Sora'])).toBe('Mio, Ren, and Sora');
  });

  it('reads a hand mid-sentence', () => {
    const sd = FIXTURES.showdown!;
    expect(handPhrase(sd.seats[1]!.hand!)).toBe('a full house');
    expect(handPhrase(sd.seats[2]!.hand!)).toBe('a pair of sevens');
    expect(handPhrase(sd.seats[0]!.hand!)).toBe('two pair, kings and sevens');
  });
});

describe('revealLine', () => {
  const sd = FIXTURES.showdown!;
  const as = (you: string | null) => ({ ...structuredClone(sd), you });

  it('celebrates a hand that beat the House', () => {
    expect(revealLine(as('s1'))).toBe('You had a full house, and it beat the House.');
  });

  it('says so when you went In and lost', () => {
    expect(revealLine(as('s3'))).toBe('You had a pair of sevens. The House had better.');
  });

  it('names a plain hand plainly', () => {
    const v = as('s3');
    v.seats[3]!.stance = 'out';
    expect(revealLine(v)).toBe('You had a pair of sevens.');
  });

  it('tells you when sitting out cost the crew', () => {
    const v = as('s2');
    v.result!.couldHave = ['s1', 's2'];
    expect(revealLine(v)).toBe('You had a pair of sevens the whole time. It would have beaten the House.');
  });

  it('makes a fuss over a monster you never saw', () => {
    const v = as('s2');
    v.seats[2]!.hand = { ...sd.seats[2]!.hand!, category: 'flush', name: 'Flush, ace high' };
    expect(revealLine(v)).toBe('You had a flush the whole time.');
  });

  it('stays quiet for spectators and outside the showdown', () => {
    expect(revealLine(as(null))).toBeNull();
    expect(revealLine(f('lobby'))).toBeNull();
  });
});
