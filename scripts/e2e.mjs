// End-to-end: two real browsers play a whole night through the actual UI,
// against the real rooms Worker running the Rust engine.
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
async function newPlayer(name, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
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

// Host opens a table from the landing page.
const host = await newPlayer('host');
await host.goto(base);
await shot(host, '01-landing');
await host.getByRole('button', { name: /open a table/i }).first().click();
await host.waitForURL(/\/t\/[A-Z0-9]{5}/);
const url = host.url();
step(`host opened ${url}`);
await takeSeat(host, 'Karthik');
await host.getByText('Start the night').waitFor({ timeout: 30_000 });
await host.waitForTimeout(1500);
await shot(host, '02-lobby');

// A friend joins with the link.
const guest = await newPlayer('guest');
await guest.goto(url);
await takeSeat(guest, 'Mio');
await host.getByText('Mio').first().waitFor();
step('guest joined through the invite link');

// Two regulars fill chairs; the host starts the night.
for (let i = 0; i < 2; i++) {
  await host.getByRole('button', { name: /seat a regular/i }).click();
  await host.waitForTimeout(400);
}
await host.waitForTimeout(800);
await shot(host, '03-lobby-full');
await host.getByRole('button', { name: /start the night/i }).click();
step('night started');

// Play: both humans call Stay by keyboard; press Next at each showdown.
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
    if (phase === 'call') {
      const stay = page.getByRole('button', { name: /^stay/i });
      if (await stay.isEnabled().catch(() => false)) {
        if (calls === 0 && label === 'host') {
          await page.waitForTimeout(2500);
          await shot(page, '04-first-call');
        }
        await page.keyboard.press('s');
        if (label === 'host') calls++;
      }
    }
    if (phase === 'showdown') {
      const text = ((await page.locator('.sd').textContent().catch(() => '')) ?? '').slice(0, 24);
      if (label === 'host' && text !== lastShowdown) {
        lastShowdown = text;
        showdowns++;
        await page.waitForTimeout(2500);
        await shot(page, `05-showdown-${showdowns}`);
        step(`showdown ${showdowns}`);
      }
      const next = page.locator('.sd__next button');
      if (await next.isEnabled().catch(() => false)) await next.click().catch(() => {});
    }
  }
  await host.waitForTimeout(300);
}
await host.waitForTimeout(2500);
await shot(host, '06-night-over');
await shot(guest, '06-night-over-guest');
const verdict = await host
  .locator('.receipt')
  .getAttribute('class')
  .then((c) => c?.match(/receipt--(\w+)/)?.[1] ?? null)
  .catch(() => null);
step(`${calls} calls by keyboard, ${showdowns} showdowns, verdict: ${verdict}`);

// The same table on a phone, before picking a name.
const phone = await newPlayer('phone', { width: 390, height: 844 });
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
