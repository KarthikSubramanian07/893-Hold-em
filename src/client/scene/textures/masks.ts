// Mask faces, painted in the same face coordinates as the sculpt in
// maskShapes.ts: x runs -1..1 across the face, y runs -1 (chin) .. 1 (crown).
// Each face gets a gouache base, baked soft shading from its own height field
// (so the carving reads even in a dim room), then ink, lacquer, and gold.

import type * as THREE from 'three';
import type { MaskId } from '../../story/types';
import { HANNYA_MOUTH, MASK_SHAPES, type MaskShape } from '../maskShapes';
import { PALETTE } from '../palette';
import { blurFill, cached, inkVoids, makeCanvas, paperGrain, rng, toTexture, type Ctx } from './canvas';

const S = 768;
/** Face coordinates to canvas pixels. */
const X = (x: number) => ((x + 1) / 2) * S;
const Y = (y: number) => ((1 - y) / 2) * S;
/** A face-unit length in pixels. */
const L = (d: number) => (d * S) / 2;

type P = [number, number];

function gradientBase(ctx: Ctx, light: string, mid: string, dark: string, cy = 0.15): void {
  const g = ctx.createRadialGradient(X(0), Y(cy), L(0.05), X(0), Y(0), L(1.25));
  g.addColorStop(0, light);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
}

/** Soft directional light and cavity shading baked from the height field. */
function bakeShading(ctx: Ctx, shape: MaskShape, strength = 1): void {
  const N = 192;
  const [c, sctx] = makeCanvas(N, N);
  const img = sctx.createImageData(N, N);
  const h = new Float32Array((N + 2) * (N + 2));
  const at = (i: number, j: number) => h[(j + 1) * (N + 2) + (i + 1)]!;
  for (let j = -1; j <= N; j++) {
    for (let i = -1; i <= N; i++) {
      const x = ((i + 0.5) / N) * 2 - 1;
      const y = 1 - ((j + 0.5) / N) * 2;
      h[(j + 1) * (N + 2) + (i + 1)] = shape.height(x, y);
    }
  }
  const step = 2 / N;
  const lx = -0.32;
  const ly = 0.62;
  const lz = 0.72;
  const ll = Math.hypot(lx, ly, lz);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const dx = ((at(i + 1, j) - at(i - 1, j)) / (2 * step)) * (shape.depth / shape.hw);
      const dy = ((at(i, j - 1) - at(i, j + 1)) / (2 * step)) * (shape.depth / shape.hh);
      const nl = Math.hypot(dx, dy, 1);
      const lambert = Math.max(0, (-dx * lx - dy * ly + lz) / (nl * ll));
      // Cavity: lower than the neighbourhood means a crease or socket.
      let avg = 0;
      for (const [a, b] of [
        [-3, 0],
        [3, 0],
        [0, -3],
        [0, 3],
        [-2, -2],
        [2, 2],
        [-2, 2],
        [2, -2],
      ] as const) {
        avg += at(Math.min(N, Math.max(-1, i + a)), Math.min(N, Math.max(-1, j + b)));
      }
      avg /= 8;
      const cavity = Math.max(-0.4, Math.min(0.08, (at(i, j) - avg) * 6));
      const v = Math.min(1, Math.max(0, (0.62 + 0.42 * lambert) * (1 + cavity)));
      const k = (j * N + i) * 4;
      const g = 255 * (1 - (1 - v) * strength);
      img.data[k] = g;
      img.data[k + 1] = g * 0.985;
      img.data[k + 2] = g * 0.96;
      img.data[k + 3] = 255;
    }
  }
  sctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, 0, 0, S, S);
  ctx.restore();
}

/** A soft blurred ellipse in face units. */
function blob(ctx: Ctx, color: string, x: number, y: number, rx: number, ry: number, blur: number): void {
  blurFill(ctx, blur, color, () => {
    ctx.beginPath();
    ctx.ellipse(X(x), Y(y), L(rx), L(ry), 0, 0, Math.PI * 2);
  });
}

function ellipse(ctx: Ctx, color: string, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(X(x), Y(y), L(rx), L(ry), rot, 0, Math.PI * 2);
  ctx.fill();
}

/** A smooth closed shape through face-unit points. */
function fillShape(ctx: Ctx, color: string, pts: P[]): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  const n = pts.length;
  const mid = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1]!, pts[0]!);
  ctx.moveTo(X(m0[0]), Y(m0[1]));
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const m = mid(p, pts[(i + 1) % n]!);
    ctx.quadraticCurveTo(X(p[0]), Y(p[1]), X(m[0]), Y(m[1]));
  }
  ctx.closePath();
  ctx.fill();
}

/** A tapered brush stroke along a quadratic curve, in face units; width in px. */
function brush(ctx: Ctx, color: string, a: P, c: P, b: P, width: number, taper: [number, number] = [1, 1]): void {
  ctx.save();
  ctx.fillStyle = color;
  const steps = Math.max(16, Math.round(L(Math.hypot(b[0] - a[0], b[1] - a[1])) / 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0];
    const y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1];
    const swell = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
    const ends = t < 0.5 ? taper[0] : taper[1];
    const r = width * (ends * swell + (1 - ends)) * 0.5 + 0.4;
    ctx.beginPath();
    ctx.arc(X(x), Y(y), r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** An almond eye opening, in face units. `tilt` raises the outer corner. */
function almond(ctx: Ctx, color: string, x: number, y: number, w: number, h: number, tilt: number, side: number): void {
  ctx.save();
  ctx.translate(X(x), Y(y));
  ctx.rotate(-tilt * side);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-L(w) / 2, 0);
  ctx.quadraticCurveTo(0, -L(h) * 1.15, L(w) / 2, 0);
  ctx.quadraticCurveTo(0, L(h) * 0.85, -L(w) / 2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Closed, smiling eyes: an arch of ink with lashes of shadow. */
function smileEye(ctx: Ctx, x: number, y: number, w: number, lift: number, width: number, color = '#120c08'): void {
  brush(ctx, color, [x - w / 2, y - lift * 0.3], [x, y + lift], [x + w / 2, y - lift * 0.3], width, [0.7, 0.7]);
}

function hairStrands(ctx: Ctx, seed: number, count: number, from: [number, number], to: [number, number], color: string, width: number): void {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const x0 = from[0] + (from[1] - from[0]) * r();
    const len = to[0] + (to[1] - to[0]) * r();
    const bend = (r() - 0.5) * 0.3;
    brush(ctx, color, [x0, 1.02], [x0 + bend, 1 - len * 0.5], [x0 + bend * 2 + (r() - 0.5) * 0.1, 1 - len], width * (0.6 + r() * 0.6), [0.2, 1]);
  }
}

// ---------------------------------------------------------------------------

function paintOkame(ctx: Ctx, shape: MaskShape): void {
  gradientBase(ctx, '#fffaf1', '#f6ecdb', '#dccab0', 0.25);
  bakeShading(ctx, shape, 0.85);
  // Plum cheeks and a flush on the chin.
  for (const s of [-1, 1]) {
    blob(ctx, 'rgba(236,112,120,0.55)', s * 0.5, -0.3, 0.24, 0.2, 70);
    blob(ctx, 'rgba(240,90,100,0.35)', s * 0.5, -0.3, 0.1, 0.08, 30);
  }
  blob(ctx, 'rgba(232,130,120,0.25)', 0, -0.8, 0.18, 0.08, 30);
  // Hair parted in the middle, framing a high round brow, with a blue-black sheen.
  fillShape(ctx, '#120d0b', [
    [-1.1, 0.0],
    [-0.94, 0.42],
    [-0.7, 0.68],
    [-0.38, 0.8],
    [-0.1, 0.86],
    [0, 0.78],
    [0.1, 0.86],
    [0.38, 0.8],
    [0.7, 0.68],
    [0.94, 0.42],
    [1.1, 0.0],
    [1.1, 1.2],
    [-1.1, 1.2],
  ]);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      brush(ctx, 'rgba(120,130,160,0.4)', [s * 0.03, 0.98], [s * (0.2 + k * 0.1), 0.92 - k * 0.02], [s * (0.5 + k * 0.08), 0.66 - k * 0.08], 2.2);
    }
  }
  // Hikimayu: the soft painted brows high on the forehead.
  for (const s of [-1, 1]) blob(ctx, 'rgba(24,18,14,0.85)', s * 0.25, 0.55, 0.1, 0.045, 16);
  // Narrow eyes, smiling, the outer corners drooping kindly.
  for (const s of [-1, 1]) {
    brush(ctx, '#140d09', [s * 0.17, 0.1], [s * 0.3, 0.17], [s * 0.43, 0.08], 6.5, [0.5, 0.9]);
    brush(ctx, 'rgba(90,50,40,0.5)', [s * 0.2, 0.06], [s * 0.3, 0.1], [s * 0.4, 0.05], 2);
  }
  // A small nose, barely there.
  for (const s of [-1, 1]) ellipse(ctx, 'rgba(120,70,60,0.5)', s * 0.035, -0.15, 0.014, 0.008);
  // The little rosebud mouth, smiling, with dimples.
  fillShape(ctx, '#cf2f22', [
    [-0.11, -0.49],
    [-0.05, -0.46],
    [0, -0.475],
    [0.05, -0.46],
    [0.11, -0.49],
    [0.05, -0.55],
    [-0.05, -0.55],
  ]);
  brush(ctx, '#5a1810', [-0.1, -0.49], [0, -0.515], [0.1, -0.49], 2.4);
  for (const s of [-1, 1]) brush(ctx, 'rgba(150,70,60,0.55)', [s * 0.13, -0.47], [s * 0.16, -0.5], [s * 0.14, -0.54], 2.4);
}

function paintHyottoko(ctx: Ctx, shape: MaskShape): void {
  gradientBase(ctx, '#f3d8aa', '#e6c08a', '#b48250', 0.1);
  bakeShading(ctx, shape, 0.95);
  // The puffed cheeks catch the light; the nose is red from the coals.
  for (const s of [-1, 1]) blob(ctx, 'rgba(214,96,70,0.32)', s * 0.44, -0.32, 0.18, 0.16, 50);
  blob(ctx, 'rgba(206,64,44,0.6)', 0, -0.06, 0.08, 0.07, 22);
  // Tenugui tied over the head: indigo with white dots.
  const band = (x: number) => 0.6 + 0.08 * x * x;
  ctx.save();
  ctx.fillStyle = '#284a86';
  ctx.beginPath();
  ctx.moveTo(X(-1.1), Y(band(-1.1)));
  for (let x = -1.1; x <= 1.1; x += 0.05) ctx.lineTo(X(x), Y(band(x)));
  ctx.lineTo(X(1.1), Y(1.2));
  ctx.lineTo(X(-1.1), Y(1.2));
  ctx.closePath();
  ctx.fill();
  ctx.clip();
  const r = rng(77);
  ctx.fillStyle = 'rgba(240,236,226,0.92)';
  for (let row = 0; row < 6; row++) {
    for (let col = -8; col <= 8; col++) {
      const x = col * 0.13 + (row % 2) * 0.065;
      const y = 0.66 + row * 0.07;
      ctx.beginPath();
      ctx.arc(X(x + (r() - 0.5) * 0.01), Y(y), L(0.016), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  brush(ctx, 'rgba(10,20,40,0.45)', [-1, band(-1) - 0.01], [0, band(0) - 0.02], [1, band(1) - 0.01], 4);
  // Brows raised in alarm, one higher than the other.
  brush(ctx, '#1a1009', [-0.5, 0.3], [-0.34, 0.48], [-0.12, 0.38], 9, [0.5, 0.8]);
  brush(ctx, '#1a1009', [0.12, 0.36], [0.32, 0.44], [0.48, 0.34], 8, [0.8, 0.5]);
  for (let k = 0; k < 3; k++) brush(ctx, 'rgba(120,70,40,0.45)', [-0.3, 0.48 + k * 0.035], [0, 0.52 + k * 0.035], [0.3, 0.48 + k * 0.035], 2);
  // Mismatched eyes: one wide and round, one squeezed small.
  ellipse(ctx, '#160d07', -0.32, 0.14, 0.13, 0.12);
  ellipse(ctx, '#f6efe0', -0.32, 0.14, 0.1, 0.095);
  ellipse(ctx, '#160d07', -0.28, 0.13, 0.05, 0.05);
  ellipse(ctx, '#160d07', 0.3, 0.2, 0.09, 0.055);
  ellipse(ctx, '#f6efe0', 0.3, 0.2, 0.065, 0.035);
  ellipse(ctx, '#160d07', 0.27, 0.2, 0.03, 0.03);
  // Pucker lines around the pushed-out mouth.
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    brush(
      ctx,
      'rgba(110,60,36,0.5)',
      [0.22 + Math.cos(a) * 0.08, -0.48 + Math.sin(a) * 0.08],
      [0.22 + Math.cos(a) * 0.12, -0.48 + Math.sin(a) * 0.12],
      [0.22 + Math.cos(a) * 0.17, -0.48 + Math.sin(a) * 0.15],
      2.2,
    );
  }
  for (const s of [-1, 1]) ellipse(ctx, 'rgba(80,30,20,0.6)', s * 0.04, -0.13, 0.018, 0.012);
}

function paintEbisu(ctx: Ctx, shape: MaskShape): void {
  gradientBase(ctx, '#f6d9a2', '#e7b97c', '#b47a45', 0.1);
  bakeShading(ctx, shape, 0.9);
  for (const s of [-1, 1]) blob(ctx, 'rgba(226,104,80,0.42)', s * 0.46, -0.13, 0.18, 0.15, 50);
  blob(ctx, 'rgba(214,100,70,0.35)', 0, -0.05, 0.09, 0.08, 24);
  // Hair under the hat.
  fillShape(ctx, '#17100a', [
    [-1.1, 0.6],
    [-0.6, 0.8],
    [0, 0.84],
    [0.6, 0.8],
    [1.1, 0.6],
    [1.1, 1.2],
    [-1.1, 1.2],
  ]);
  // Big arched brows and eyes squeezed shut with laughing.
  for (const s of [-1, 1]) {
    brush(ctx, '#1b120a', [s * 0.14, 0.38], [s * 0.3, 0.52], [s * 0.5, 0.4], 12, [0.6, 0.9]);
    smileEye(ctx, s * 0.32, 0.17, 0.26, 0.07, 7);
    // Laugh lines.
    for (let k = 0; k < 3; k++) brush(ctx, 'rgba(120,64,30,0.55)', [s * 0.47, 0.17 - k * 0.04], [s * 0.53, 0.16 - k * 0.05], [s * 0.58, 0.12 - k * 0.07], 2);
  }
  for (const s of [-1, 1]) ellipse(ctx, 'rgba(70,28,16,0.75)', s * 0.06, -0.13, 0.025, 0.016);
  // The open laughing mouth: upper teeth, a red tongue.
  const mouth: P[] = [
    [-0.32, -0.4],
    [0, -0.39],
    [0.32, -0.4],
    [0.2, -0.58],
    [0, -0.62],
    [-0.2, -0.58],
  ];
  fillShape(ctx, '#3a0d08', mouth);
  fillShape(ctx, '#b4382a', [
    [-0.14, -0.55],
    [0, -0.5],
    [0.14, -0.55],
    [0, -0.6],
  ]);
  fillShape(ctx, '#f4ecdc', [
    [-0.26, -0.405],
    [0, -0.4],
    [0.26, -0.405],
    [0.2, -0.45],
    [0, -0.455],
    [-0.2, -0.45],
  ]);
  brush(ctx, '#8a2a1c', [-0.34, -0.39], [0, -0.36], [0.34, -0.39], 4);
  // A thin moustache and a tuft of beard.
  for (const s of [-1, 1]) brush(ctx, '#1b120a', [s * 0.04, -0.33], [s * 0.22, -0.31], [s * 0.38, -0.42], 5, [0.4, 1]);
  for (let k = -3; k <= 3; k++) brush(ctx, '#1b120a', [k * 0.03, -0.72], [k * 0.035, -0.8], [k * 0.045, -0.9], 3, [0.3, 1]);
}

function paintKitsune(ctx: Ctx, shape: MaskShape): void {
  gradientBase(ctx, '#fffdf8', '#f6f1e6', '#d6ccba', 0.2);
  bakeShading(ctx, shape, 1);
  const red = '#d22f1f';
  // Flames rising from the brows toward the ears, and the gold jewel.
  for (const s of [-1, 1]) {
    brush(ctx, red, [s * 0.06, 0.38], [s * 0.12, 0.62], [s * 0.38, 0.86], 12, [0.4, 1]);
    brush(ctx, red, [s * 0.16, 0.38], [s * 0.3, 0.5], [s * 0.52, 0.7], 8, [0.4, 1]);
    brush(ctx, red, [s * 0.26, 0.36], [s * 0.42, 0.42], [s * 0.62, 0.56], 5, [0.4, 1]);
  }
  fillShape(ctx, PALETTE.kin, [
    [0, 0.72],
    [0.045, 0.6],
    [0, 0.46],
    [-0.045, 0.6],
  ]);
  ellipse(ctx, red, 0, 0.6, 0.016, 0.03);
  // Eyes: slanted almonds lined in red and gold, sweeping up and out.
  for (const s of [-1, 1]) {
    brush(ctx, red, [s * 0.18, 0.15], [s * 0.36, 0.13], [s * 0.6, 0.32], 11, [0.3, 1]);
    almond(ctx, PALETTE.kin, s * 0.33, 0.2, 0.3, 0.1, 0.35, s);
    almond(ctx, '#0b0806', s * 0.33, 0.2, 0.25, 0.075, 0.35, s);
  }
  // The muzzle: a black nose at the tip, a red grin along each side.
  ellipse(ctx, '#120c09', 0, -0.74, 0.085, 0.05);
  ellipse(ctx, 'rgba(255,255,255,0.35)', -0.025, -0.725, 0.025, 0.012);
  for (const s of [-1, 1]) {
    brush(ctx, red, [0, -0.8], [s * 0.1, -0.9], [s * 0.26, -0.56], 4.5, [0.6, 0.3]);
    for (let k = 0; k < 3; k++) ellipse(ctx, red, s * (0.13 + k * 0.035), -0.58 + k * 0.03, 0.012, 0.012);
    // Cheek swirls.
    brush(ctx, 'rgba(210,47,31,0.75)', [s * 0.4, 0.02], [s * 0.5, -0.12], [s * 0.4, -0.26], 5, [0.4, 0.6]);
  }
}

function paintTengu(ctx: Ctx, shape: MaskShape): void {
  gradientBase(ctx, '#e04a32', '#bf3220', '#701810', 0.15);
  bakeShading(ctx, shape, 1);
  // Furrows in the brow.
  for (let k = 0; k < 4; k++) brush(ctx, 'rgba(80,10,6,0.55)', [-0.36, 0.56 + k * 0.06], [0, 0.6 + k * 0.06 - 0.04], [0.36, 0.56 + k * 0.06], 3);
  // Wild black brows, angled down to the nose.
  const r = rng(31);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 14; k++) {
      const j = r();
      brush(ctx, '#0e0805', [s * (0.06 + j * 0.06), 0.3 + j * 0.04], [s * (0.26 + r() * 0.06), 0.44 + r() * 0.06], [s * (0.5 + r() * 0.12), 0.5 + r() * 0.12], 3 + r() * 3, [0.3, 1]);
    }
  }
  // Gold eyes, glaring.
  for (const s of [-1, 1]) {
    almond(ctx, '#160a06', s * 0.32, 0.2, 0.3, 0.13, -0.2, s);
    almond(ctx, '#f0c45c', s * 0.32, 0.2, 0.25, 0.1, -0.2, s);
    ellipse(ctx, '#0a0604', s * 0.31, 0.205, 0.04, 0.045);
  }
  // White moustache and beard.
  for (const s of [-1, 1]) {
    for (let k = 0; k < 9; k++) {
      brush(ctx, '#f2ece0', [s * 0.06, -0.3], [s * (0.24 + k * 0.02), -0.3 - k * 0.01], [s * (0.42 + k * 0.03), -0.5 - k * 0.04], 3.5, [0.3, 1]);
    }
  }
  for (let k = -6; k <= 6; k++) brush(ctx, '#ece4d4', [k * 0.04, -0.62], [k * 0.05, -0.8], [k * 0.07 + (r() - 0.5) * 0.05, -1.05], 4, [0.3, 1]);
  fillShape(ctx, '#2a0a06', [
    [-0.2, -0.5],
    [0, -0.48],
    [0.2, -0.5],
    [0, -0.56],
  ]);
  // Hair at the crown.
  hairStrands(ctx, 9, 30, [-0.9, 0.9], [0.12, 0.25], '#0e0805', 5);
}

function paintHannya(ctx: Ctx, shape: MaskShape): void {
  gradientBase(ctx, '#f4ead0', '#e3d3ac', '#9c8a5c', 0.2);
  bakeShading(ctx, shape, 1);
  // Hollow cheeks with a sick green-gold shade, red-brown around the eyes.
  for (const s of [-1, 1]) {
    blob(ctx, 'rgba(110,110,40,0.35)', s * 0.5, -0.34, 0.14, 0.16, 50);
    blob(ctx, 'rgba(150,40,20,0.55)', s * 0.3, 0.2, 0.2, 0.13, 30);
  }
  // Disheveled hair across the brow.
  hairStrands(ctx, 3, 26, [-0.7, 0.7], [0.3, 0.5], '#120905', 3);
  // Knotted brows, high in the middle with grief.
  for (const s of [-1, 1]) {
    brush(ctx, '#160b06', [s * 0.48, 0.36], [s * 0.3, 0.4], [s * 0.1, 0.56], 9, [0.6, 0.8]);
    brush(ctx, 'rgba(22,11,6,0.6)', [s * 0.42, 0.42], [s * 0.26, 0.46], [s * 0.08, 0.62], 4);
  }
  // Gold eyes with black pupils.
  for (const s of [-1, 1]) {
    almond(ctx, '#2a0c06', s * 0.3, 0.2, 0.3, 0.15, 0.15, s);
    almond(ctx, '#e7c35e', s * 0.3, 0.2, 0.26, 0.12, 0.15, s);
    ellipse(ctx, 'rgba(255,240,190,0.7)', s * 0.28, 0.23, 0.05, 0.02);
    ellipse(ctx, '#0b0604', s * 0.3, 0.2, 0.045, 0.05);
  }
  for (const s of [-1, 1]) ellipse(ctx, '#2a0c06', s * 0.07, -0.18, 0.04, 0.025, s * 0.4);
  // The mouth, torn to the ears.
  const M = HANNYA_MOUTH;
  const pts: P[] = [];
  for (let i = 0; i <= 24; i++) {
    const x = -M.half + (2 * M.half * i) / 24;
    pts.push([x, M.top(x)]);
  }
  for (let i = 24; i >= 0; i--) {
    const x = -M.half + (2 * M.half * i) / 24;
    pts.push([x, M.bottom(x)]);
  }
  const trace = (dy: (i: number) => number) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y + dy(i))) : ctx.moveTo(X(x), Y(y + dy(i)))));
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = '#9e1f14';
  trace((i) => (i <= 24 ? 0.035 : -0.035));
  ctx.fillStyle = '#1a0503';
  trace(() => 0);
  // Teeth, top and bottom, and four gold fangs.
  for (let k = -4; k <= 4; k++) {
    const x = k * 0.07;
    ctx.fillStyle = '#efe6cf';
    ctx.fillRect(X(x - 0.03), Y(M.top(x) - 0.005), L(0.058), L(0.07));
    ctx.fillRect(X(x - 0.03), Y(M.bottom(x) + 0.065), L(0.058), L(0.065));
  }
  for (const s of [-1, 1]) {
    const xt = s * 0.38;
    fillShape(ctx, PALETTE.kin, [
      [xt - 0.04, M.top(xt) - 0.01],
      [xt + 0.04, M.top(xt) - 0.01],
      [xt + s * 0.01, M.top(xt) - 0.2],
    ]);
    const xb = s * 0.3;
    const yb = M.bottom(xb);
    fillShape(ctx, PALETTE.kin, [
      [xb - 0.035, yb],
      [xb + 0.035, yb],
      [xb - s * 0.01, yb + 0.17],
    ]);
  }
}

function paintOkina(ctx: Ctx, shape: MaskShape): void {
  gradientBase(ctx, '#fffaf0', '#f2e9d6', '#cdbd9c', 0.2);
  bakeShading(ctx, shape, 0.95);
  for (const s of [-1, 1]) blob(ctx, 'rgba(224,128,110,0.28)', s * 0.44, -0.14, 0.17, 0.14, 50);
  // Forehead wrinkles, and the creases of a long smile.
  for (let k = 0; k < 4; k++) {
    const y = 0.5 + k * 0.075;
    brush(ctx, 'rgba(120,86,50,0.6)', [-0.4 + k * 0.03, y - 0.03], [0, y + 0.03], [0.4 - k * 0.03, y - 0.03], 2.6);
  }
  for (const s of [-1, 1]) {
    brush(ctx, 'rgba(120,80,46,0.6)', [s * 0.13, -0.08], [s * 0.3, -0.24], [s * 0.3, -0.48], 3);
    brush(ctx, 'rgba(120,80,46,0.45)', [s * 0.42, 0.06], [s * 0.6, -0.04], [s * 0.66, -0.2], 2.4);
    // Crescent eyes, smiling.
    smileEye(ctx, s * 0.3, 0.13, 0.25, 0.06, 6);
    brush(ctx, 'rgba(120,80,46,0.5)', [s * 0.18, 0.08], [s * 0.3, 0.04], [s * 0.42, 0.08], 2);
    // Soft shadow under the brow tufts.
    blob(ctx, 'rgba(120,90,60,0.35)', s * 0.3, 0.36, 0.11, 0.04, 16);
  }
  // Open smile with a few teeth.
  fillShape(ctx, '#2a1208', [
    [-0.26, -0.38],
    [0, -0.36],
    [0.26, -0.38],
    [0.14, -0.46],
    [0, -0.48],
    [-0.14, -0.46],
  ]);
  for (const x of [-0.08, 0.02, 0.1]) {
    ctx.fillStyle = '#efe6d0';
    ctx.fillRect(X(x), Y(-0.37), L(0.05), L(0.045));
  }
  // The cut jaw, tied on with cords.
  brush(ctx, 'rgba(70,40,20,0.7)', [-0.6, -0.5], [0, -0.62], [0.6, -0.5], 2.4);
  for (const s of [-1, 1]) ellipse(ctx, '#a8261a', s * 0.58, -0.5, 0.025, 0.025);
  // A thin white moustache.
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) brush(ctx, '#fbf7ef', [s * 0.05, -0.3 - k * 0.01], [s * 0.2, -0.3 - k * 0.012], [s * 0.34, -0.38 - k * 0.02], 2.5, [0.3, 1]);
}

function paintOni(ctx: Ctx, shape: MaskShape): void {
  gradientBase(ctx, '#c83a26', '#a82a1a', '#55100a', 0.1);
  bakeShading(ctx, shape, 1);
  // Black curls at the crown.
  const r = rng(51);
  for (let k = 0; k < 26; k++) {
    const x = (r() - 0.5) * 1.8;
    const y = 0.78 + r() * 0.25;
    ctx.strokeStyle = '#0d0605';
    ctx.lineWidth = 7 + r() * 5;
    ctx.beginPath();
    ctx.arc(X(x), Y(y), L(0.04 + r() * 0.04), r() * 6, r() * 6 + 4);
    ctx.stroke();
  }
  // Brows like a cliff, gold-edged.
  for (const s of [-1, 1]) {
    brush(ctx, '#0d0605', [s * 0.06, 0.32], [s * 0.3, 0.46], [s * 0.58, 0.48], 16, [0.4, 0.8]);
    brush(ctx, 'rgba(201,164,92,0.75)', [s * 0.1, 0.27], [s * 0.3, 0.38], [s * 0.54, 0.4], 2.5);
  }
  for (let k = 0; k < 3; k++) brush(ctx, 'rgba(60,8,4,0.6)', [-0.3, 0.55 + k * 0.07], [0, 0.5 + k * 0.07], [0.3, 0.55 + k * 0.07], 3);
  // Bulging gold eyes.
  for (const s of [-1, 1]) {
    ellipse(ctx, '#140604', s * 0.34, 0.18, 0.14, 0.12);
    ellipse(ctx, '#f2c858', s * 0.34, 0.18, 0.115, 0.1);
    ellipse(ctx, '#0b0403', s * 0.33, 0.17, 0.045, 0.05);
    ellipse(ctx, 'rgba(255,248,210,0.8)', s * 0.31, 0.22, 0.03, 0.015);
  }
  for (const s of [-1, 1]) ellipse(ctx, '#1d0504', s * 0.09, -0.16, 0.05, 0.03, s * 0.3);
  // The snarl.
  fillShape(ctx, '#1a0403', [
    [-0.4, -0.44],
    [0, -0.4],
    [0.4, -0.44],
    [0.3, -0.6],
    [0, -0.64],
    [-0.3, -0.6],
  ]);
  for (let k = -4; k <= 4; k++) {
    ctx.fillStyle = '#f2ead8';
    ctx.fillRect(X(k * 0.07 - 0.03), Y(-0.42), L(0.055), L(0.06));
    ctx.fillRect(X(k * 0.06 - 0.025), Y(-0.56), L(0.048), L(0.05));
  }
  brush(ctx, '#3a0806', [-0.42, -0.43], [0, -0.37], [0.42, -0.43], 5);
}

const PAINTERS: Record<MaskId, (ctx: Ctx, shape: MaskShape) => void> = {
  okame: paintOkame,
  hyottoko: paintHyottoko,
  ebisu: paintEbisu,
  kitsune: paintKitsune,
  tengu: paintTengu,
  hannya: paintHannya,
  okina: paintOkina,
  oni: paintOni,
};

export function maskTexture(id: MaskId): THREE.CanvasTexture {
  return cached(`mask:${id}`, () => {
    const [c, ctx] = makeCanvas(S, S);
    PAINTERS[id](ctx, MASK_SHAPES[id]);
    paperGrain(ctx, S, S, id.length * 31, 0.8);
    inkVoids(ctx, S, S, 'rgba(255,250,240,0.5)', id.length * 13, 160);
    return toTexture(c);
  });
}

/** A small hanko tag with a mask's kanji, for the seats it watches. */
export function maskTagTexture(kanji: string, color: string, ink: string): THREE.CanvasTexture {
  return cached(`masktag:${kanji}:${color}`, () => {
    const N = 128;
    const [c, ctx] = makeCanvas(N, N);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(6, 6, N - 12, N - 12, 14);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(14, 14, N - 28, N - 28, 9);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink;
    ctx.font = `800 76px "Shippori Mincho B1", "Hiragino Mincho ProN", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(kanji, N / 2, N / 2 + 4);
    inkVoids(ctx, N, N, 'rgba(255,255,255,0.4)', kanji.charCodeAt(0), 40);
    return toTexture(c);
  });
}

/** The red 見 brand for a seat that was seen. */
export function seenTexture(): THREE.CanvasTexture {
  return cached('seen', () => {
    const N = 256;
    const [c, ctx] = makeCanvas(N, N);
    ctx.translate(N / 2, N / 2);
    ctx.rotate(-0.08);
    ctx.strokeStyle = '#e0301f';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.roundRect(-N * 0.4, -N * 0.4, N * 0.8, N * 0.8, 18);
    ctx.stroke();
    ctx.fillStyle = '#e0301f';
    ctx.font = `800 150px "Shippori Mincho B1", "Hiragino Mincho ProN", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('見', 0, 8);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Knock riso voids out of the ink, down to the felt.
    ctx.globalCompositeOperation = 'destination-out';
    inkVoids(ctx, N, N, 'rgba(0,0,0,1)', 39, 160);
    return toTexture(c);
  });
}
