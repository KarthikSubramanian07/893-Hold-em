/// <reference types="node" />
// A whole practice night on the real wasm engine, with fake timers standing in
// for the clock. Node loads the same package the browser does, synchronously.
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initSync, Table } from '../../../crates/wasm/pkg/hachi_wasm.js';
import type { Card, GameView, Stance } from '../../engine/types';
import type { ClientMessage, ServerMessage } from '../../protocol';
import type { Line } from './line';
import { dialPractice, SAVE_KEY, type EngineModule } from './local';
import { PRACTICE_CODE } from './practice';

const engine: EngineModule = {
  create: (code, seed) => new Table(code, seed),
  load: (saved) => Table.load(saved),
};

beforeAll(() => {
  initSync({ module: readFileSync(new URL('../../../crates/wasm/pkg/hachi_wasm_bg.wasm', import.meta.url)) });
});

class MemoryStorage {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
  removeItem = (k: string) => void this.data.delete(k);
}

const PID = 'pid-practice-test';

/** A player at the practice table: what they sent, and everything the line handed back. */
function sitDown(storage: MemoryStorage | null, seed = 7) {
  const inbox: ServerMessage[] = [];
  const events = { opened: 0, closed: 0 };
  let line: Line;
  const send = (msg: ClientMessage) => line.send(JSON.stringify(msg));
  line = dialPractice(
    {
      onOpen: () => {
        events.opened++;
        send({ t: 'hello', pid: PID, name: 'Mio', avatar: 'koi' });
      },
      onMessage: (raw) => inbox.push(JSON.parse(raw) as ServerMessage),
      onClose: () => events.closed++,
    },
    { code: PRACTICE_CODE, load: async () => engine, storage, seed },
  );
  const views = () => inbox.flatMap((m) => (m.t === 'state' ? [m.view] : []));
  const view = () => {
    for (let i = inbox.length - 1; i >= 0; i--) {
      const m = inbox[i]!;
      if (m.t === 'state') return m.view;
    }
    throw new Error('no view yet');
  };
  return { line, inbox, events, send, views, view };
}

/** Let the engine's promise settle (the loader is async, like a real fetch). */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-01T22:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('practice table', () => {
  it('seats you as host with three regulars at Shitamachi, before you touch anything', async () => {
    const p = sitDown(null);
    expect(p.line.open).toBe(false);
    await settle();
    expect(p.events.opened).toBe(1);
    expect(p.line.open).toBe(true);
    expect(p.inbox[0]).toEqual({ t: 'welcome', seat: 's0', token: '' });

    // The welcome and the setup arrive as one state, not a flurry.
    expect(p.views()).toHaveLength(1);
    const v = p.view();
    expect(v.code).toBe(PRACTICE_CODE);
    expect(v.phase).toBe('lobby');
    expect(v.you).toBe('s0');
    expect(v.config).toEqual({ difficulty: 'shitamachi', timer: 60 });
    expect(v.seats.map((s) => [s.id, s.bot, s.host])).toEqual([
      ['s0', false, true],
      ['s1', true, false],
      ['s2', true, false],
      ['s3', true, false],
    ]);
    p.line.close();
  });

  it('ignores everything until a valid hello, like the server', async () => {
    const inbox: string[] = [];
    const line = dialPractice(
      { onOpen: () => {}, onMessage: (m) => inbox.push(m), onClose: () => {} },
      { code: PRACTICE_CODE, load: async () => engine, storage: null, seed: 1 },
    );
    await settle();
    line.send(JSON.stringify({ t: 'start' }));
    line.send('not json');
    expect(inbox).toEqual([]);
    line.send(JSON.stringify({ t: 'hello', pid: PID, name: 'Mio', avatar: 'koi' }));
    expect(inbox.length).toBe(2);
    line.close();
  });

  it('lets you change the room and the crew in the lobby', async () => {
    const p = sitDown(null);
    await settle();
    p.send({ t: 'config', config: { difficulty: 'oyabun', timer: 15 } });
    expect(p.view().config).toEqual({ difficulty: 'oyabun', timer: 15 });
    p.send({ t: 'bot', op: 'add' });
    expect(p.view().seats).toHaveLength(5);
    p.send({ t: 'bot', op: 'remove' });
    p.send({ t: 'bot', op: 'remove' });
    expect(p.view().seats.filter((s) => s.bot)).toHaveLength(2);
    p.line.close();
  });

  it.each([20261101, 893, 8, 42, 77])('plays a whole night (seed %i): regulars act on their own, the clock decides for you, and a verdict lands', async (seed) => {
    const p = sitDown(null, seed);
    await settle();
    p.send({ t: 'config', config: { timer: 15 } });
    p.send({ t: 'start' });
    expect(p.view().phase).toBe('nod');
    expect(p.view().deadline).toBe(Date.now() + 15_000);

    let timedOut = false;
    for (let tick = 0; tick < 5000 && p.view().phase !== 'over'; tick++) {
      const v = p.view();
      const me = v.seats.find((s) => s.id === v.you)!;
      if (v.phase === 'nod' && !me.locked) {
        if (!timedOut) {
          // Sit on your hands for the first nod: the clock has to pass for you.
          await vi.advanceTimersByTimeAsync(15_000 + 100);
          const after = p.view();
          expect(after.hand).toBe(v.hand);
          const mine = after.seats.find((s) => s.id === after.you)!;
          expect(mine.nod).toBeNull();
          expect(after.phase === 'call' || mine.locked).toBe(true);
          timedOut = true;
          continue;
        }
        const mate = v.seats.find((s) => s.id !== v.you)!;
        p.send({ t: 'nod', at: v.hand % 2 ? mate.id : null });
        continue;
      }
      if (v.phase === 'call' && !me.locked) {
        const stance: Stance = v.hand % 3 === 0 ? 'out' : 'in';
        p.send({ t: 'call', stance });
        expect(p.view().seats.find((s) => s.id === v.you)!.stance ?? stance).toBe(stance);
        continue;
      }
      if (v.phase === 'showdown' && !v.ready.includes(v.you!)) {
        p.send({ t: 'next' });
        continue;
      }
      await vi.advanceTimersByTimeAsync(250);
    }

    let botMoves = 0;
    for (const v of p.views()) {
      for (const s of v.seats) if (s.bot && (s.nod !== null || s.stance !== null)) botMoves++;
    }

    const end = p.view();
    expect(end.phase).toBe('over');
    expect(end.verdict).toMatch(/^(clean|raid|dawn)$/);
    expect(end.history.length).toBeGreaterThan(0);
    expect(end.history.length).toBeLessThanOrEqual(end.lastOrders);
    if (end.verdict === 'clean') expect(end.meter).toBeGreaterThanOrEqual(end.door);
    if (end.verdict === 'raid') expect(end.meter).toBeLessThanOrEqual(-end.sirens);
    // The marker is the sum of every hand's movement.
    expect(end.history.reduce((n, h) => n + h.moved, 0)).toBe(end.meter);
    expect(timedOut).toBe(true);
    expect(botMoves).toBeGreaterThan(0);
    // Nothing waits on the clock once the night is over.
    expect(vi.getTimerCount()).toBe(0);

    assertBlindNod(p.views());
    p.line.close();
  });

  it('stands still while paused: the clock, the regulars and your own moves wait, then carry on', async () => {
    const p = sitDown(null);
    await settle();
    p.send({ t: 'config', config: { timer: 15 } });
    p.send({ t: 'start' });
    const before = p.view();
    expect(before.phase).toBe('nod');
    const left = before.deadline! - before.now;

    p.line.pause!(true);
    const seen = p.inbox.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(p.inbox.length).toBe(seen);
    p.send({ t: 'nod', at: null });
    expect(p.inbox.length).toBe(seen);

    p.line.pause!(false);
    const after = p.view();
    expect(after.phase).toBe('nod');
    expect(after.hand).toBe(before.hand);
    expect(after.deadline! - after.now).toBe(left);
    expect(after.seats.find((s) => s.id === after.you)!.locked).toBe(false);

    await vi.advanceTimersByTimeAsync(15_000 + 100);
    const passed = p.view();
    expect(passed.phase === 'call' || passed.seats.find((s) => s.id === passed.you)!.locked).toBe(true);
    p.line.close();
  });

  it('resumes a game from storage after a reload, without seating more regulars', async () => {
    const storage = new MemoryStorage();
    const first = sitDown(storage);
    await settle();
    first.send({ t: 'start' });
    const before = first.view();
    expect(storage.data.has(SAVE_KEY)).toBe(true);
    first.line.close();

    const again = sitDown(storage);
    await settle();
    const v = again.view();
    expect(v.you).toBe('s0');
    expect(v.phase).toBe('nod');
    expect(v.hand).toBe(before.hand);
    expect(v.seats).toHaveLength(4);
    expect(v.seats[0]!.cards).toEqual(['back', 'back']);
    expect(v.seats[1]!.cards).toEqual(before.seats[1]!.cards);
    again.line.close();
  });

  it('starts clean when the saved game is from another engine', async () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, '{"not":"a room"}');
    const p = sitDown(storage);
    await settle();
    expect(p.view().seats).toHaveLength(4);
    expect(p.view().phase).toBe('lobby');
    p.line.close();
  });

  it('stops the clock and reports nothing after close', async () => {
    const p = sitDown(null);
    await settle();
    p.send({ t: 'start' });
    const count = p.inbox.length;
    p.line.close();
    expect(p.line.open).toBe(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(p.inbox.length).toBe(count);
    expect(p.events.closed).toBe(0);
  });

  it('reports a dropped line when the engine cannot load', async () => {
    let closed = 0;
    dialPractice(
      { onOpen: () => {}, onMessage: () => {}, onClose: () => closed++ },
      { code: PRACTICE_CODE, load: () => Promise.reject(new Error('offline')), storage: null },
    );
    await settle();
    expect(closed).toBe(1);
  });
});

/**
 * Hidden information, blind-nod style: before a hand opens up, you see the
 * real cards of the two beside you and never your own (nor anyone else's), the
 * House shows exactly one card, and the board shows four cards during the nod. Your own cards are learned
 * from the showdown and checked against every earlier view of that hand.
 */
function assertBlindNod(views: GameView[]) {
  const truth = new Map<string, Card[]>(); // `${hand}:${seat}` -> hole cards
  for (const v of views) {
    if (v.phase !== 'showdown') continue;
    for (const s of v.seats) {
      if (s.cards.every((c) => c && c !== 'back')) truth.set(`${v.hand}:${s.id}`, s.cards as Card[]);
    }
  }
  expect(truth.size).toBeGreaterThan(0);

  let checked = 0;
  for (const v of views) {
    if (v.phase !== 'nod' && v.phase !== 'call') continue;
    const mine = v.seats.find((s) => s.id === v.you)!;
    expect(mine.cards).toEqual(['back', 'back']);
    const real = truth.get(`${v.hand}:${mine.id}`) ?? [];
    expect(JSON.stringify(v)).not.toMatch(new RegExp(real.map((c) => `"${c}"`).join('|') || '^$'));
    for (const s of v.seats) {
      if (s.id === v.you) continue;
      const known = truth.get(`${v.hand}:${s.id}`);
      if (s.inSight) {
        expect(s.cards.every((c) => c && c !== 'back')).toBe(true);
        if (known) expect(s.cards).toEqual(known);
      } else {
        expect(s.cards).toEqual(['back', 'back']);
        if (known) expect(JSON.stringify(v)).not.toMatch(new RegExp(known.map((c) => `"${c}"`).join('|')));
      }
      // Others' In/Out stays hidden until the showdown.
      expect(s.stance).toBeNull();
      if (v.phase === 'nod') expect(s.nod).toBeNull();
      checked++;
    }
    const up = v.house.cards.filter((c) => c && c !== 'back').length;
    expect(up).toBe(1);
    const board = v.board.filter((c) => c && c !== 'back').length;
    expect(board).toBe(v.phase === 'nod' ? 4 : 5);
  }
  expect(checked).toBeGreaterThan(0);
}
