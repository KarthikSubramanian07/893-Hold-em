// Small painted things: In/Out slips, avatar seals, the candle flame, smoke.

import type * as THREE from 'three';
import type { Avatar, Stance } from '../../../engine/types';
import { AVATAR_KANJI, STANCE_INK, STANCE_KANJI } from '../cardInfo';
import { SERIF } from '../fonts';
import { PALETTE } from '../palette';
import { blurFill, cached, inkVoids, makeCanvas, paperGrain, rng, roundRect, toTexture } from './canvas';

/** A torn washi slip stamped 入 In or 出 Out. */
export function stampTexture(stance: Stance): THREE.CanvasTexture {
  return cached(`stamp:${stance}`, () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    const r = rng(stance.length * 97);
    // Torn paper edge.
    ctx.beginPath();
    const n = 36;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sq = 1 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
      const rad = 104 * Math.min(sq, 1.32) + (r() - 0.5) * 6;
      const x = S / 2 + Math.cos(a) * rad;
      const y = S / 2 + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#efe6d3';
    ctx.fill();
    ctx.save();
    ctx.clip();
    paperGrain(ctx, S, S, 5, 1.5);
    const ink = STANCE_INK[stance];
    ctx.translate(S / 2, S / 2);
    ctx.rotate((r() - 0.5) * 0.2);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 9;
    roundRect(ctx, -78, -78, 156, 156, 14);
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.font = `800 128px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(STANCE_KANJI[stance], 0, 8);
    ctx.restore();
    inkVoids(ctx, S, S, '#efe6d3', 31 + stance.length, 160);
    return toTexture(c);
  });
}

/** The carved face of a round avatar seal: washi kanji raised out of shu. */
export function sealTexture(avatar: Avatar | null): THREE.CanvasTexture {
  return cached(`seal:${avatar ?? 'none'}`, () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    ctx.fillStyle = avatar ? PALETTE.shu : '#3a3530';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#f2e6d0';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    if (avatar) {
      ctx.fillStyle = '#f2e6d0';
      ctx.font = `800 140px ${SERIF}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(AVATAR_KANJI[avatar], S / 2, S / 2 + 10);
    }
    inkVoids(ctx, S, S, avatar ? PALETTE.shu : '#3a3530', 77, 120);
    return toTexture(c);
  });
}

/** A candle flame: hot white core to amber edge. */
export function flameTexture(): THREE.CanvasTexture {
  return cached('flame', () => {
    const W = 64;
    const H = 128;
    const [c, ctx] = makeCanvas(W, H);
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(W / 2, 8);
      ctx.bezierCurveTo(W * 0.78, H * 0.45, W * 0.82, H * 0.8, W / 2, H - 10);
      ctx.bezierCurveTo(W * 0.18, H * 0.8, W * 0.22, H * 0.45, W / 2, 8);
    };
    blurFill(ctx, 14, 'rgba(255,150,50,0.9)', shape);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,200,120,0)');
    g.addColorStop(0.45, 'rgba(255,230,180,0.9)');
    g.addColorStop(0.85, 'rgba(255,255,240,1)');
    g.addColorStop(1, 'rgba(120,160,255,0.6)');
    ctx.save();
    ctx.translate(W / 2, H * 0.62);
    ctx.scale(0.55, 0.62);
    ctx.translate(-W / 2, -H * 0.62);
    shape();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    return toTexture(c, { srgb: false });
  });
}

/** A wisp of smoke: soft overlapping blobs. */
export function smokeTexture(): THREE.CanvasTexture {
  return cached('smoke', () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    const r = rng(99);
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.pow(r(), 0.7) * S * 0.24;
      const rad = 14 + r() * 34;
      blurFill(ctx, rad, `rgba(255,255,255,${0.12 + r() * 0.18})`, () => {
        ctx.beginPath();
        ctx.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, rad * 0.6, 0, Math.PI * 2);
      });
    }
    return toTexture(c, { srgb: false });
  });
}

