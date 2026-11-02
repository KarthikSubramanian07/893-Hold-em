import { describe, expect, it } from 'vitest';
import type { MaskId } from '../story/types';
import { HANNYA_MOUTH, insideFace, MASK_SHAPES, surfacePoint } from './maskShapes';

const IDS = Object.keys(MASK_SHAPES) as MaskId[];

describe('MASK_SHAPES', () => {
  it('has a sculpt for every mask the story can seat', () => {
    expect(IDS.sort()).toEqual(['ebisu', 'hannya', 'hyottoko', 'kitsune', 'okame', 'okina', 'oni', 'tengu']);
  });

  it('keeps every surface finite and in a sensible depth', () => {
    for (const id of IDS) {
      const s = MASK_SHAPES[id];
      for (let y = -1; y <= 1; y += 0.1) {
        for (let x = -1; x <= 1; x += 0.1) {
          const h = s.height(x, y);
          expect(Number.isFinite(h)).toBe(true);
          expect(h).toBeGreaterThan(-0.6);
          expect(h).toBeLessThan(1.8);
        }
      }
    }
  });

  it('closes the outline at the crown and chin and stays within the face', () => {
    for (const id of IDS) {
      const s = MASK_SHAPES[id];
      expect(s.width(1)).toBeLessThan(0.05);
      expect(s.width(-1)).toBeLessThan(0.05);
      for (let y = -1; y <= 1; y += 0.1) expect(s.width(y)).toBeLessThanOrEqual(1.1);
    }
  });

  it('puts both eyes inside the face, mirrored', () => {
    for (const id of IDS) {
      const s = MASK_SHAPES[id];
      const [l, r] = s.eyes;
      expect(insideFace(s, l.x, l.y)).toBe(true);
      expect(insideFace(s, r.x, r.y)).toBe(true);
      expect(l.x).toBeCloseTo(-r.x, 1);
    }
  });

  it('carves the eyes into sockets below the brow', () => {
    for (const id of IDS) {
      const s = MASK_SHAPES[id];
      const e = s.eyes[1];
      expect(s.height(e.x, e.y)).toBeLessThan(s.height(e.x * 0.2, e.y + 0.3) + 0.05);
    }
  });

  it("gives the fox a muzzle and the hannya a hollow mouth", () => {
    const fox = MASK_SHAPES.kitsune;
    expect(fox.height(0, -0.6)).toBeGreaterThan(fox.height(0.5, -0.1) + 0.3);
    const h = MASK_SHAPES.hannya;
    const y = (HANNYA_MOUTH.top(0) + HANNYA_MOUTH.bottom(0)) / 2;
    expect(h.height(0, y)).toBeLessThan(h.height(0, -0.1));
  });

  it('maps face coordinates to world units', () => {
    const s = MASK_SHAPES.okame;
    const p = surfacePoint(s, 1, 0);
    expect(p.x).toBeCloseTo(s.hw);
    expect(surfacePoint(s, 0, -1).y).toBeCloseTo(-s.hh);
  });
});
