// The sculpt of each House mask, as plain math: an outline and a height field
// over face coordinates. x runs -1..1 across the face as you look at it, y runs
// -1 (chin) .. 1 (crown). The 3D face mesh and the painted texture both come
// from these numbers, so a painted eye always sits in its carved socket.
//
// Extras that are not a height field (a fox's ears, the tengu's nose, horns,
// beards, a hat) are listed per mask and built in parts/Masks.tsx.

import type { MaskId } from '../story/types';

export interface Eye {
  x: number;
  y: number;
  /** Glow size, relative to the default. */
  r: number;
}

export interface MaskShape {
  /** Half width and half height of the face, in world units at scale 1. */
  hw: number;
  hh: number;
  /** World depth of one unit of height. */
  depth: number;
  /** Half width of the face at height y, as a fraction of hw (0..1). */
  width: (y: number) => number;
  /** Height of the surface at (x, y), in depth units (about 0..1.5). */
  height: (x: number, y: number) => number;
  eyes: [Eye, Eye];
}

const sq = (v: number) => v * v;
export const gauss = (x: number, y: number, cx: number, cy: number, sx: number, sy: number): number =>
  Math.exp(-sq(x - cx) / sq(sx) - sq(y - cy) / sq(sy));
/** A pair of bumps mirrored across the centre line. */
const pair = (x: number, y: number, cx: number, cy: number, sx: number, sy: number): number =>
  gauss(Math.abs(x), y, cx, cy, sx, sy);
export const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const round = (y: number, p: number) => Math.pow(Math.max(0, 1 - y * y), p);

/** The lacquered shell everything is carved into: a shallow dome with a rolled rim. */
function shell(x: number, y: number, w: (y: number) => number): number {
  const wy = Math.max(1e-3, w(y));
  const s = Math.min(1, Math.abs(x) / wy);
  const r = Math.sqrt(s * s * (1 - y * y) + y * y);
  const dome = Math.sqrt(Math.max(0, 1 - 0.55 * x * x - 0.35 * y * y));
  return dome * 0.78 - 0.3 * sq(smooth(0.78, 1, r));
}

/** Eye sockets, a brow, a nose and the soft planes every face shares. */
function face(x: number, y: number, ey: number, ex: number): number {
  return (
    -0.13 * pair(x, y, ex, ey, 0.17, 0.1) +
    0.07 * gauss(x, y, 0, ey + 0.17, 0.55, 0.09) +
    0.05 * pair(x, y, 0.45, -0.25, 0.25, 0.25)
  );
}

/** The hannya's mouth, torn up toward the ears; shared by the sculpt and the paint. */
export const HANNYA_MOUTH = {
  top: (x: number) => -0.42 + 0.26 * x * x,
  bottom: (x: number) => -0.66 + 0.12 * x * x + 0.2 * Math.abs(x),
  half: 0.66,
};

const okameW = (y: number) => round(y, 0.55) * (0.92 + 0.16 * gauss(0, y, 0, -0.32, 1, 0.42));
const hyottokoW = (y: number) => round(y, 0.7) * 0.95;
const ebisuW = (y: number) => round(y, 0.58) * (1 + 0.08 * gauss(0, y, 0, -0.35, 1, 0.4));
const kitsuneW = (y: number) => (y >= -0.1 ? round((y + 0.1) / 1.1, 0.55) : Math.pow(Math.max(0, 1 - ((y + 0.1) / 0.9) ** 2), 0.75) * (0.35 + 0.65 * (y + 1) / 0.9)) * 0.94;
const tenguW = (y: number) => round(y, 0.62) * 0.95;
const hannyaW = (y: number) => round(y, 0.5) * (1 + 0.1 * gauss(0, y, 0, -0.45, 1, 0.35));
const okinaW = (y: number) => round(y, 0.66) * 0.96;
const oniW = (y: number) => round(y, 0.42) * (1 + 0.1 * gauss(0, y, 0, -0.5, 1, 0.4));

export const MASK_SHAPES: Record<MaskId, MaskShape> = {
  // Round as a mochi: a high bulging brow, cheeks like two plums, a tiny mouth.
  okame: {
    hw: 0.31,
    hh: 0.36,
    depth: 0.21,
    width: okameW,
    height: (x, y) =>
      shell(x, y, okameW) +
      face(x, y, 0.12, 0.3) +
      0.22 * gauss(x, y, 0, 0.6, 0.55, 0.28) +
      0.58 * pair(x, y, 0.5, -0.32, 0.3, 0.3) +
      0.1 * gauss(x, y, 0, -0.08, 0.07, 0.12) -
      0.05 * pair(x, y, 0.15, -0.52, 0.05, 0.05) +
      0.14 * gauss(x, y, 0, -0.8, 0.22, 0.12) -
      0.04 * gauss(x, y, 0, -0.5, 0.1, 0.05),
    eyes: [
      { x: -0.3, y: 0.12, r: 0.7 },
      { x: 0.3, y: 0.12, r: 0.7 },
    ],
  },
  // The fire-blower: odd eyes, puffed cheeks, the mouth pushed out to one side.
  hyottoko: {
    hw: 0.28,
    hh: 0.37,
    depth: 0.2,
    width: hyottokoW,
    height: (x, y) =>
      shell(x, y, hyottokoW) +
      face(x, y, 0.16, 0.32) -
      0.06 * gauss(x, y, -0.32, 0.14, 0.2, 0.15) +
      0.32 * pair(x, y, 0.42, -0.3, 0.24, 0.25) +
      0.16 * gauss(x, y, 0.22, -0.48, 0.22, 0.16) +
      0.18 * gauss(x, y, 0, -0.06, 0.1, 0.1),
    eyes: [
      { x: -0.32, y: 0.14, r: 1.15 },
      { x: 0.3, y: 0.2, r: 0.75 },
    ],
  },
  // The laughing god: eyes squeezed shut, cheeks pushed up, mouth wide open.
  ebisu: {
    hw: 0.32,
    hh: 0.36,
    depth: 0.21,
    width: ebisuW,
    height: (x, y) =>
      shell(x, y, ebisuW) +
      face(x, y, 0.18, 0.32) +
      0.36 * pair(x, y, 0.45, -0.12, 0.25, 0.24) +
      0.26 * gauss(x, y, 0, -0.04, 0.12, 0.15) -
      0.26 * gauss(x, y, 0, -0.47, 0.3, 0.09) +
      0.12 * gauss(x, y, 0, -0.78, 0.35, 0.12),
    eyes: [
      { x: -0.32, y: 0.18, r: 0.6 },
      { x: 0.32, y: 0.18, r: 0.6 },
    ],
  },
  // The white fox: wide at the eyes, tapering to a long pointed muzzle.
  kitsune: {
    hw: 0.3,
    hh: 0.4,
    depth: 0.2,
    width: kitsuneW,
    height: (x, y) => {
      const muzzle = smooth(0.12, -0.66, y) * (1 - 0.7 * smooth(-0.76, -1, y));
      const narrow = 0.24 + 0.2 * smooth(-0.9, 0.1, y);
      return (
        shell(x, y, kitsuneW) +
        face(x, y, 0.2, 0.33) +
        0.72 * muzzle * gauss(x, 0, 0, 0, narrow, 1) +
        0.12 * pair(x, y, 0.35, 0.32, 0.18, 0.08) -
        0.05 * pair(x, y, 0.2, -0.55, 0.12, 0.2)
      );
    },
    eyes: [
      { x: -0.33, y: 0.2, r: 0.8 },
      { x: 0.33, y: 0.2, r: 0.8 },
    ],
  },
  // Proud and furious under a heavy brow. The nose is built separately.
  tengu: {
    hw: 0.29,
    hh: 0.38,
    depth: 0.2,
    width: tenguW,
    height: (x, y) =>
      shell(x, y, tenguW) +
      face(x, y, 0.2, 0.32) +
      0.22 * gauss(x, y, 0, 0.42, 0.62, 0.1) +
      0.1 * pair(x, y, 0.32, 0.2, 0.12, 0.08) +
      0.18 * pair(x, y, 0.5, -0.1, 0.2, 0.2) +
      0.2 * gauss(x, y, 0, 0.0, 0.12, 0.14) -
      0.1 * gauss(x, y, 0, -0.5, 0.28, 0.08),
    eyes: [
      { x: -0.32, y: 0.2, r: 0.9 },
      { x: 0.32, y: 0.2, r: 0.9 },
    ],
  },
  // Grief turned to fury: knotted brows, gold eyes, a mouth torn to the ears.
  hannya: {
    hw: 0.31,
    hh: 0.39,
    depth: 0.21,
    width: hannyaW,
    height: (x, y) => {
      const M = HANNYA_MOUTH;
      const inMouth = smooth(M.bottom(x) - 0.02, M.bottom(x) + 0.05, y) * smooth(M.top(x) + 0.02, M.top(x) - 0.05, y) * smooth(M.half, M.half - 0.12, Math.abs(x));
      return (
        shell(x, y, hannyaW) +
        face(x, y, 0.2, 0.3) +
        0.24 * pair(x, y, 0.16, 0.43, 0.17, 0.1) +
        0.1 * pair(x, y, 0.3, 0.2, 0.1, 0.07) +
        0.24 * pair(x, y, 0.52, -0.02, 0.16, 0.2) -
        0.12 * pair(x, y, 0.5, -0.36, 0.14, 0.14) +
        0.26 * gauss(x, y, 0, -0.1, 0.15, 0.14) -
        0.26 * inMouth +
        0.18 * gauss(x, y, 0, -0.84, 0.48, 0.13)
      );
    },
    eyes: [
      { x: -0.3, y: 0.2, r: 0.95 },
      { x: 0.3, y: 0.2, r: 0.95 },
    ],
  },
  // The old man: a smile carved deep into the cheeks, the jaw cut and tied on.
  okina: {
    hw: 0.3,
    hh: 0.38,
    depth: 0.2,
    width: okinaW,
    height: (x, y) =>
      shell(x, y, okinaW) +
      face(x, y, 0.14, 0.3) +
      0.02 * Math.sin(y * 38) * gauss(x, y, 0, 0.55, 0.5, 0.18) +
      0.28 * pair(x, y, 0.43, -0.12, 0.24, 0.22) +
      0.2 * gauss(x, y, 0, -0.06, 0.1, 0.15) -
      0.18 * gauss(x, y, 0, -0.4, 0.28, 0.07) -
      0.05 * gauss(x, y + 0.08 * x * x, 0, -0.56, 0.6, 0.025),
    eyes: [
      { x: -0.3, y: 0.14, r: 0.6 },
      { x: 0.3, y: 0.14, r: 0.6 },
    ],
  },
  // The red demon: a brow like a cliff, bulging eyes, a nose like a fist.
  oni: {
    hw: 0.33,
    hh: 0.38,
    depth: 0.21,
    width: oniW,
    height: (x, y) =>
      shell(x, y, oniW) +
      face(x, y, 0.2, 0.34) +
      0.3 * gauss(x, y - 0.12 * Math.abs(x), 0, 0.4, 0.62, 0.1) +
      0.16 * pair(x, y, 0.34, 0.18, 0.12, 0.09) +
      0.34 * gauss(x, y, 0, -0.1, 0.2, 0.15) +
      0.16 * pair(x, y, 0.55, -0.12, 0.2, 0.22) -
      0.3 * gauss(x, y, 0, -0.5, 0.36, 0.1) +
      0.14 * gauss(x, y, 0, -0.84, 0.5, 0.12),
    eyes: [
      { x: -0.34, y: 0.18, r: 1.05 },
      { x: 0.34, y: 0.18, r: 1.05 },
    ],
  },
};

/** A point on the face surface in mask-local world units. */
export function surfacePoint(shape: MaskShape, x: number, y: number): { x: number; y: number; z: number } {
  return { x: x * shape.hw, y: y * shape.hh, z: shape.height(x, y) * shape.depth };
}

/** True when (x, y) is inside the face outline. */
export function insideFace(shape: MaskShape, x: number, y: number): boolean {
  return Math.abs(y) <= 1 && Math.abs(x) <= shape.width(y);
}
