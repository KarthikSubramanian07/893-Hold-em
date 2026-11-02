import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../dev/fixtures';
import type { Difficulty, GameView, SeatView } from '../../engine/types';
import { TABLE_MASKS } from '../story/masks';
import { gazeIndex, MASK_TAG, maskIds, seenState, watchedBy, watcherBySeatOrder, watcherMap } from './watch';

const F = (name: string): GameView => structuredClone(FIXTURES[name]!);

describe('watcherBySeatOrder', () => {
  it('pairs seats in order: mask 0 watches seats 0–1, mask 1 seats 2–3', () => {
    expect([0, 1, 2, 3, 4, 5].map((k) => watcherBySeatOrder(k, 3))).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('never points past the last mask, and an odd crew shares the last one', () => {
    expect([0, 1, 2, 3, 4].map((k) => watcherBySeatOrder(k, 3))).toEqual([0, 0, 1, 1, 2]);
    expect(watcherBySeatOrder(5, 2)).toBe(1);
  });

  it("leaves an Oni's extra mask watching nobody", () => {
    // Two crew face one mask; the Oni rule adds a second that never watches.
    const two = [0, 1].map((k) => watcherBySeatOrder(k, 2));
    expect(two).toEqual([0, 0]);
    // Six crew, three masks plus the Oni's.
    const six = [0, 1, 2, 3, 4, 5].map((k) => watcherBySeatOrder(k, 4));
    expect(six).not.toContain(3);
  });

  it('is null with no masks or no seat', () => {
    expect(watcherBySeatOrder(0, 0)).toBeNull();
    expect(watcherBySeatOrder(-1, 3)).toBeNull();
  });
});

describe('watcherMap', () => {
  it("trusts the server's watcher", () => {
    const v = F('river');
    v.seats[4]!.watcher = 0;
    expect(watcherMap(v.seats, v.house.length, v.phase).get('s4')).toBe(0);
  });

  it('falls back to seat order when an older view leaves it out', () => {
    const v = F('river');
    const seats = v.seats.map((s) => {
      const { watcher: _drop, ...rest } = s;
      return rest as SeatView;
    });
    const m = watcherMap(seats, 3, 'call');
    expect([...m.values()]).toEqual([0, 0, 1, 1, 2]);
  });

  it('ignores an out-of-range watcher and says nobody watches in the lobby', () => {
    const v = F('river');
    v.seats[0]!.watcher = 9;
    expect(watcherMap(v.seats, 3, 'call').get('s0')).toBe(0);
    expect([...watcherMap(v.seats, 3, 'lobby').values()].every((w) => w === null)).toBe(true);
  });

  it('groups seats by the mask watching them', () => {
    const v = F('river');
    expect(watchedBy(watcherMap(v.seats, 3, 'call'), 3)).toEqual([['s0', 's1'], ['s2', 's3'], ['s4']]);
  });
});

describe('seenState', () => {
  const v = F('showdown');
  it('marks burned seats seen and the rest still in clear', () => {
    expect(seenState(v.seats[3]!, v, 1)).toBe('seen');
    expect(seenState(v.seats[0]!, v, 0)).toBe('clear');
  });

  it('says nothing for folded seats, before the showdown, or without a watcher', () => {
    expect(seenState(v.seats[2]!, v, 1)).toBeNull();
    expect(seenState(v.seats[3]!, { ...v, phase: 'call' }, 1)).toBeNull();
    expect(seenState(v.seats[3]!, v, null)).toBeNull();
  });

  it('treats a missing burned list as nobody seen', () => {
    const r = { ...v.result! } as Partial<NonNullable<GameView['result']>>;
    delete r.burned;
    expect(seenState(v.seats[3]!, { phase: 'showdown', result: r as GameView['result'] }, 1)).toBe('clear');
  });
});

describe('maskIds', () => {
  it('seats each table in its canonical order', () => {
    expect(maskIds('shitamachi', 3, null)).toEqual(['okame', 'hyottoko', 'ebisu']);
    expect(maskIds('kabukicho', 3, null)).toEqual(['kitsune', 'tengu', 'hannya']);
    expect(maskIds('oyabun', 3, null)).toEqual(['okina', 'hannya', 'kitsune']);
  });

  it('gives the last seat to the Oni under his rule', () => {
    expect(maskIds('kabukicho', 2, 'oni')).toEqual(['kitsune', 'oni']);
    expect(maskIds('oyabun', 4, 'oni')).toEqual(['okina', 'hannya', 'kitsune', 'oni']);
    expect(maskIds('shitamachi', 1, null)).toEqual(['okame']);
  });

  it('tags every mask at a table with a different colour', () => {
    for (const table of Object.keys(TABLE_MASKS) as Difficulty[]) {
      const colours = maskIds(table, 4, 'oni').map((m) => MASK_TAG[m].color);
      expect(new Set(colours).size).toBe(colours.length);
    }
  });
});

describe('gazeIndex', () => {
  it('glances between its seats over time and stays put with one', () => {
    const seen = new Set(Array.from({ length: 40 }, (_, i) => gazeIndex(i, 2, 0)));
    expect(seen).toEqual(new Set([0, 1]));
    expect(gazeIndex(100, 1, 3)).toBe(0);
  });
});
