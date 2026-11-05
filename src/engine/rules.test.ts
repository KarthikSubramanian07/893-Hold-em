import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BALANCE, HOUSE, HOUSE_UP, LAST_ORDERS, MAX_CREW, MIN_CREW, NOD_BOARD, doorFor, sirensFor } from './rules';

const rust = readFileSync(fileURLToPath(new URL('../../crates/engine/src/rules.rs', import.meta.url)), 'utf8');

function constant(name: string): number {
  const m = rust.match(new RegExp(`pub const ${name}: \\w+ = (\\d+);`));
  if (!m) throw new Error(`rules.rs has no ${name}`);
  return Number(m[1]);
}

describe('rules mirror crates/engine/src/rules.rs', () => {
  it('agrees on the plain constants', () => {
    expect(constant('MIN_CREW')).toBe(MIN_CREW);
    expect(constant('MAX_CREW')).toBe(MAX_CREW);
    expect(constant('HOUSE_UP')).toBe(HOUSE_UP);
    expect(constant('LAST_ORDERS')).toBe(LAST_ORDERS);
    expect(constant('NOD_BOARD')).toBe(NOD_BOARD);
  });

  it('agrees on how many cards the House holds', () => {
    const start = rust.indexOf('= [', rust.indexOf('pub const HOUSE:'));
    const block = rust.slice(start, rust.indexOf('\n];', start));
    const rows = block
      .split('\n')
      .filter((l) => l.trim().startsWith('['))
      .map((l) => [...l.matchAll(/\d+/g)].map((m) => Number(m[0])));
    expect(rows).toEqual([HOUSE.shitamachi, HOUSE.kabukicho, HOUSE.oyabun]);
  });

  it('agrees on the door and sirens table', () => {
    const start = rust.indexOf('= [', rust.indexOf('pub const BALANCE'));
    const block = rust.slice(start, rust.indexOf('\n];', start));
    const rows = block
      .split('\n')
      .filter((l) => l.trim().startsWith('[('))
      .map((l) => [...l.matchAll(/\((\d+),\s*(\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]));
    expect(rows).toEqual([BALANCE.shitamachi, BALANCE.kabukicho, BALANCE.oyabun]);
  });

  it('clamps crew size like the engine', () => {
    expect(doorFor('shitamachi', 1)).toBe(doorFor('shitamachi', 2));
    expect(sirensFor('oyabun', 9)).toBe(sirensFor('oyabun', 6));
  });
});
