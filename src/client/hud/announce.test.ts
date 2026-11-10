import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../dev/fixtures';
import { announce, cardsInWords, describeTable } from './announce';

const F = FIXTURES as Required<typeof FIXTURES>;

describe('the table in words', () => {
  it('names face-up cards and skips the hidden ones', () => {
    expect(cardsInWords(['As', 'Th', 'back', null])).toBe('ace of spades and 10 of hearts');
    expect(cardsInWords([null, 'back'])).toBe('nothing yet');
  });

  it('describes every phase with the board, the House and the marker', () => {
    for (const phase of ['nod', 'call', 'showdown', 'over'] as const) {
      const text = describeTable(F[phase]!);
      expect(text).toMatch(/The board: /);
      expect(text).toMatch(/The House shows /);
      expect(text).toMatch(/steps? to the door, \d+ to the sirens\.$/);
    }
    expect(describeTable(F.lobby!)).toMatch(/^The lobby of table /);
  });

  it('says the cards beside you and the keys on the turn', () => {
    const line = announce(F.lobby!, F.nod!)!;
    expect(line).toMatch(/^Hand \d+\. The turn\./);
    expect(line).toMatch(/Beside you: 1, /);
    expect(line).toMatch(/pass with P\.$/);
  });

  it('turns the nods over on the river, and calls the showdown and the night', () => {
    expect(announce(F.nod!, F.call!)).toMatch(/^The nods turned over\..*In with I, Out with O\.$/);
    expect(announce(F.call!, F.showdown!)).toMatch(/^Showdown\. .*to the sirens\.$/);
    expect(announce(F.showdown!, F.over!)).toMatch(/^The night is over\. /);
  });

  it('stays quiet when nothing moved', () => {
    expect(announce(F.call!, F.call!)).toBeNull();
    expect(announce(F.lobby!, F.lobby!)).toBeNull();
  });
});
