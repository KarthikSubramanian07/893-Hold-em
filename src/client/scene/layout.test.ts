import { describe, expect, it } from 'vitest';
import { aspectBlend, boardSpot, cameraFrame, heroCardPixels, lanternHeight, maskLayout, seatLayout, TABLE } from './layout';

describe('seatLayout', () => {
  it('puts the viewer at the front centre', () => {
    for (const n of [1, 2, 4, 6]) {
      const [you] = seatLayout(n, 1.6);
      expect(you!.x).toBeCloseTo(0);
      expect(you!.z).toBeGreaterThan(0.6);
      expect(you!.angle).toBe(0);
    }
  });

  it('returns one spot per seat and keeps every spot on the table', () => {
    for (const aspect of [0.46, 1, 1.6, 2.4]) {
      for (let n = 1; n <= 6; n++) {
        const spots = seatLayout(n, aspect);
        expect(spots).toHaveLength(n);
        for (const s of spots) {
          expect((s.x / TABLE.rx) ** 2 + (s.z / TABLE.rz) ** 2).toBeLessThan(1);
        }
      }
    }
  });

  it('walks up the left side first, then down the right', () => {
    const spots = seatLayout(6, 1.6);
    const angles = spots.map((s) => s.angle);
    expect(angles.slice(1, 4).every((a) => a < 0)).toBe(true);
    expect(angles.slice(4).every((a) => a > 0)).toBe(true);
    // Left side goes near -> far (more negative), right side far -> near.
    expect(angles[1]!).toBeGreaterThan(angles[3]!);
    expect(angles[4]!).toBeGreaterThan(angles[5]!);
  });

  it('pulls seats inward on a portrait phone', () => {
    const wide = Math.max(...seatLayout(6, 1.6).map((s) => Math.abs(s.x)));
    const tall = Math.max(...seatLayout(6, 0.46).map((s) => Math.abs(s.x)));
    expect(tall).toBeLessThan(wide);
  });

  it('points each seat yaw away from the centre', () => {
    for (const s of seatLayout(5, 1.6)) {
      expect(Math.sin(s.yaw) * s.x).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('maskLayout', () => {
  it('spreads masks symmetrically across the far side', () => {
    for (let n = 1; n <= 4; n++) {
      const masks = maskLayout(n, 1.6);
      expect(masks).toHaveLength(n);
      const sum = masks.reduce((a, m) => a + m.x, 0);
      expect(sum).toBeCloseTo(0);
      for (const m of masks) expect(m.z).toBeLessThan(-1.5);
    }
  });

  it('orders masks left to right', () => {
    const xs = maskLayout(4, 1.6).map((m) => m.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });
});

describe('boardSpot', () => {
  it('centres the five slots', () => {
    expect(boardSpot(2).x).toBe(0);
    expect(boardSpot(0).x).toBeCloseTo(-boardSpot(4).x);
  });
});

describe('cameraFrame', () => {
  it('blends between portrait and landscape', () => {
    expect(aspectBlend(0.3)).toBe(0);
    expect(aspectBlend(3)).toBe(1);
  });

  it('widens the lens and lifts the camera for tall screens', () => {
    const phone = cameraFrame(390 / 844);
    const desk = cameraFrame(1440 / 900);
    expect(phone.fov).toBeGreaterThan(desk.fov);
    expect(phone.position.y).toBeGreaterThan(desk.position.y);
  });

  it('keeps the field of view in a sane range', () => {
    for (const a of [0.3, 0.46, 0.75, 1, 1.6, 2.4, 4]) {
      const { fov } = cameraFrame(a);
      expect(fov).toBeGreaterThanOrEqual(40);
      expect(fov).toBeLessThanOrEqual(74);
    }
  });

  it('keeps the board width in frame on a phone', () => {
    const aspect = 390 / 844;
    const { position, target, fov } = cameraFrame(aspect);
    const dist = Math.hypot(position.y - target.y, position.z - target.z);
    const halfW = dist * Math.tan(((fov * Math.PI) / 180) / 2) * aspect;
    expect(halfW).toBeGreaterThan(boardSpot(4).x + 0.25);
  });
});

describe('heroCardPixels', () => {
  it('sits above the bottom HUD band', () => {
    for (const [w, h] of [[390, 844], [1440, 900], [800, 500]] as const) {
      const p = heroCardPixels(w, h);
      expect(p.centreY - p.cardHeight / 2).toBeGreaterThan(150);
    }
  });
});

describe('lanternHeight', () => {
  it('hangs higher on tall screens so it clears the masks', () => {
    expect(lanternHeight(390 / 844)).toBeGreaterThan(lanternHeight(1440 / 900));
  });
});
