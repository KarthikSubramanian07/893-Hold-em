import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../dev/fixtures';
import { amHost, callHint, canReact, canStart, dockMode, myCall, mySeat, OUTCOME_LINE, readyQuorum, stillDeciding, yourHand } from './selectors';

const f = (name: string) => structuredClone(FIXTURES[name]!);

describe('selectors', () => {
  it('finds your seat and host status', () => {
    const v = f('lobby');
    expect(mySeat(v)?.id).toBe('s0');
    expect(amHost(v)).toBe(true);
    expect(mySeat({ ...v, you: null })).toBeNull();
  });

  it('lists who is still deciding, excluding you', () => {
    const v = f('preflop');
    expect(stillDeciding(v).map((s) => s.id)).toEqual(['s2']);
    expect(stillDeciding(f('lobby'))).toEqual([]);
  });

  it('picks the dock mode', () => {
    const v = f('preflop');
    expect(dockMode(v, false)).toBe('decide');
    expect(dockMode(v, true)).toBe('locked');
    expect(dockMode({ ...v, you: null }, false)).toBe('spectator');
    v.seats[0]!.active = false;
    expect(dockMode(v, false)).toBe('folded');
    expect(dockMode(f('showdown'), false)).toBe('none');
  });

  it('reads your call for the current street', () => {
    const v = f('river');
    expect(myCall(v)).toBeNull();
    v.seats[0]!.calls[3] = 'raise';
    expect(myCall(v)).toBe('raise');
    v.seats[0]!.calls[3] = 'hidden';
    expect(myCall(v)).toBeNull();
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
    expect(canReact(f('preflop'))).toBe(false);
    expect(canStart(f('lobby'))).toBe(true);
    const solo = f('lobby');
    solo.seats = solo.seats.slice(0, 1);
    expect(canStart(solo)).toBe(false);
    const guest = f('lobby');
    guest.you = 's1';
    expect(canStart(guest)).toBe(false);
  });
});

describe('callHint', () => {
  it('says what each call does to your bet', () => {
    expect(callHint('fold', 1)).toBe('Sit this one out');
    expect(callHint('stay', 2)).toBe('Keep betting 2');
    expect(callHint('raise', 1)).toBe('Bet 2');
    expect(callHint('raise', 3)).toBe('At the max');
  });
});

describe('showdown wording', () => {
  it('never reuses the end-of-night words for a single hand', () => {
    expect(Object.values(OUTCOME_LINE)).not.toContain('Clean.');
    expect(OUTCOME_LINE.crew).toBe('Paid.');
  });
});

describe('yourHand', () => {
  const sd = FIXTURES.showdown!;
  const as = (you: string, over: Partial<typeof sd> = {}) => ({ ...sd, you, ...over });

  it('tells a paid player who was not seen', () => {
    // s0 stayed in at stake 2, the crew won, and s0 is not in burned.
    expect(yourHand(as('s0'))).toBe(
      'Your bet of 2 was paid, and your two pair, kings and sevens held against the mask watching you: no heat.',
    );
  });

  it('tells a paid player who was seen', () => {
    // s3 is in burned in the fixture.
    expect(yourHand(as('s3'))).toBe(
      'Your bet of 1 was paid, and the mask watching you beat your pair of sevens: +1 heat.',
    );
  });

  it('doubles both under Blaze', () => {
    expect(yourHand(as('s3', { rule: 'homura' }))).toContain('Your bet of 2 was paid');
    expect(yourHand(as('s3', { rule: 'homura' }))).toContain('+2 heat');
  });

  it('reassures a player who folded', () => {
    expect(yourHand(as('s2'))).toBe('You folded, so this hand cost you nothing.');
  });

  it('says when the bet was not paid', () => {
    const lost = as('s0', { result: { ...sd.result!, outcome: 'house', burned: ['s0'] } });
    expect(yourHand(lost)).toBe('Your bet was not paid, and the mask watching you beat your two pair, kings and sevens: +2 heat.');
  });

  it('stays quiet for spectators and outside the showdown', () => {
    expect(yourHand(as(null as unknown as string))).toBeNull();
    expect(yourHand({ ...FIXTURES.lobby!, you: 's0' })).toBeNull();
  });
});

