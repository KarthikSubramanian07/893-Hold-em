import { describe, expect, it } from 'vitest';
import { hash, listNames, pick } from './hash';
import * as LINES from './lines';
import { MASKS, TABLE_MASKS, houseMaskFor, maskFor, masksFor } from './masks';
import { REGULARS } from './regulars';

/** Every string reachable from a value, with a path for the failure message. */
function strings(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  return [];
}

const ALL = [...strings(LINES, 'lines'), ...strings(MASKS, 'masks'), ...strings(REGULARS, 'regulars')];
const KNOWN_HOLES = new Set(['name', 'names', 'need', 'hand', 'Hand']);
const EMOJI = /\p{Extended_Pictographic}/u;

describe('the voice', () => {
  it('never raises its voice', () => {
    for (const [path, s] of ALL) expect(s, path).not.toMatch(/[!！]/);
  });

  it('uses no emoji', () => {
    for (const [path, s] of ALL) expect(EMOJI.test(s), path).toBe(false);
  });

  it('keeps spoken lines short', () => {
    const spoken = ALL.filter(([p]) => !/\.(story|personality|what|synopsis|realName|realKanji)$/.test(p));
    for (const [path, s] of spoken) {
      expect(s.length, path).toBeLessThanOrEqual(110);
      for (const sentence of s.split(/(?<=[.?…])\s+/)) expect(sentence.split(/\s+/).length, `${path}: ${sentence}`).toBeLessThanOrEqual(18);
    }
  });

  it('only uses template holes the narrator fills', () => {
    for (const [path, s] of ALL) {
      for (const [, hole] of s.matchAll(/\{(\w+)\}/g)) expect(KNOWN_HOLES.has(hole!), `${path}: {${hole}}`).toBe(true);
    }
  });
});

describe('picking', () => {
  it('is a pure function of the table, the hand, and the moment', () => {
    const bank = ['a', 'b', 'c', 'd'];
    expect(pick(bank, 'K7QX2', 3, 'showdown:crew')).toBe(pick(bank, 'K7QX2', 3, 'showdown:crew'));
    const all = new Set([1, 2, 3, 4].map((h) => pick(bank, 'K7QX2', h, 'showdown:crew')));
    expect(all.size).toBe(4);
  });

  it('hashes known strings to known values', () => {
    // FNV-1a test vectors, so a port to another language can check itself.
    expect(hash('')).toBe(0x811c9dc5);
    expect(hash('a')).toBe(0xe40c292c);
    expect(hash('foobar')).toBe(0xbf9cf968);
  });

  it('lists names the way people say them', () => {
    expect(listNames(['Mio'])).toBe('Mio');
    expect(listNames(['Mio', 'Ren'])).toBe('Mio and Ren');
    expect(listNames(['Mio', 'Ren', 'Sora'])).toBe('Mio, Ren and Sora');
  });
});

describe('masks', () => {
  it('puts one House mask at each table, with its friends behind it', () => {
    expect(masksFor('shitamachi', 3).map((m) => m.id)).toEqual(['okame', 'hyottoko', 'ebisu']);
    expect(houseMaskFor('kabukicho').id).toBe('kitsune');
    expect(maskFor('oyabun').id).toBe('okina');
    expect(maskFor('oyabun', 9).id).toBe('kitsune');
  });

  it('gives every mask a palette and something to say in every situation', () => {
    for (const m of Object.values(MASKS)) {
      expect(m.palette.face).toMatch(/^#[0-9a-f]{6}$/);
      for (const bank of Object.values(m.lines)) expect(bank.length).toBeGreaterThan(0);
    }
    for (const seats of Object.values(TABLE_MASKS)) expect(seats).toHaveLength(3);
  });

  it('knows every regular the engine can seat', () => {
    const engine = ['Tetsu', 'Okami', 'Hana', 'Gin', 'Kuro', 'Sumi', 'Rin', 'Jun', 'Mame', 'Taka', 'Nao', 'Fuji'];
    expect(Object.keys(REGULARS).sort()).toEqual(engine.sort());
  });
});
