// Phones and tablets: play a whole practice night by touch alone, in WebKit
// (the engine behind every browser on iPhone and iPad), on several devices.
// Every screen is checked for sideways overflow and for tap targets smaller
// than 44px, and screenshotted for review.
//
//   bunx vite build && bunx vite preview --port 4173 &
//   node scripts/devices-e2e.mjs [http://localhost:4173] [out-dir] [device…]

import { mkdirSync } from 'node:fs';
import { devices, webkit } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4173';
const out = process.argv[3] ?? '/tmp/893-devices';
const wanted = process.argv.slice(4);
const DEVICES = [
  ['iphone-se', devices['iPhone SE (3rd gen)'] ?? devices['iPhone SE']],
  ['iphone-15', devices['iPhone 15'] ?? devices['iPhone 14']],
  ['ipad-portrait', devices['iPad Pro 11']],
  ['ipad-landscape', devices['iPad Pro 11 landscape']],
].filter(([name, d]) => d && (!wanted.length || wanted.includes(name)));
mkdirSync(out, { recursive: true });

const problems = [];
const browser = await webkit.launch();

/** Overflow and tap-target audit of the current screen. */
async function audit(page, device, stage) {
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const overflow = document.documentElement.scrollWidth - vw;
    const small = [];
    for (const el of document.querySelectorAll('button, a[href], [role="button"], input, select')) {
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (b.width === 0 || b.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (b.bottom < 0 || b.top > innerHeight) continue;
      if (el.closest('[aria-hidden="true"]') || el.classList.contains('sr-only')) continue;
      if (b.width < 44 && b.height < 44) small.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    // Anything poking past the right edge.
    const wide = [];
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect();
      if (b.width && b.right > vw + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('canvas')) {
        wide.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} → ${Math.round(b.right - vw)}px`);
        if (wide.length > 4) break;
      }
    }
    return { overflow, small: small.slice(0, 8), wide };
  });
  if (r.overflow > 1) problems.push(`${device} ${stage}: page scrolls sideways by ${r.overflow}px (${r.wide.join('; ')})`);
  if (r.small.length) problems.push(`${device} ${stage}: small tap targets: ${r.small.join(', ')}`);
}

for (const [name, desc] of DEVICES) {
  const ctx = await browser.newContext({ ...desc });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = (label) => page.screenshot({ path: `${out}/${name}-${label}.png`, timeout: 90_000 });
  const step = (s) => console.log(`· ${name}: ${s}`);

  await page.goto(base);
  await page.waitForTimeout(1500);
  if (await page.locator('.cold-open').count()) {
    await shot('00-cold-open');
    await page.locator('.cold-open').tap({ position: { x: 20, y: 200 } }).catch(() => {});
    await page.locator('.cold-open').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  }
  await page.waitForTimeout(800);
  await shot('01-landing');
  await audit(page, name, 'landing');

  await page.getByText('Sit with the regulars').first().tap();
  const nameField = page.getByPlaceholder('Stranger');
  await nameField.waitFor({ timeout: 20000 });
  await shot('02-profile');
  await audit(page, name, 'profile');
  await nameField.tap();
  await nameField.fill('Karthik');
  await page.getByRole('button', { name: /take a seat/i }).tap();
  await page.getByText('Start the night').waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  await shot('03-lobby');
  await audit(page, name, 'lobby');
  await page.getByRole('button', { name: /start the night/i }).tap();
  step('night started');

  let nods = 0;
  let calls = 0;
  let showdowns = 0;
  let lastSd = '';
  let shotNod = false;
  let shotCall = false;
  /** The dock must sit inside the screen, clear of the home indicator. */
  const dockFits = async (when) => {
    const dock = await page.locator('.dock').boundingBox().catch(() => null);
    const vh = page.viewportSize()?.height ?? 0;
    if (dock && dock.y + dock.height > vh) problems.push(`${name} ${when}: the dock runs off the bottom of the screen`);
  };
  const t0 = Date.now();
  while (Date.now() - t0 < 240_000) {
    const phase = await page.locator('.table').getAttribute('data-phase').catch(() => null);
    if (phase === 'over') break;
    if (phase === 'nod') {
      const mate = page.locator('.dock--nod .mate').first();
      if (await mate.isEnabled().catch(() => false)) {
        if (!shotNod) {
          await page.waitForTimeout(2500);
          await shot('04-nod');
          await audit(page, name, 'nod');
          await dockFits('nod');
          shotNod = true;
        }
        // Tap a teammate on most hands; pass now and then.
        if (nods % 3 === 2) await page.getByRole('button', { name: /^pass/i }).tap().catch(() => {});
        else await mate.tap().catch(() => {});
        nods++;
      }
    }
    if (phase === 'call') {
      const inBtn = page.getByRole('button', { name: /^in\b/i });
      if (await inBtn.isEnabled().catch(() => false)) {
        if (!shotCall) {
          await page.waitForTimeout(2000);
          await shot('04-call');
          await audit(page, name, 'call');
          await dockFits('call');
          shotCall = true;
        }
        await inBtn.tap().catch(() => {});
        calls++;
      }
    }
    if (phase === 'showdown') {
      const text = ((await page.locator('.sd').textContent().catch(() => '')) ?? '').slice(0, 24);
      if (text !== lastSd) {
        lastSd = text;
        showdowns++;
        if (showdowns === 1) {
          await page.waitForTimeout(2500);
          await shot('05-showdown');
          await audit(page, name, 'showdown');
        }
      }
      const next = page.locator('.sd__next button');
      if (await next.isEnabled().catch(() => false)) await next.tap().catch(() => {});
    }
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(2500);
  const receipt = await page.locator('.receipt').count();
  await shot('06-receipt');
  await audit(page, name, 'receipt');
  if (!receipt) problems.push(`${name}: the night never reached the receipt`);
  step(`${nods} nods and ${calls} calls by tap, ${showdowns} showdowns, receipt ${receipt ? 'shown' : 'missing'}`);

  await page.goto(`${base}/matchbook`);
  await page.waitForTimeout(2500);
  await shot('07-matchbook');
  await audit(page, name, 'matchbook');

  if (errors.length) problems.push(`${name}: page errors: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}
await browser.close();

if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n- ` + problems.join('\n- '));
  process.exit(1);
}
console.log(`✓ every device played a whole night by touch; screenshots in ${out}`);
