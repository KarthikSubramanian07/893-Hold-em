// End-to-end: one browser plays a whole practice night through the real UI,
// with no rooms Worker anywhere. Proves the landing page stays light (no
// engine, no 3D until you sit down) and that no socket to a room ever opens.
//
//   npx vite --port 5213 &
//   node scripts/practice-e2e.mjs [http://localhost:5213] [out-dir] [desktop|phone]
//
// Screenshots of each stage land in out-dir (default /tmp/893-practice).

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5213';
const out = process.argv[3] ?? '/tmp/893-practice';
const device = process.argv[4] ?? 'desktop';
const viewport = device === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: device === 'phone' });
const page = await ctx.newPage();
const errors = [];
const sockets = [];
const fetched = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('websocket', (ws) => ws.url().includes('/room/') && sockets.push(ws.url()));
page.on('request', (r) => fetched.push(r.url()));

const shot = (label) => page.screenshot({ path: `${out}/${device}-${label}.png` });
const step = (s) => console.log(`· ${s}`);
const phaseOf = () => page.locator('.table').getAttribute('data-phase').catch(() => null);

await page.goto(base);
await page.waitForLoadState('networkidle');
// A first visit opens on the cold open; any key comes in, like a person would.
await page.locator('.cold-open').waitFor({ timeout: 15_000 }).catch(() => {});
if (await page.locator('.cold-open').count()) {
  await page.keyboard.press('Enter');
  await page.locator('.cold-open').waitFor({ state: 'detached' });
  step('skipped the cold open at the front door');
}
await shot('01-landing');
const heavy = fetched.filter((u) => /\.wasm|hachi_wasm|three|@react-three/.test(u));
if (heavy.length) errors.push(`landing fetched the engine or 3D before anyone sat down: ${heavy.join(', ')}`);

await page.getByRole('link', { name: /sit with the regulars/i }).click();
await page.waitForURL(/\/practice$/);
step('opened the practice table from the landing page');

// First visit on this device: a name and a seal, then the table seats itself.
const name = page.getByPlaceholder('Stranger');
await name.or(page.getByText('Start the night')).first().waitFor({ timeout: 60_000 });
if (await name.isVisible().catch(() => false)) {
  await name.fill('Karthik');
  await page.getByRole('button', { name: /take a seat/i }).click();
}
await page.getByText('Start the night').waitFor({ timeout: 30_000 });
await page.waitForTimeout(2200);
const regulars = await page.locator('.crew__row .crew__tag', { hasText: /^bot$/i }).count();
step(`lobby: ${regulars} regulars seated`);
if (regulars !== 3) errors.push(`expected 3 regulars, saw ${regulars}`);
await shot('02-lobby');

// Change the room and the crew before starting, like any host.
await page.getByText('30s').click();
await page.getByRole('button', { name: /remove a bot/i }).click();
await page.getByRole('button', { name: /add a bot/i }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /start the night/i }).click();
step('night started');

// Play by keyboard: mostly Stay, a Raise now and then, one Fold.
const keys = ['s', 'r', 's', 's', 's', 's', 'r', 's', 'f'];
let calls = 0;
let showdowns = 0;
let lastShowdown = '';
const started = Date.now();
while (Date.now() - started < 300_000) {
  const phase = await phaseOf();
  if (phase === 'over') break;
  if (phase === 'call') {
    const stay = page.getByRole('button', { name: /^stay/i });
    if (await stay.isEnabled().catch(() => false)) {
      if (calls === 0) {
        await page.waitForTimeout(2500);
        await shot('03-call');
      }
      await page.keyboard.press(keys[calls % keys.length]);
      calls++;
    }
  }
  if (phase === 'showdown') {
    const text = ((await page.locator('.sd').textContent().catch(() => '')) ?? '').slice(0, 24);
    if (text !== lastShowdown) {
      lastShowdown = text;
      showdowns++;
      await page.waitForTimeout(2500);
      if (showdowns <= 2) await shot(`04-showdown-${showdowns}`);
      step(`showdown ${showdowns}`);
    }
    const next = page.locator('.sd__next button');
    if (await next.isEnabled().catch(() => false)) await next.click().catch(() => {});
  }
  await page.waitForTimeout(300);
}
await page.waitForTimeout(2500);
await shot('05-receipt');
const verdict = await page
  .locator('.receipt')
  .getAttribute('class')
  .then((c) => c?.match(/receipt--(\w+)/)?.[1] ?? null)
  .catch(() => null);
step(`${calls} calls by keyboard, ${showdowns} showdowns, verdict: ${verdict}`);

await browser.close();
if (sockets.length) errors.push(`opened room sockets: ${sockets.join(', ')}`);
if (errors.length) {
  console.error('Problems:\n' + errors.join('\n'));
  process.exit(1);
}
if (!verdict) {
  console.error('✗ no verdict reached');
  process.exit(1);
}
console.log(`✓ full practice night played through the UI; screenshots in ${out}`);
