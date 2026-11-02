import { describe, expect, it } from 'vitest';
import { RANKS, SUITS, type Card } from '../../engine/types';
import { cardInfo, cardTextureKey, isFace, plateText, RANK_KANJI } from './cardInfo';
import { PALETTE } from './palette';

describe('cardTextureKey', () => {
  it('maps faces, backs, and undealt slots', () => {
    expect(cardTextureKey('Ah')).toBe('face:Ah');
    expect(cardTextureKey('back')).toBe('back');
    expect(cardTextureKey(null)).toBeNull();
  });

  it('gives all 52 faces distinct keys', () => {
    const keys = new Set<string>();
    for (const r of RANKS) for (const s of SUITS) keys.add(cardTextureKey(`${r}${s}` as Card)!);
    expect(keys.size).toBe(52);
  });
});

describe('cardInfo', () => {
  it('inks hearts and diamonds in shu, spades and clubs in sumi', () => {
    expect(cardInfo('Qh').ink).toBe(PALETTE.shu);
    expect(cardInfo('2d').red).toBe(true);
    expect(cardInfo('As').ink).toBe(PALETTE.sumi);
    expect(cardInfo('9c').red).toBe(false);
  });

  it('spells ten as 10 and carries a kanji for every rank', () => {
    expect(cardInfo('Td').label).toBe('10');
    for (const r of RANKS) expect(RANK_KANJI[r]).toMatch(/^\p{Script=Han}$/u);
  });

  it('knows which slots have a face', () => {
    expect(isFace('Kc')).toBe(true);
    expect(isFace('back')).toBe(false);
    expect(isFace(null)).toBe(false);
  });
});

describe('plateText', () => {
  it('keeps Latin names and replaces glyphs the font does not ship', () => {
    expect(plateText('Mio')).toBe('Mio');
    expect(plateText('José')).toBe('José');
    expect(plateText('澪')).toBe('·');
    expect(plateText('Ren 🦊')).toBe('Ren ·');
  });

  it('clips long names', () => {
    expect(plateText('Bartholomew the Third', 8)).toBe('Bartholo');
    expect(plateText('   ')).toBe('·');
  });
});
