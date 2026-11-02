import { describe, expect, it } from 'vitest';
import { makeRoomCode } from '../../protocol';
import { inviteUrl, isValidCode, normalizeCode, parseCode } from './code';

describe('room codes', () => {
  it('normalizes what people type', () => {
    expect(normalizeCode(' k7qx2 ')).toBe('K7QX2');
    expect(normalizeCode('k7-qx 2')).toBe('K7QX2');
    expect(normalizeCode('https://holdem893.pages.dev/t/k7qx2?x=1')).toBe('K7QX2');
  });

  it('validates against the unambiguous alphabet', () => {
    expect(isValidCode('K7QX2')).toBe(true);
    expect(isValidCode('K7QX')).toBe(false);
    expect(isValidCode('K7QX22')).toBe(false);
    // O, I, L, 0, 1 are excluded so codes read aloud cleanly.
    expect(isValidCode('O0IL1')).toBe(false);
    expect(isValidCode('k7qx2')).toBe(false);
  });

  it('parses or rejects', () => {
    expect(parseCode('k7qx2')).toBe('K7QX2');
    expect(parseCode('hello')).toBeNull();
    expect(parseCode('')).toBeNull();
  });

  it('accepts every generated code', () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 500; i++) expect(isValidCode(makeRoomCode(rand))).toBe(true);
  });

  it('builds invite links', () => {
    expect(inviteUrl('https://holdem893.pages.dev', 'K7QX2')).toBe('https://holdem893.pages.dev/t/K7QX2');
    expect(inviteUrl('http://localhost:5192/', 'K7QX2')).toBe('http://localhost:5192/t/K7QX2');
  });
});
