// Small painted things: call slips, lacquer tokens, avatar seals, the candle
// flame, smoke, and the House Rule card.

import type * as THREE from 'three';
import { RULES } from '../../../engine/rules';
import type { Avatar, RuleId, Stance } from '../../../engine/types';
import { AVATAR_KANJI, STANCE_INK, STANCE_KANJI } from '../cardInfo';
import { MONO, SERIF } from '../fonts';
import { PALETTE } from '../palette';
import { blurFill, cached, inkVoids, makeCanvas, paperGrain, rng, roundRect, toTexture } from './canvas';

/** A torn washi slip stamped with one call: 降 fold, 待 stay, 攻 raise, 伏 hidden. */
export function stampTexture(stance: Stance | 'hidden'): THREE.CanvasTexture {
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

/** Top face of a vermilion lacquer stake token, stamped 円 in gold. */
export function tokenTexture(): THREE.CanvasTexture {
  return cached('token', () => {
    const S = 128;
    const [c, ctx] = makeCanvas(S, S);
    const g = ctx.createRadialGradient(S * 0.4, S * 0.35, 4, S / 2, S / 2, S / 2);
    g.addColorStop(0, '#e2563a');
    g.addColorStop(1, '#9e2a17');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = PALETTE.kin;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.kin;
    ctx.font = `800 64px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('円', S / 2, S / 2 + 4);
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

/** Rule card ink colour by kind: boons in gold, banes in shu, wild in teal. */
export function ruleInk(id: RuleId): string {
  const kind = RULES[id].kind;
  return kind === 'boon' ? PALETTE.kin : kind === 'bane' ? PALETTE.neon : PALETTE.teal;
}

/** Face of the tall House Rule card: black lacquer, a glowing kanji, the name in mono. */
export function ruleTexture(id: RuleId): THREE.CanvasTexture {
  return cached(`rule:${id}`, () => {
    const W = 320;
    const H = 560;
    const [c, ctx] = makeCanvas(W, H);
    const info = RULES[id];
    const ink = ruleInk(id);
    roundRect(ctx, 3, 3, W - 6, H - 6, 22);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#100d0b';
    ctx.fillRect(0, 0, W, H);
    paperGrain(ctx, W, H, 21, 0.6);
    ctx.strokeStyle = PALETTE.kin;
    ctx.lineWidth = 3;
    roundRect(ctx, 18, 18, W - 36, H - 36, 14);
    ctx.stroke();
    ctx.lineWidth = 1;
    roundRect(ctx, 26, 26, W - 52, H - 52, 10);
    ctx.stroke();
    ctx.fillStyle = PALETTE.kin;
    ctx.font = `600 18px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('H O U S E   R U L E', W / 2, 62);
    // The kanji, glowing.
    ctx.font = `800 220px ${SERIF}`;
    for (const [blur, alpha] of [
      [36, 0.8],
      [12, 1],
      [0, 1],
    ] as const) {
      ctx.save();
      ctx.shadowColor = ink;
      ctx.shadowBlur = blur;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = blur === 0 ? '#fff4ea' : ink;
      ctx.fillText(info.kanji, W / 2, H * 0.47);
      ctx.restore();
    }
    ctx.fillStyle = PALETTE.washi;
    ctx.font = `800 40px ${SERIF}`;
    ctx.fillText(info.name, W / 2, H * 0.76);
    ctx.fillStyle = ink;
    ctx.font = `600 18px ${MONO}`;
    ctx.fillText(info.romaji.toUpperCase().split('').join(' '), W / 2, H * 0.84);
    ctx.restore();
    return toTexture(c);
  });
}

/** Back of the House Rule card: lacquer with a gold 掟 (the House's law). */
export function ruleBackTexture(): THREE.CanvasTexture {
  return cached('rule:back', () => {
    const W = 320;
    const H = 560;
    const [c, ctx] = makeCanvas(W, H);
    roundRect(ctx, 3, 3, W - 6, H - 6, 22);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#120e0c';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = PALETTE.kin;
    ctx.lineWidth = 3;
    roundRect(ctx, 18, 18, W - 36, H - 36, 14);
    ctx.stroke();
    ctx.fillStyle = PALETTE.kin;
    ctx.font = `800 150px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('掟', W / 2, H / 2);
    ctx.restore();
    return toTexture(c);
  });
}
