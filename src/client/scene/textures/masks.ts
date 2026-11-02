// Mask faces, painted in the UV space of the front half of a sphere: u runs
// left to right across the face, v runs from the brow (top) to the chin.

import type * as THREE from 'three';
import { PALETTE } from '../palette';
import { blurFill, cached, inkVoids, makeCanvas, paperGrain, toTexture, type Ctx } from './canvas';

export type MaskKind = 'kitsune' | 'hannya' | 'okame' | 'tengu';
export const MASK_ORDER: MaskKind[] = ['kitsune', 'hannya', 'okame', 'tengu'];

/** Eye centres in face UV (u, v from top), shared with the 3D glow sprites. */
export const MASK_EYES: Record<MaskKind, { u: number; v: number; slit: boolean }> = {
  kitsune: { u: 0.095, v: 0.44, slit: false },
  hannya: { u: 0.1, v: 0.43, slit: false },
  okame: { u: 0.1, v: 0.47, slit: true },
  tengu: { u: 0.1, v: 0.43, slit: false },
};

const S = 512;
const X = (u: number) => u * S;
const Y = (v: number) => v * S;

function base(ctx: Ctx, light: string, dark: string): void {
  const g = ctx.createRadialGradient(X(0.5), Y(0.42), 20, X(0.5), Y(0.5), S * 0.62);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  paperGrain(ctx, S, S, light.length * 17, 1.4);
}

function almond(ctx: Ctx, cx: number, cy: number, w: number, h: number, tilt: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.quadraticCurveTo(0, -h, w / 2, 0);
  ctx.quadraticCurveTo(0, h * 0.8, -w / 2, 0);
  ctx.closePath();
  ctx.restore();
}

function eyes(ctx: Ctx, kind: MaskKind, w: number, h: number, tilt: number, color = '#050403'): void {
  const e = MASK_EYES[kind];
  ctx.fillStyle = color;
  for (const side of [-1, 1]) {
    almond(ctx, X(0.5 + side * e.u), Y(e.v), w, h, side * tilt);
    ctx.fill();
  }
}

function stroke(ctx: Ctx, color: string, width: number, pts: [number, number][]): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([u, v], i) => (i === 0 ? ctx.moveTo(X(u), Y(v)) : ctx.lineTo(X(u), Y(v))));
  ctx.stroke();
  ctx.restore();
}

/** A tapered brush stroke along a quadratic curve. */
function brush(ctx: Ctx, color: string, a: [number, number], ctl: [number, number], b: [number, number], width: number): void {
  ctx.save();
  ctx.fillStyle = color;
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * ctl[0] + t * t * b[0];
    const y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * ctl[1] + t * t * b[1];
    const r = width * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.6;
    ctx.beginPath();
    ctx.arc(X(x), Y(y), r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintKitsune(ctx: Ctx): void {
  base(ctx, '#fbf7ef', '#cfc4b0');
  const red = PALETTE.shu;
  // Flame marks rising from the brows toward the ears.
  for (const s of [-1, 1]) {
    brush(ctx, red, [0.5 + s * 0.03, 0.36], [0.5 + s * 0.09, 0.22], [0.5 + s * 0.2, 0.1], 9);
    brush(ctx, red, [0.5 + s * 0.06, 0.37], [0.5 + s * 0.15, 0.28], [0.5 + s * 0.24, 0.2], 6);
    // Eye liner sweeping up and out.
    brush(ctx, red, [0.5 + s * 0.045, 0.47], [0.5 + s * 0.12, 0.47], [0.5 + s * 0.19, 0.37], 7);
    // Whisker dots.
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = red;
      ctx.beginPath();
      ctx.arc(X(0.5 + s * (0.075 + k * 0.022)), Y(0.62 + k * 0.012), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Gold forehead jewel and lines.
  ctx.fillStyle = PALETTE.kin;
  ctx.beginPath();
  ctx.moveTo(X(0.5), Y(0.18));
  ctx.lineTo(X(0.515), Y(0.25));
  ctx.lineTo(X(0.5), Y(0.32));
  ctx.lineTo(X(0.485), Y(0.25));
  ctx.closePath();
  ctx.fill();
  eyes(ctx, 'kitsune', 52, 22, -0.32);
  // Nose tip and the thin smile.
  ctx.fillStyle = '#1b1310';
  ctx.beginPath();
  ctx.ellipse(X(0.5), Y(0.6), 13, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  stroke(ctx, red, 4, [
    [0.44, 0.7],
    [0.47, 0.73],
    [0.5, 0.715],
    [0.53, 0.73],
    [0.56, 0.7],
  ]);
}

function paintHannya(ctx: Ctx): void {
  base(ctx, '#efe6c6', '#a99c74');
  // Hollowed cheeks.
  for (const s of [-1, 1]) {
    blurFill(ctx, 40, 'rgba(70,50,20,0.45)', () => {
      ctx.beginPath();
      ctx.ellipse(X(0.5 + s * 0.13), Y(0.6), 30, 50, 0, 0, Math.PI * 2);
    });
  }
  // Furrowed brows, angry and high.
  for (const s of [-1, 1]) {
    brush(ctx, '#2a1d12', [0.5 + s * 0.03, 0.36], [0.5 + s * 0.08, 0.27], [0.5 + s * 0.17, 0.3], 7);
    brush(ctx, '#2a1d12', [0.5 + s * 0.02, 0.3], [0.5 + s * 0.05, 0.22], [0.5 + s * 0.11, 0.2], 4);
  }
  // Gold eyes with dark centres.
  eyes(ctx, 'hannya', 58, 30, 0.35, PALETTE.kin);
  eyes(ctx, 'hannya', 26, 18, 0.35);
  // The wide mouth with teeth and fangs.
  ctx.fillStyle = '#2b0d08';
  ctx.beginPath();
  ctx.moveTo(X(0.38), Y(0.7));
  ctx.quadraticCurveTo(X(0.5), Y(0.62), X(0.62), Y(0.7));
  ctx.quadraticCurveTo(X(0.5), Y(0.86), X(0.38), Y(0.7));
  ctx.fill();
  ctx.fillStyle = '#f1ebd9';
  ctx.fillRect(X(0.42), Y(0.69), X(0.16), Y(0.025));
  ctx.fillStyle = PALETTE.kin;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(X(0.5 + s * 0.08), Y(0.69));
    ctx.lineTo(X(0.5 + s * 0.065), Y(0.77));
    ctx.lineTo(X(0.5 + s * 0.05), Y(0.69));
    ctx.fill();
  }
  // Red streaks under the eyes.
  for (const s of [-1, 1]) brush(ctx, 'rgba(180,30,20,0.8)', [0.5 + s * 0.08, 0.5], [0.5 + s * 0.12, 0.55], [0.5 + s * 0.13, 0.62], 4);
}

function paintOkame(ctx: Ctx): void {
  base(ctx, '#fffaf2', '#e2d6c2');
  // Rosy cheeks.
  for (const s of [-1, 1]) {
    blurFill(ctx, 46, 'rgba(232,120,110,0.55)', () => {
      ctx.beginPath();
      ctx.arc(X(0.5 + s * 0.14), Y(0.6), 34, 0, Math.PI * 2);
    });
  }
  // High painted brows (hikimayu): soft ink smudges on the forehead.
  for (const s of [-1, 1]) {
    blurFill(ctx, 14, 'rgba(20,16,12,0.85)', () => {
      ctx.beginPath();
      ctx.ellipse(X(0.5 + s * 0.08), Y(0.25), 20, 9, s * -0.2, 0, Math.PI * 2);
    });
  }
  // Smiling crescent eyes.
  for (const s of [-1, 1]) {
    stroke(ctx, '#140f0b', 7, [
      [0.5 + s * 0.05, 0.47],
      [0.5 + s * 0.1, 0.44],
      [0.5 + s * 0.15, 0.47],
    ]);
  }
  // Tiny red lips.
  ctx.fillStyle = PALETTE.shu;
  ctx.beginPath();
  ctx.ellipse(X(0.5), Y(0.72), 16, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // Forehead dot.
  ctx.fillStyle = PALETTE.shu;
  ctx.beginPath();
  ctx.arc(X(0.5), Y(0.33), 5, 0, Math.PI * 2);
  ctx.fill();
}

function paintTengu(ctx: Ctx): void {
  base(ctx, '#d2402a', '#7a1b10');
  // Bushy black brows.
  for (const s of [-1, 1]) {
    for (let k = 0; k < 9; k++) {
      brush(ctx, '#140c08', [0.5 + s * 0.04, 0.35 + k * 0.004], [0.5 + s * 0.1, 0.27 - k * 0.003], [0.5 + s * (0.18 + k * 0.004), 0.33], 3);
    }
  }
  eyes(ctx, 'tengu', 50, 26, 0.18, PALETTE.kin);
  eyes(ctx, 'tengu', 22, 16, 0.18);
  // Moustache and beard.
  for (const s of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      brush(ctx, '#ece6da', [0.5 + s * 0.01, 0.66], [0.5 + s * (0.08 + k * 0.01), 0.68 + k * 0.01], [0.5 + s * (0.15 + k * 0.012), 0.8 + k * 0.02], 2.4);
    }
  }
  ctx.fillStyle = '#1a0d08';
  ctx.beginPath();
  ctx.ellipse(X(0.5), Y(0.73), 26, 8, 0, 0, Math.PI * 2);
  ctx.fill();
}

const PAINTERS: Record<MaskKind, (ctx: Ctx) => void> = {
  kitsune: paintKitsune,
  hannya: paintHannya,
  okame: paintOkame,
  tengu: paintTengu,
};

export function maskTexture(kind: MaskKind): THREE.CanvasTexture {
  return cached(`mask:${kind}`, () => {
    const [c, ctx] = makeCanvas(S, S);
    PAINTERS[kind](ctx);
    inkVoids(ctx, S, S, 'rgba(255,250,240,0.6)', kind.length * 13, 120);
    return toTexture(c);
  });
}
