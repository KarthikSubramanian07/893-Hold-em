// Card faces and backs, painted once per card and cached. Ivory stock printed
// in two inks (sumi and shu) with a little riso misregistration; the back is
// vermilion seigaiha with a tall "八九三" hanko in the middle.

import type * as THREE from 'three';
import type { Card, Suit } from '../../../engine/types';
import { cardInfo, cardTextureKey } from '../cardInfo';
import { SERIF } from '../fonts';
import { PALETTE } from '../palette';
import { blurFill, cached, inkVoids, makeCanvas, misregister, paperGrain, rng, roundRect, toTexture, type Ctx } from './canvas';

export const CARD_PX = { w: 384, h: 538, r: 30 } as const;
const IVORY = '#f2eadb';

/** Brush-ish suit glyphs on a 100×100 box, centred on (50, 50). */
function suitPath(suit: Suit): Path2D {
  const p = new Path2D();
  switch (suit) {
    case 'h':
      p.moveTo(50, 92);
      p.bezierCurveTo(30, 72, 4, 56, 6, 32);
      p.bezierCurveTo(8, 12, 34, 4, 50, 26);
      p.bezierCurveTo(66, 4, 92, 12, 94, 32);
      p.bezierCurveTo(96, 56, 70, 72, 50, 92);
      break;
    case 'd':
      p.moveTo(50, 4);
      p.quadraticCurveTo(64, 32, 86, 50);
      p.quadraticCurveTo(64, 68, 50, 96);
      p.quadraticCurveTo(36, 68, 14, 50);
      p.quadraticCurveTo(36, 32, 50, 4);
      break;
    case 's':
      p.moveTo(50, 4);
      p.bezierCurveTo(66, 26, 94, 40, 92, 62);
      p.bezierCurveTo(90, 80, 66, 84, 54, 70);
      p.quadraticCurveTo(58, 86, 70, 96);
      p.lineTo(30, 96);
      p.quadraticCurveTo(42, 86, 46, 70);
      p.bezierCurveTo(34, 84, 10, 80, 8, 62);
      p.bezierCurveTo(6, 40, 34, 26, 50, 4);
      break;
    case 'c':
      p.arc(50, 27, 20, 0, Math.PI * 2);
      p.moveTo(47, 57);
      p.arc(27, 57, 20, 0, Math.PI * 2);
      p.moveTo(93, 57);
      p.arc(73, 57, 20, 0, Math.PI * 2);
      p.moveTo(46, 50);
      p.quadraticCurveTo(48, 82, 32, 96);
      p.lineTo(68, 96);
      p.quadraticCurveTo(52, 82, 54, 50);
      p.closePath();
      break;
  }
  return p;
}

function drawSuit(ctx: Ctx, suit: Suit, cx: number, cy: number, size: number, ink: string): void {
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 100, size / 100);
  ctx.fillStyle = ink;
  ctx.fill(suitPath(suit));
  ctx.restore();
}

function cardShape(ctx: Ctx): void {
  roundRect(ctx, 2, 2, CARD_PX.w - 4, CARD_PX.h - 4, CARD_PX.r);
}

function paintFace(card: Card): HTMLCanvasElement {
  const { w, h } = CARD_PX;
  const info = cardInfo(card);
  const seed = card.charCodeAt(0) * 31 + card.charCodeAt(1);
  const [c, ctx] = makeCanvas(w, h);

  ctx.save();
  cardShape(ctx);
  ctx.clip();
  const g = ctx.createRadialGradient(w * 0.45, h * 0.4, 20, w / 2, h / 2, h * 0.75);
  g.addColorStop(0, '#f7f1e4');
  g.addColorStop(1, '#e4d9c3');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  paperGrain(ctx, w, h, seed, 1.2);

  // Hairline frame.
  ctx.strokeStyle = 'rgba(27,26,23,0.28)';
  ctx.lineWidth = 2;
  roundRect(ctx, 18, 18, w - 36, h - 36, 18);
  ctx.stroke();

  // Big faint kanji behind everything, like a watermark in the stock.
  ctx.save();
  ctx.globalAlpha = info.red ? 0.11 : 0.08;
  ctx.fillStyle = info.ink;
  ctx.font = `800 300px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(info.kanji, w * 0.56, h * 0.6);
  ctx.restore();

  const corner = (flip: boolean) => {
    ctx.save();
    if (flip) {
      ctx.translate(w, h);
      ctx.rotate(Math.PI);
    }
    const size = info.label.length > 1 ? 128 : 150;
    ctx.font = `800 ${size}px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const x = info.label.length > 1 ? 104 : 88;
    misregister(ctx, 4, 3, 0.22, () => {
      ctx.fillStyle = info.ink;
      ctx.fillText(info.label, x, 160);
      drawSuit(ctx, info.suit, x, 212, 62, info.ink);
    });
    ctx.restore();
  };
  corner(false);
  corner(true);

  // Centre suit, large, with the riso double-hit.
  misregister(ctx, 5, 4, 0.2, () => drawSuit(ctx, info.suit, w * 0.56, h * 0.53, 150, info.ink));

  // The little seal: rank kanji in a vermilion square, top right.
  const r = rng(seed);
  ctx.save();
  ctx.translate(w - 66, 70);
  ctx.rotate((r() - 0.5) * 0.12);
  ctx.fillStyle = PALETTE.shu;
  roundRect(ctx, -30, -30, 60, 60, 6);
  ctx.fill();
  ctx.fillStyle = IVORY;
  ctx.font = `800 42px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(info.kanji, 0, 3);
  ctx.restore();

  inkVoids(ctx, w, h, IVORY, seed + 7, 180);
  ctx.restore();
  return c;
}

function paintBack(): HTMLCanvasElement {
  const { w, h } = CARD_PX;
  const [c, ctx] = makeCanvas(w, h);
  ctx.save();
  cardShape(ctx);
  ctx.clip();
  ctx.fillStyle = '#c23a23';
  ctx.fillRect(0, 0, w, h);

  // Seigaiha: overlapping fans of concentric rings, row by row.
  const R = 30;
  ctx.lineWidth = 3;
  for (let row = -1, y = -R; y < h + R * 2; row++, y += R / 2) {
    const off = row % 2 === 0 ? 0 : R;
    for (let x = -R * 2 + off; x < w + R * 2; x += R * 2) {
      for (let k = 4; k >= 1; k--) {
        const rr = (R * k) / 4;
        ctx.beginPath();
        ctx.arc(x, y, rr, Math.PI, 0);
        ctx.fillStyle = k % 2 === 0 ? '#c23a23' : '#b8341f';
        ctx.fill();
        ctx.strokeStyle = 'rgba(244,224,196,0.38)';
        ctx.stroke();
      }
    }
  }
  // Darken toward the edges, then a washi frame.
  const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.7);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(40,6,0,0.35)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(244,228,204,0.9)';
  ctx.lineWidth = 5;
  roundRect(ctx, 20, 20, w - 40, h - 40, 16);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  roundRect(ctx, 30, 30, w - 60, h - 60, 12);
  ctx.stroke();

  // The tall hanko.
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.035);
  ctx.fillStyle = '#f1e7d4';
  roundRect(ctx, -54, -118, 108, 236, 10);
  ctx.fill();
  ctx.strokeStyle = PALETTE.shu;
  ctx.lineWidth = 5;
  roundRect(ctx, -44, -108, 88, 216, 6);
  ctx.stroke();
  ctx.fillStyle = PALETTE.shu;
  ctx.font = `800 64px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ['八', '九', '三'].forEach((k, i) => ctx.fillText(k, 0, -64 + i * 66));
  ctx.restore();

  inkVoids(ctx, w, h, '#e9d6bb', 893, 220);
  ctx.restore();
  return c;
}

/** Blank ivory stock, used for a face we have not seen yet. */
function paintBlank(): HTMLCanvasElement {
  const { w, h } = CARD_PX;
  const [c, ctx] = makeCanvas(w, h);
  cardShape(ctx);
  ctx.clip();
  ctx.fillStyle = IVORY;
  ctx.fillRect(0, 0, w, h);
  paperGrain(ctx, w, h, 11);
  return c;
}

/** Your own card back: the same back with a washi disc and a brushed "?", the one hand you can't read. */
function paintMystery(): HTMLCanvasElement {
  const c = paintBack();
  const ctx = c.getContext('2d')!;
  const { w, h } = CARD_PX;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.beginPath();
  ctx.arc(0, 0, w * 0.26, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(239,230,211,0.96)';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(27,26,23,0.85)';
  ctx.stroke();
  ctx.fillStyle = '#1b1a17';
  ctx.font = `800 ${Math.round(w * 0.36)}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 0, w * 0.02);
  ctx.restore();
  return c;
}

export function cardTexture(slot: Card | 'back' | 'blank' | 'mystery'): THREE.CanvasTexture {
  if (slot === 'blank') return cached('card:blank', () => toTexture(paintBlank()));
  if (slot === 'mystery') return cached('card:mystery', () => toTexture(paintMystery()));
  const key = cardTextureKey(slot)!;
  return cached(`card:${key}`, () => toTexture(slot === 'back' ? paintBack() : paintFace(slot)));
}

/** A soft rounded-rect halo for glowing cards. */
export function cardGlowTexture(): THREE.CanvasTexture {
  return cached('card:glow', () => {
    const [c, ctx] = makeCanvas(256, 320);
    blurFill(ctx, 26, '#fff', () => roundRect(ctx, 52, 52, 152, 216, 22));
    return toTexture(c, { srgb: false });
  });
}
