// Big painted surfaces: the indigo sashiko felt, the gold-flecked urushi, the
// board slot outlines, the lantern's washi, and the neon signs outside.

import * as THREE from 'three';
import { SERIF } from '../fonts';
import { PALETTE } from '../palette';
import { blurFill, cached, makeCanvas, paperGrain, rng, roundRect, toTexture } from './canvas';

/** Felt tile size. Height is eight asanoha rows so the tile repeats cleanly. */
export const FELT_TILE = { w: 1024, h: Math.round(8 * 128 * (Math.sqrt(3) / 2)) };

/** Ai-zome indigo with an asanoha (hemp-leaf) sashiko stitch. */
export function feltTexture(): THREE.CanvasTexture {
  return cached('felt', () => {
    const { w, h } = FELT_TILE;
    const [c, ctx] = makeCanvas(w, h);
    const r = rng(42);
    ctx.fillStyle = '#20385a';
    ctx.fillRect(0, 0, w, h);
    // Uneven dye: big soft blotches, painted small (cheap blur) and scaled up,
    // tiled 3×3 so the felt stays seamless.
    const [m, mctx] = makeCanvas(w / 8, h / 8);
    const mw = m.width;
    const mh = m.height;
    for (let i = 0; i < 46; i++) {
      const x = r() * mw;
      const y = r() * mh;
      const rad = 8 + r() * 26;
      const dark = r() > 0.45;
      const col = dark ? `rgba(10,22,44,${0.12 + r() * 0.18})` : `rgba(70,110,150,${0.05 + r() * 0.08})`;
      for (const ox of [-mw, 0, mw])
        for (const oy of [-mh, 0, mh]) {
          if (x + ox < -rad || x + ox > mw + rad || y + oy < -rad || y + oy > mh + rad) continue;
          blurFill(mctx, rad * 0.8, col, () => {
            mctx.beginPath();
            mctx.arc(x + ox, y + oy, rad * 0.5, 0, Math.PI * 2);
          });
        }
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(m, 0, 0, w, h);
    // Weave: fine cross threads.
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = '#9fb6d6';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 3) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.035;
    for (let x = 0; x < w; x += 3) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Asanoha: a triangular grid plus a spoke from every corner to the centre.
    const s = 128;
    const rowH = (s * Math.sqrt(3)) / 2;
    ctx.lineCap = 'round';
    ctx.setLineDash([9, 8]);
    const stitch = (pass: number) => {
      ctx.strokeStyle = pass === 0 ? 'rgba(5,12,26,0.6)' : 'rgba(232,226,210,0.42)';
      ctx.lineWidth = pass === 0 ? 3.2 : 2.1;
      const off = pass === 0 ? 1.2 : 0;
      ctx.beginPath();
      for (let row = -1; row <= 9; row++) {
        const y0 = row * rowH + off;
        const shift = row % 2 === 0 ? 0 : s / 2;
        for (let col = -2; col <= w / s + 2; col++) {
          const x0 = col * s + shift + off;
          // Up-pointing triangle (x0,y0+rowH) (x0+s,y0+rowH) (x0+s/2,y0)
          const tri = [
            [
              [x0, y0 + rowH],
              [x0 + s, y0 + rowH],
              [x0 + s / 2, y0],
            ],
            [
              [x0 + s / 2, y0],
              [x0 + s * 1.5, y0],
              [x0 + s, y0 + rowH],
            ],
          ];
          for (const t of tri) {
            const cx = (t[0]![0]! + t[1]![0]! + t[2]![0]!) / 3;
            const cy = (t[0]![1]! + t[1]![1]! + t[2]![1]!) / 3;
            for (const p of t) {
              ctx.moveTo(p[0]!, p[1]!);
              ctx.lineTo(cx, cy);
            }
          }
          ctx.moveTo(x0, y0 + rowH);
          ctx.lineTo(x0 + s, y0 + rowH);
          ctx.moveTo(x0 + s, y0 + rowH);
          ctx.lineTo(x0 + s / 2, y0);
        }
      }
      ctx.stroke();
    };
    stitch(0);
    stitch(1);
    ctx.setLineDash([]);
    return toTexture(c, { repeat: [1, 1] });
  });
}

/** Black urushi with nashiji gold flecks and a fine maki-e line near the edge. */
export function lacquerTexture(): THREE.CanvasTexture {
  return cached('lacquer', () => {
    const w = 2048;
    const h = 1264;
    const [c, ctx] = makeCanvas(w, h);
    const r = rng(7);
    ctx.fillStyle = PALETTE.urushi;
    ctx.fillRect(0, 0, w, h);
    // A faint warm depth in the lacquer.
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.55);
    g.addColorStop(0, 'rgba(40,18,10,0.0)');
    g.addColorStop(1, 'rgba(46,20,12,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const ell = (k: number) => {
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, (w / 2) * k, (h / 2) * k, 0, 0, Math.PI * 2);
    };
    // Gold dust thickens toward the rim.
    for (let i = 0; i < 9000; i++) {
      const a = r() * Math.PI * 2;
      const k = 0.8 + Math.pow(r(), 0.6) * 0.2;
      const x = w / 2 + Math.cos(a) * (w / 2) * k;
      const y = h / 2 + Math.sin(a) * (h / 2) * k;
      ctx.fillStyle = `rgba(214,176,98,${0.15 + r() * 0.55})`;
      const s = 0.8 + r() * 1.8;
      ctx.fillRect(x, y, s, s);
    }
    ctx.strokeStyle = PALETTE.kin;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3;
    ell(0.965);
    ctx.stroke();
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.5;
    ell(0.945);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Maki-e: drifting autumn grasses on four quarters of the rim.
    ctx.strokeStyle = 'rgba(214,180,104,0.75)';
    ctx.lineCap = 'round';
    for (const base of [0.6, 2.55, 3.75, 5.7]) {
      for (let j = 0; j < 7; j++) {
        const a = base + (r() - 0.5) * 0.35;
        const k0 = 0.86;
        const x0 = w / 2 + Math.cos(a) * (w / 2) * k0;
        const y0 = h / 2 + Math.sin(a) * (h / 2) * k0;
        const len = 40 + r() * 70;
        const bend = (r() - 0.5) * 60;
        ctx.lineWidth = 1.5 + r() * 1.5;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(x0 + bend, y0 - len * 0.6, x0 + bend * 1.6, y0 - len);
        ctx.stroke();
      }
    }
    return toTexture(c);
  });
}

/** Five dashed gold slots on the felt where the board cards land. */
export function boardSlotsTexture(): THREE.CanvasTexture {
  return cached('slots', () => {
    const W = 1024;
    const H = 288;
    const [c, ctx] = makeCanvas(W, H);
    const ppu = W / 3.2;
    ctx.strokeStyle = 'rgba(201,164,92,0.55)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 9]);
    for (let i = 0; i < 5; i++) {
      const cx = W / 2 + (i - 2) * 0.6 * ppu;
      const cw = 0.52 * ppu;
      const ch = 0.72 * ppu;
      roundRect(ctx, cx - cw / 2, H / 2 - ch / 2, cw, ch, 12);
      ctx.stroke();
    }
    return toTexture(c);
  });
}

/** The chōchin's washi: warm paper, bamboo ribs, a big inked 酒 on the front. */
export function lanternTexture(): THREE.CanvasTexture {
  return cached('lantern', () => {
    const w = 1024;
    const h = 512;
    const [c, ctx] = makeCanvas(w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#f0b45e');
    g.addColorStop(0.5, '#ffe2a8');
    g.addColorStop(1, '#eea552');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    paperGrain(ctx, w, h, 3, 2.5);
    // Vermilion bands at the top and bottom.
    ctx.fillStyle = 'rgba(190,40,22,0.9)';
    ctx.fillRect(0, 0, w, 46);
    ctx.fillRect(0, h - 46, w, 46);
    // Ribs.
    for (let y = 8; y < h; y += 19) {
      ctx.fillStyle = 'rgba(90,40,10,0.28)';
      ctx.fillRect(0, y, w, 3);
      ctx.fillStyle = 'rgba(255,240,200,0.25)';
      ctx.fillRect(0, y + 3, w, 2);
    }
    // Front: 酒. Back: 八九三, written top to bottom.
    ctx.fillStyle = 'rgba(24,16,10,0.92)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 300px ${SERIF}`;
    ctx.fillText('酒', w * 0.5, h * 0.53);
    ctx.font = `800 104px ${SERIF}`;
    ['八', '九', '三'].forEach((k, i) => {
      ctx.fillText(k, 0, 130 + i * 118);
      ctx.fillText(k, w, 130 + i * 118);
    });
    return toTexture(c);
  });
}

/**
 * The neon signs across the street. Each colour channel is one sign group so
 * the window shader can tint and flicker them independently:
 * red = pink 八九三, green = teal バー, blue = red-orange 麻雀 and スナック.
 */
export function neonTexture(): THREE.CanvasTexture {
  return cached('neon', () => {
    const w = 1024;
    const h = 512;
    const [c, ctx] = makeCanvas(w, h);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const sign = (
      color: string,
      text: string[],
      x: number,
      y: number,
      size: number,
      vertical: boolean,
      box: [number, number, number, number],
    ) => {
      // The sign's box, faintly lit.
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = color;
      roundRect(ctx, ...box, 10);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      roundRect(ctx, ...box, 10);
      ctx.stroke();
      ctx.restore();
      ctx.font = `800 ${size}px ${SERIF}`;
      for (const [blur, alpha] of [
        [40, 0.6],
        [14, 0.9],
        [0, 1],
      ] as const) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        text.forEach((t, i) => {
          if (vertical) ctx.fillText(t, x, y + i * size * 1.02);
          else ctx.fillText(t, x, y);
        });
        ctx.restore();
      }
    };
    sign('rgb(255,0,0)', ['八', '九', '三'], 840, 120, 116, true, [770, 40, 140, 400]);
    sign('rgb(0,255,0)', ['バー'], 560, 300, 96, false, [450, 244, 220, 112]);
    sign('rgb(0,0,255)', ['麻', '雀'], 96, 190, 92, true, [42, 120, 108, 238]);
    sign('rgb(0,0,255)', ['スナック'], 330, 96, 64, false, [196, 52, 268, 88]);
    sign('rgb(0,255,0)', ['営業中'], 560, 392, 34, false, [492, 368, 136, 48]);
    return toTexture(c, { srgb: false });
  });
}
