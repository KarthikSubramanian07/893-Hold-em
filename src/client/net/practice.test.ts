/// <reference types="node" />
// The store picks the practice line for the practice code and speaks to it
// through the same interface as a real room.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initSync, Table } from '../../../crates/wasm/pkg/hachi_wasm.js';
import { PRACTICE_CODE, isPracticeCode } from './practice';
import { useTable } from './store';

vi.mock('./wasm', () => ({
  loadEngine: async () => {
    initSync({ module: readFileSync(new URL('../../../crates/wasm/pkg/hachi_wasm_bg.wasm', import.meta.url)) });
    return { create: (code: string, seed: number) => new Table(code, seed), load: (s: string) => Table.load(s) };
  },
}));

afterEach(() => {
  useTable.getState().leave();
  vi.useRealTimers();
});

describe('isPracticeCode', () => {
  it('only matches the reserved code', () => {
    expect(isPracticeCode(PRACTICE_CODE)).toBe(true);
    expect(isPracticeCode('K7QX2')).toBe(false);
    expect(isPracticeCode(null)).toBe(false);
  });
});

describe('useTable on the practice table', () => {
  it('opens without a network, seats the regulars, and plays through the store', async () => {
    const WS = vi.fn();
    vi.stubGlobal('WebSocket', WS);
    vi.useFakeTimers();
    useTable.getState().connect(PRACTICE_CODE, { name: 'Mio', avatar: 'koi' });
    expect(useTable.getState().status).toBe('connecting');
    await vi.waitFor(() => expect(useTable.getState().view).not.toBeNull());
    expect(WS).not.toHaveBeenCalled();

    const s = useTable.getState();
    expect(s.status).toBe('open');
    expect(s.code).toBe(PRACTICE_CODE);
    expect(s.view!.you).toBe('s0');
    expect(s.view!.seats.filter((x) => x.bot)).toHaveLength(3);

    s.send({ t: 'start' });
    expect(useTable.getState().view!.phase).toBe('nod');
    await vi.advanceTimersByTimeAsync(7_000);
    // The regulars nod (or pass) on their own; only you are left.
    const v = useTable.getState().view!;
    expect(v.phase).toBe('nod');
    expect(v.seats.filter((x) => x.bot).every((b) => b.locked)).toBe(true);
    useTable.getState().nod('s1');
    expect(useTable.getState().view!.phase).toBe('call');
    useTable.getState().call('in');
    expect(useTable.getState().view!.seats[0]!.stance ?? 'in').toBe('in');

    useTable.getState().leave();
    expect(useTable.getState().status).toBe('idle');
    vi.unstubAllGlobals();
  });
});
