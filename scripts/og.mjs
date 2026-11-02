// Render the social card and app icons with Playwright, from HTML set in the
// same type and paper as the site. Writes public/og.png, apple-touch-icon.png,
// icon-192.png, and icon-512.png.
//
//   npx playwright install chromium   # once
//   node scripts/og.mjs
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const pub = join(root, 'public');
const font = (p) => pathToFileURL(join(root, 'node_modules', p)).href;

const fonts = [
  '@fontsource/shippori-mincho-b1/500.css',
  '@fontsource/shippori-mincho-b1/800.css',
  '@fontsource-variable/jetbrains-mono/wght.css',
  '@fontsource/caveat/latin-500.css',
]
  .map((p) => `<link rel="stylesheet" href="${font(p)}">`)
  .join('\n');

const noise = (freq, oct, matrix, size, seed = 3) =>
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${oct}' seed='${seed}' stitchTiles='stitch'/><feColorMatrix values='${matrix}'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;

const paper = [
  noise('.012 .16', 3, '0 0 0 0 .4 0 0 0 0 .33 0 0 0 0 .22 3.2 0 0 0 -2.2', 640, 7),
  noise('.9', 3, '0 0 0 0 .11 0 0 0 0 .1 0 0 0 0 .08 1.1 0 0 0 -.42', 220),
  noise('.004', 3, '0 0 0 0 .55 0 0 0 0 .45 0 0 0 0 .3 .9 0 0 0 -.38', 900),
].join(', ');

const seal = (chars, size, grain = true) => `
  <svg class="seal" viewBox="0 0 100 ${chars.length > 1 ? 18 + chars.length * 64 : 100}" width="${size}">
    <defs><filter id="r${size}"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="9" result="w"/>
      <feDisplacementMap in="SourceGraphic" in2="w" scale="3.2" xChannelSelector="R" yChannelSelector="G" result="g"/>
      <feTurbulence type="fractalNoise" baseFrequency=".75" seed="20" result="s"/>
      <feColorMatrix in="s" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -4 0 0 0 3.15" result="m"/>
      ${grain ? '<feComposite in="g" in2="m" operator="in"/>' : '<feMerge><feMergeNode in="g"/></feMerge>'}</filter></defs>
    <g filter="url(#r${size})">
      <rect x="2" y="2" width="96" height="${(chars.length > 1 ? 18 + chars.length * 64 : 100) - 4}" rx="6" fill="#d2412a"/>
      ${[...chars]
        .map(
          (c, i, a) =>
            `<text x="50" y="${a.length === 1 ? 50 : (18 + a.length * 64) / 2 - ((a.length - 1) * 64) / 2 + i * 64}" text-anchor="middle" dominant-baseline="central" font-family="Shippori Mincho B1" font-weight="800" font-size="62" fill="#efe8da">${c}</text>`,
        )
        .join('')}
    </g>
  </svg>`;

const base = `
  * { margin: 0; box-sizing: border-box; }
  body { background: #efe8da; color: #1b1a17; font-family: 'Shippori Mincho B1', serif; overflow: hidden; }
  .paper { position: absolute; inset: 0; background-image: ${paper}; background-size: 640px, 220px, 900px; opacity: .75; }
  .label { font: 600 15px/1 'JetBrains Mono Variable', monospace; letter-spacing: .2em; text-transform: uppercase; }
`;

const og = `<!doctype html><html><head><meta charset="utf-8">${fonts}<style>
  ${base}
  body { width: 1200px; height: 630px; position: relative; }
  .frame { position: absolute; inset: 28px; border: 1px solid rgb(27 26 23 / .3); }
  .frame::after { content: ''; position: absolute; inset: 6px; border: 1px solid rgb(27 26 23 / .14); }
  .lock { position: absolute; left: 86px; top: 64px; }
  .n { font-size: 282px; font-weight: 800; line-height: .78; letter-spacing: -.055em; display: flex; }
  .n span:last-child { color: #d2412a; }
  .h { font-size: 92px; font-weight: 500; letter-spacing: -.02em; margin: 14px 0 0 150px; display: flex; align-items: center; gap: 26px; }
  .h::before { content: ''; width: 90px; height: 1px; background: #c9a45c; }
  .seal { position: absolute; left: 72px; top: 288px; transform: rotate(-6deg); }
  .pitch { position: absolute; left: 90px; bottom: 70px; font-size: 29px; font-weight: 500; }
  .pitch b { font-weight: 800; }
  .meta { position: absolute; right: 150px; top: 66px; color: #8a8170; font-size: 13px; }
  .vert { position: absolute; right: 84px; top: 64px; writing-mode: vertical-rl; text-orientation: upright; font-size: 26px; font-weight: 500; letter-spacing: .4em; color: #4a463e; padding: 18px 10px; border-inline: 1px solid #c9a45c; }
  .note { position: absolute; left: 650px; top: 176px; font: 500 34px/1.05 Caveat, cursive; color: #a8301d; transform: rotate(-4deg); }
</style></head><body>
  <div class="paper"></div><div class="frame"></div>
  <div class="lock"><div class="n"><span>8</span><span>9</span><span>3</span></div><div class="h">Hold'em</div></div>
  ${seal('八九三', 64)}
  <p class="note">8 · 9 · 3, read ya-ku-za.<br>the worst hand in the old game.<br>we kept it.</p>
  <p class="vert">一緒に勝つ。</p>
  <p class="pitch">A co-op poker heist for 2 to 6. <b>Beat the House without saying a word.</b></p>
  <p class="meta label">holdem893.pages.dev</p>
</body></html>`;

const icon = (size) => `<!doctype html><html><head><meta charset="utf-8">${fonts}<style>
  ${base}
  body { width: ${size}px; height: ${size}px; display: grid; place-items: center; background: #1b1a17; }
</style></head><body>${seal('八九三', Math.round(size * 0.42), false)}</body></html>`;

const jobs = [
  { file: 'og.png', html: og, w: 1200, h: 630 },
  { file: 'apple-touch-icon.png', html: icon(180), w: 180, h: 180 },
  { file: 'icon-192.png', html: icon(192), w: 192, h: 192 },
  { file: 'icon-512.png', html: icon(512), w: 512, h: 512 },
];

const dir = mkdtempSync(join(tmpdir(), '893-og-'));
const browser = await chromium.launch();
try {
  for (const job of jobs) {
    const page = await browser.newPage({ viewport: { width: job.w, height: job.h } });
    const htmlPath = join(dir, job.file.replace('.png', '.html'));
    writeFileSync(htmlPath, job.html);
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(pub, job.file) });
    await page.close();
    console.log(`wrote public/${job.file}`);
  }
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}
