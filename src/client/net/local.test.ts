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

  it.each([20261101, 893, 8, 42, 77])('plays a whole night (seed %i): regulars act on their own, the clock calls for you, and a verdict lands', async (seed) => {
    const p = sitDown(null, seed);
    await settle();
    p.send({ t: 'config', config: { timer: 15 } });
    p.send({ t: 'start' });
    expect(p.view().phase).toBe('call');
    expect(p.view().deadline).toBe(Date.now() + 15_000);

    let timedOut = false;
    let botCallsSeen = 0;
    for (let tick = 0; tick < 5000 && p.view().phase !== 'over'; tick++) {
      const v = p.view();
      const me = v.seats.find((s) => s.id === v.you)!;
      if (v.phase === 'call' && me.active && !me.locked) {
        if (!timedOut) {
          // Sit on your hands for the first call: the timer has to make it for you.
          const street = v.street;
          await vi.advanceTimersByTimeAsync(15_000 + 100);
          const after = p.view();
          expect(after.hand).toBe(v.hand);
          expect(after.seats.find((s) => s.id === after.you)!.calls[street]).toBe('stay');
          timedOut = true;
          continue;
        }
        const stance: Stance = me.stake! < 3 && v.street === 1 ? 'raise' : 'stay';
        p.send({ t: 'call', stance });
        continue;
      }
      if (v.phase === 'showdown' && !v.ready.includes(v.you!)) {
        p.send({ t: 'next' });
        continue;
      }
      await vi.advanceTimersByTimeAsync(250);
    }

    for (const v of p.views()) {
      for (const s of v.seats) if (s.bot) botCallsSeen += s.calls.filter((c) => c !== null).length;
    }

    const end = p.view();
    expect(end.phase).toBe('over');
    expect(end.verdict).toMatch(/^(clean|raid|short)$/);
    expect(end.history.length).toBeGreaterThan(0);
    expect(end.history.length).toBeLessThanOrEqual(end.hands);
    expect(timedOut).toBe(true);
    expect(botCallsSeen).toBeGreaterThan(0);
    // Nothing waits on the clock once the night is over.
    expect(vi.getTimerCount()).toBe(0);

    assertOnlyYourCards(p.views());
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
    expect(v.phase).toBe('call');
    expect(v.hand).toBe(before.hand);
    expect(v.seats).toHaveLength(4);
    expect(v.seats[0]!.cards).toEqual(before.seats[0]!.cards);
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
 * Hidden information: before a hand opens up, the views handed to the page carry
 * only your own hole cards. The real cards of every seat are learned from the
 * showdown, then checked against every earlier view of that hand.
 */
function assertOnlyYourCards(views: GameView[]) {
  const truth = new Map<string, Card[]>(); // `${hand}:${seat}` -> hole cards
  for (const v of views) {
    if (v.phase !== 'showdown' && v.phase !== 'over') continue;
    for (const s of v.seats) {
      if (s.cards.every((c) => c && c !== 'back')) truth.set(`${v.hand}:${s.id}`, s.cards as Card[]);
    }
  }
  expect(truth.size).toBeGreaterThan(0);

  let checked = 0;
  for (const v of views) {
    if (v.phase === 'showdown' || v.phase === 'over') continue;
    const shown = v.seats.filter((s) => s.id !== v.you && s.cards.some((c) => c && c !== 'back'));
    // The Fox turns exactly one seat face up for everyone; nothing else is ever visible.
    if (v.rule === 'kitsune') expect(shown.length).toBeLessThanOrEqual(1);
    else expect(shown).toEqual([]);
    for (const s of v.seats) {
      if (s.id === v.you || shown.includes(s)) continue;
      const real = truth.get(`${v.hand}:${s.id}`) ?? [];
      for (const c of s.cards) expect(real).not.toContain(c);
      checked++;
    }
    const mine = v.seats.find((s) => s.id === v.you)!;
    if (v.phase === 'call') expect(mine.cards.every((c) => c && c !== 'back')).toBe(true);
    // The House keeps its hands down too, except the one card Mirror flips.
    for (const h of v.house) {
      const up = h.cards.filter((c) => c && c !== 'back').length;
      expect(up).toBeLessThanOrEqual(v.rule === 'kagami' ? 1 : 0);
    }
  }
  expect(checked).toBeGreaterThan(0);
}
