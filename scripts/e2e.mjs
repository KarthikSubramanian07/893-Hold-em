// End-to-end: two real browsers play a whole night through the actual UI,
// against the real rooms Worker running the Rust engine. The host is on a
// desktop, the guest on a phone. Along the way: the cold open at the front
// door, a couple of easter eggs, the narrator's subtitles, a stamp slip at
// the end of the night, and the matchbook and back.
//
//   npx wrangler dev --config worker/wrangler.jsonc --port 8787 &
//   npx vite --port 5173 &
//   node scripts/e2e.mjs [http://localhost:5173] [out-dir]
//
// Screenshots of each stage land in out-dir (default /tmp/893-e2e).

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? '/tmp/893-e2e';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
const PHONE = { width: 390, height: 844 };
async function newPlayer(name, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 600 ? 2 : 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name} console: ${m.text()}`));
  return page;
}
const shot = (page, label) => page.screenshot({ path: `${out}/${label}.png` });
const step = (s) => console.log(`· ${s}`);
const phaseOf = (page) => page.locator('.table').getAttribute('data-phase').catch(() => null);

async function takeSeat(page, name) {
  await page.getByPlaceholder('Stranger').fill(name);
  await page.getByRole('button', { name: /take a seat/i }).click();
}

const seen = { lines: new Set(), toasts: new Set() };
/** Note any subtitle or stamp slip on screen right now. */
async function watch(page) {
  const [line, toast] = await page
    .evaluate(() => [
      document.querySelector('.hud__subs .narrator__text .story-sr')?.textContent ?? null,
      document.querySelector('.stamp-toast .stamp-toast__name')?.textContent ?? null,
    ])
    .catch(() => [null, null]);
  if (line) seen.lines.add(line);
  if (toast) seen.toasts.add(toast);
}

// A first visit to the front door opens on the alley, in the rain.
const host = await newPlayer('host');
await host.goto(base);
await host.locator('.cold-open').waitFor({ timeout: 30_000 });
await host.waitForTimeout(3200);
await shot(host, '00-cold-open');
await host.waitForTimeout(5600);
await shot(host, '00-cold-open-seal');
await host.keyboard.press('Space');
await host.locator('.cold-open').waitFor({ state: 'detached' });
step('cold open played and was skipped');
await host.waitForTimeout(600);
await shot(host, '01-landing');

// The paper world hears the eggs too: the sign stutters, the hidden card slides out.
await host.keyboard.type('893');
const neon = await host.evaluate(() => document.documentElement.dataset.egg);
await host.locator('.street-subs .narrator__line').waitFor();
await host.waitForTimeout(1800);
await shot(host, '01-egg-neon');
for (const k of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) {
  await host.keyboard.press(k);
}
await host.locator('.hidden-card[data-open]').waitFor();
await host.waitForTimeout(1200);
await shot(host, '01-egg-buta');
await host.locator('.hidden-card__card').click();
step(`eggs: neon ${neon === 'neon' ? 'flickered' : 'missing'}, the hidden card slid out`);
if (neon !== 'neon') errors.push('host: typing 893 did not mark the neon egg');

// A second visit skips the cold open.
await host.reload();
await host.waitForTimeout(1500);
if (await host.locator('.cold-open').count()) errors.push('host: the cold open played twice');

// Host opens a table from the landing page.
await host.getByRole('button', { name: /open a table/i }).first().click();
await host.waitForURL(/\/t\/[A-Z0-9]{5}/);
const url = host.url();
step(`host opened ${url}`);
await takeSeat(host, 'Karthik');
await host.getByText('Start the night').waitFor({ timeout: 30_000 });
await host.waitForTimeout(1500);
await shot(host, '02-lobby');

// A friend joins with the link, on a phone. No cold open for an invite: straight to the table.
const guest = await newPlayer('guest', PHONE);
await guest.goto(url);
if (await guest.locator('.cold-open').count()) errors.push('guest: the cold open blocked an invite link');
await takeSeat(guest, 'Mio');
await host.getByText('Mio').first().waitFor();
step('guest joined through the invite link');

// Two regulars fill chairs; the host starts the night.
for (let i = 0; i < 2; i++) {
  await host.getByRole('button', { name: /add a bot/i }).click();
  await host.waitForTimeout(400);
}
await host.waitForTimeout(800);
await shot(host, '03-lobby-full');
await guest.waitForTimeout(400);
await shot(guest, '03-lobby-mobile');

// Kanpai, typed at the table, gets a word from the Master.
await guest.keyboard.type('kanpai');
await guest.locator('.hud__subs .narrator__line').waitFor();
await guest.waitForTimeout(2600);
await watch(guest);
await shot(guest, '03-egg-kanpai-mobile');
await host.getByRole('button', { name: /start the night/i }).click();
step('night started');

// Play: on the flop the host nods by keyboard (N then 1) or passes (P), the
// guest taps a teammate chip; on the river the host picks In or Out by key
// (I / O) and the guest taps In. Press Next at each showdown.
let nods = 0;
let calls = 0;
let showdowns = 0;
let lastShowdown = '';
const started = Date.now();
while (Date.now() - started < 300_000) {
  if ((await phaseOf(host)) === 'over') break;
  for (const [page, label] of [
    [host, 'host'],
    [guest, 'guest'],
  ]) {
    const phase = await phaseOf(page);
    if (phase === 'nod') {
      const pass = page.getByRole('button', { name: /^pass/i });
      if (await pass.isEnabled().catch(() => false)) {
        if (nods === 0 && label === 'host') {
          await page.waitForTimeout(2500);
          await watch(page);
          await shot(page, '04-first-nod');
          await shot(guest, '04-first-nod-mobile');
        }
        if (label === 'host') {
          if (nods % 3 === 2) await page.keyboard.press('p');
          else {
            await page.keyboard.press('n');
            await page.keyboard.press('1');
          }
          nods++;
        } else {
          await page.locator('.dock--nod .mate').first().tap().catch(() => page.locator('.dock--nod .mate').first().click());
        }
      }
    }
    if (phase === 'call') {
      const inBtn = page.getByRole('button', { name: /^in\b/i });
      if (await inBtn.isEnabled().catch(() => false)) {
        if (calls === 0 && label === 'host') {
          await page.waitForTimeout(2000);
          await watch(page);
          await shot(page, '04-first-call');
          await shot(guest, '04-first-call-mobile');
        }
        if (label === 'host') {
          await page.keyboard.press(calls % 4 === 3 ? 'o' : 'i');
          calls++;
        } else {
          await inBtn.tap().catch(() => inBtn.click());
        }
      }
    }
    if (phase === 'showdown') {
      const text = ((await page.locator('.sd').textContent().catch(() => '')) ?? '').slice(0, 24);
      if (label === 'host' && text !== lastShowdown) {
        lastShowdown = text;
        showdowns++;
        await page.waitForTimeout(2500);
        await watch(page);
        await shot(page, `05-showdown-${showdowns}`);
        if (showdowns === 1) await shot(guest, '05-showdown-mobile');
        step(`showdown ${showdowns}`);
      }
      const next = page.locator('.sd__next button');
      if (await next.isEnabled().catch(() => false)) await next.click().catch(() => {});
    }
  }
  await watch(host);
  await host.waitForTimeout(300);
}
await host.waitForTimeout(2500);
await watch(host);
await shot(host, '06-night-over');
await shot(guest, '06-night-over-guest');
for (let i = 0; i < 8; i++) {
  await watch(host);
  await host.waitForTimeout(500);
}
const verdict = await host
  .locator('.receipt')
  .getAttribute('class')
  .then((c) => c?.match(/receipt--(\w+)/)?.[1] ?? null)
  .catch(() => null);
step(`${nods} nods and ${calls} calls by keyboard, ${showdowns} showdowns, verdict: ${verdict}`);

step(`narrator spoke ${seen.lines.size} distinct lines; stamp slips: ${[...seen.toasts].join(', ') || 'none'}`);
if (seen.lines.size < 3) errors.push(`narrator: only ${seen.lines.size} lines seen`);
if (seen.toasts.size === 0) errors.push('stamps: no stamp slip was ever shown');

// From the receipt to the matchbook, and back to the same table.
await host.getByRole('link', { name: /your matchbook/i }).click();
await host.waitForURL(/\/matchbook\?table=/);
await host.locator('.matchbook[data-open]').waitFor({ timeout: 10_000 });
await host.waitForTimeout(1600);
await shot(host, '08-matchbook');
const pressed = await host.locator('.matchbook__slot[data-stamped]').count();
step(`matchbook open with ${pressed} stamps pressed`);
if (pressed < 1) errors.push('matchbook: no stamps pressed after a full night');
if (!(await host.getByRole('button', { name: 'First Night, stamped' }).count())) errors.push('matchbook: First Night not stamped');
await guest.getByRole('link', { name: /your matchbook/i }).click();
await guest.locator('.matchbook[data-open]').waitFor({ timeout: 10_000 });
await guest.waitForTimeout(1600);
await shot(guest, '08-matchbook-mobile');
await host.getByRole('link', { name: /back to table/i }).click();
await host.waitForURL(/\/t\/[A-Z0-9]{5}$/);
await host.locator('.receipt').waitFor({ timeout: 30_000 });
step('back at the table from the matchbook, receipt still on the bar');

// The same table on a phone, before picking a name.
const phone = await newPlayer('phone', PHONE);
await phone.goto(base);
await phone.locator('.cold-open').waitFor({ timeout: 30_000 });
await phone.waitForTimeout(9000);
await shot(phone, '00-cold-open-mobile');
// It may have finished on its own by now; if not, any key opens the door.
if (await phone.locator('.cold-open').count()) await phone.keyboard.press('Enter');
await phone.locator('.cold-open').waitFor({ state: 'detached' });
await phone.goto(url);
await phone.getByPlaceholder('Stranger').waitFor();
await phone.waitForTimeout(1500);
await shot(phone, '07-mobile');

await browser.close();
if (errors.length) {
  console.error('Page errors:\n' + errors.join('\n'));
  process.exit(1);
}
if (!verdict) {
  console.error('✗ no verdict reached');
  process.exit(1);
}
console.log(`✓ full night played through the UI; screenshots in ${out}`);
