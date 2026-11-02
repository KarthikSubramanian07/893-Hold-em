import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../dev/fixtures';
import { amHost, canReact, canStart, dockMode, myCall, mySeat, readyQuorum, stillDeciding } from './selectors';

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
