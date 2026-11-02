import { describe, expect, it } from 'vitest';
import { type EggDetail, type EggId, eggLine } from './eggs';
import { coldOpenFor, coldOpenSeen, MATCHBOOK_KEY } from './firstVisit';
import { fixture } from './fixtures';
import { WELCOME } from './lines';
import { IDLE_EVERY_MS, eggRemark, idleDue, subtitleSlot, welcomedEgg, witnessed } from './stage';
import { loadMatchbook } from './stamps';

const kv = (value: unknown) => ({ getItem: (k: string) => (k === MATCHBOOK_KEY ? JSON.stringify(value) : null) });
const egg = (id: EggId): EggDetail => ({ id, line: eggLine(id, 0) });

describe('first visit', () => {
  it('reads the cold open flag the matchbook writes', () => {
    expect(coldOpenSeen(kv({ v: 1, coldOpen: true }))).toBe(true);
    expect(coldOpenSeen(kv({ v: 1, coldOpen: false }))).toBe(false);
    expect(coldOpenSeen(kv(null))).toBe(false);
    expect(coldOpenSeen(null)).toBe(false);
    expect(coldOpenSeen({ getItem: () => '{not json' })).toBe(false);
  });

  it('agrees with the matchbook about what was seen', () => {
    const store = kv({ v: 1, coldOpen: true, stamps: {}, cleared: [], nights: 2, eggs: [] });
    expect(loadMatchbook({ ...store, setItem: () => {} }).coldOpen).toBe(coldOpenSeen(store));
  });

  it('opens on the alley only at the front door, only the first time', () => {
    const fresh = kv(null);
    expect(coldOpenFor('/', fresh)).toBe(true);
    expect(coldOpenFor('/index.html', fresh)).toBe(true);
    expect(coldOpenFor('/t/K7QX2', fresh)).toBe(false);
    expect(coldOpenFor('/matchbook', fresh)).toBe(false);
    expect(coldOpenFor('/', kv({ coldOpen: true }))).toBe(false);
  });
});

describe('eggRemark', () => {
  it('says nothing behind the shoji', () => {
    expect(eggRemark(egg('kanpai'), 'door')).toBeNull();
    expect(eggRemark(egg('oyabun'), 'door')).toBeNull();
  });

  it('leaves 3 a.m. and the 893 code to the welcome at a table', () => {
    expect(eggRemark(egg('three-am'), 'table')).toBeNull();
    expect(eggRemark(egg('code-893'), 'table')).toBeNull();
    expect(eggRemark(egg('neon'), 'table')?.speaker).toBe('master');
  });

  it('remarks on a new name at the table, in the welcome’s words', () => {
    const line = eggRemark(egg('oyabun'), 'table');
    expect(WELCOME.oyabun).toContain(line?.text);
    expect(line?.kanji).toBe('親分');
    expect(eggRemark(egg('cat-name'), 'table')?.text).toBe(WELCOME.cat[0]);
  });

  it('speaks on the paper pages too, where there is no welcome', () => {
    expect(WELCOME.threeAm).toContain(eggRemark(egg('three-am'), 'street')?.text);
    expect(eggRemark(egg('kanpai'), 'street')?.text).toMatch(/^Kanpai\./);
    expect(eggRemark(egg('code-893'), 'street')).toBeNull();
    expect(eggRemark({ id: 'console', line: null }, 'street')).toBeNull();
  });

  it('knows which eggs the welcome covers', () => {
    expect(welcomedEgg('oyabun')).toBe(true);
    expect(welcomedEgg('three-am')).toBe(true);
    expect(welcomedEgg('kanpai')).toBe(false);
  });
});

describe('subtitleSlot', () => {
  it('floats over the room during a hand', () => {
    expect(subtitleSlot('call')).toBe('float');
    expect(subtitleSlot('showdown', false)).toBe('float');
  });

  it('keeps a strip under the paper', () => {
    expect(subtitleSlot('lobby')).toBe('strip');
    expect(subtitleSlot(null)).toBe('strip');
    expect(subtitleSlot('over', false)).toBe('strip');
  });

  it('sits beside the receipt on a wide screen', () => {
    expect(subtitleSlot('over', true)).toBe('aside');
  });
});

describe('witnessed', () => {
  it('ignores the view you walked in on', () => {
    const over = fixture('over');
    expect(witnessed(null, over)).toBe(false);
    expect(witnessed(fixture('showdown', { code: 'ZZZZZ' }), over)).toBe(false);
    expect(witnessed(fixture('showdown', { code: over.code }), over)).toBe(true);
  });
});

describe('idleDue', () => {
  it('waits for a quiet lobby', () => {
    const lobby = fixture('lobby');
    expect(idleDue(lobby, 0, IDLE_EVERY_MS)).toBe(true);
    expect(idleDue(lobby, 1000, IDLE_EVERY_MS)).toBe(false);
    expect(idleDue(fixture('preflop'), 0, IDLE_EVERY_MS * 2)).toBe(false);
    expect(idleDue(null, 0, IDLE_EVERY_MS * 2)).toBe(false);
  });
});
