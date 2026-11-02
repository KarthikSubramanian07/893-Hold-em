// Small helpers for painting textures on a 2D canvas. Everything 2D in the
// scene is painted here at runtime: no image files, no network.

import * as THREE from 'three';

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

export function toTexture(
  canvas: HTMLCanvasElement,
  opts: { srgb?: boolean; repeat?: [number, number]; anisotropy?: number; mipmaps?: boolean } = {},
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.anisotropy = opts.anisotropy ?? 8;
  if (opts.repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  if (opts.mipmaps === false) {
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
  }
  tex.needsUpdate = true;
  return tex;
}

const cache = new Map<string, THREE.Texture>();

/** Paint a texture once per key and reuse it for the life of the page. */
export function cached<T extends THREE.Texture>(key: string, paint: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const t0 = performance.now();
  const tex = paint();
  const ms = performance.now() - t0;
  if (import.meta.env.DEV && ms > 40) console.debug(`[paint] ${key} ${ms.toFixed(0)}ms`);
  cache.set(key, tex);
  return tex;
}

/** Deterministic PRNG so painted textures look the same on every load. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Paper fibre and speckle, drawn over whatever is already on the canvas. */
export function paperGrain(ctx: Ctx, w: number, h: number, seed: number, strength = 1): void {
  const r = rng(seed);
  ctx.save();
  // Fibres: short, faint, slightly curved strokes.
  ctx.lineCap = 'round';
  for (let i = 0; i < (w * h) / 900; i++) {
    const x = r() * w;
    const y = r() * h;
    const len = 4 + r() * 18;
    const a = r() * Math.PI * 2;
    ctx.strokeStyle = r() > 0.5 ? `rgba(120,96,60,${0.05 * strength})` : `rgba(255,252,240,${0.08 * strength})`;
    ctx.lineWidth = 0.6 + r() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.4) * len * 0.5, y + Math.sin(a + 0.4) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  // Speckle.
  for (let i = 0; i < (w * h) / 300; i++) {
    ctx.fillStyle = `rgba(60,45,30,${r() * 0.07 * strength})`;
    ctx.fillRect(r() * w, r() * h, 1 + r() * 1.4, 1 + r() * 1.4);
  }
  ctx.restore();
}

/**
 * Risograph wear: tiny voids knocked out of the ink, the way a drum misses a
 * spot. Paint after the ink, in the paper colour.
 */
export function inkVoids(ctx: Ctx, w: number, h: number, color: string, seed: number, count = 260): void {
  const r = rng(seed);
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = 0.25 + r() * 0.55;
    const s = 0.6 + r() * 1.8;
    ctx.beginPath();
    ctx.arc(r() * w, r() * h, s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Draw `paint` twice: a faint offset pass first (the misregistered second
 * drum of a riso print), then the true pass on top.
 */
export function misregister(ctx: Ctx, dx: number, dy: number, alpha: number, paint: () => void): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(dx, dy);
  paint();
  ctx.restore();
  paint();
}

/** A soft round sprite, white at the centre. */
export function softDot(size = 128, falloff = 2.2): THREE.CanvasTexture {
  return cached(`dot:${size}:${falloff}`, () => {
    const [c, ctx] = makeCanvas(size, size);
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      g.addColorStop(t, `rgba(255,255,255,${Math.pow(1 - t, falloff)})`);
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return toTexture(c, { srgb: false });
  });
}

/**
 * Fill a path as a pure blur (no hard core), using the shadow trick so it works
 * in every browser, including ones without `ctx.filter`.
 */
export function blurFill(ctx: Ctx, blur: number, color: string, path: () => void): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 10000;
  ctx.translate(-10000, 0);
  path();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}
