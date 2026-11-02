#!/usr/bin/env node
// Numerical listening test for the synthesized sound. Starts Vite, opens the
// sound lab in headless Chromium, renders every voice (and a stretch of the
// ambience) through the real master chain in an OfflineAudioContext, and
// checks each render is finite, unclipped, audible but not harsh, the length
// it claims, and different from one play to the next.
//
//   node scripts/audio-check.mjs            check, print a table, exit 1 on failure
//   node scripts/audio-check.mjs --wav DIR  also write each render as a .wav to DIR

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const wavDir = (() => {
  const i = process.argv.indexOf('--wav');
  return i === -1 ? null : resolve(process.argv[i + 1] ?? 'audio-renders');
})();

/** Quieter floors for the sounds meant to sit almost below notice. */
const MIN_RMS_DB = { hover: -62, click: -56, tick: -50, stampFar: -52 };
const DEFAULT_MIN_RMS_DB = -46;
const LIMITS = {
  peak: 0.99,
  maxWindowDb: -6,
  brightness: 1.0,
  tailPeak: 0.001,
  dc: 0.01,
  overrun: 0.4,
  underrun: 0.25,
  /** Max sample difference between two seeds, as a share of the peak. */
  variation: 0.05,
};
const SEEDS = [1, 2, 3];

function checkVoice(s, minRms) {
  const fails = [];
  if (s.nonFinite > 0) fails.push(`${s.nonFinite} non-finite samples`);
  if (s.peak > LIMITS.peak) fails.push(`peak ${s.peak.toFixed(3)} > ${LIMITS.peak}`);
  if (!(s.rmsDb >= minRms)) fails.push(`rms ${s.rmsDb.toFixed(1)} dB < ${minRms} (too quiet)`);
  if (s.maxWindowDb > LIMITS.maxWindowDb) fails.push(`loudest 50ms ${s.maxWindowDb.toFixed(1)} dB > ${LIMITS.maxWindowDb} (harsh)`);
  if (s.brightness > LIMITS.brightness) fails.push(`brightness ${s.brightness.toFixed(2)} > ${LIMITS.brightness} (harsh)`);
  if (s.tailPeak > LIMITS.tailPeak) fails.push(`still sounding at the end of the render (${s.tailPeak.toExponential(1)})`);
  if (Math.abs(s.dc) > LIMITS.dc) fails.push(`dc offset ${s.dc.toFixed(4)}`);
  if (s.audible > s.declared + LIMITS.overrun) fails.push(`rings ${s.audible.toFixed(2)}s, declared ${s.declared.toFixed(2)}s`);
  if (s.audible < s.declared * LIMITS.underrun) fails.push(`only ${s.audible.toFixed(2)}s audible, declared ${s.declared.toFixed(2)}s`);
  return fails;
}

function checkAmbience(s) {
  const fails = [];
  if (s.nonFinite > 0) fails.push(`${s.nonFinite} non-finite samples`);
  if (s.peak > LIMITS.peak) fails.push(`peak ${s.peak.toFixed(3)}`);
  if (s.rmsDb < -50 || s.rmsDb > -20) fails.push(`rms ${s.rmsDb.toFixed(1)} dB outside [-50, -20]`);
  if (s.maxWindowDb > -12) fails.push(`loudest 50ms ${s.maxWindowDb.toFixed(1)} dB > -12 (fatiguing)`);
  if (s.brightness > LIMITS.brightness) fails.push(`brightness ${s.brightness.toFixed(2)}`);
  const settled = s.seconds.slice(3);
  const sorted = [...settled].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  for (const [i, level] of settled.entries()) {
    if (Math.abs(level - median) > 8) fails.push(`second ${i + 3} at ${level} dB, median ${median} dB (surge)`);
  }
  if (s.seconds[0] >= median - 3) fails.push(`no fade in: first second ${s.seconds[0]} dB vs median ${median} dB`);
  return fails;
}

const server = await createServer({ logLevel: 'error', server: { port: 5199, strictPort: false, host: '127.0.0.1' } });
await server.listen();
const base = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:5199/';
const browser = await chromium.launch();
let failed = 0;

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(new URL('src/client/audio/lab.html', base).href);
  await page.waitForFunction(() => window.__audioLab, null, { timeout: 30_000 });
  if (wavDir) await mkdir(wavDir, { recursive: true });

  const names = await page.evaluate(() => window.__audioLab.names);
  const rows = [];
  for (const name of names) {
    const minRms = MIN_RMS_DB[name] ?? DEFAULT_MIN_RMS_DB;
    const fails = [];
    let first;
    for (const seed of SEEDS) {
      const s = await page.evaluate(([n, sd, w]) => window.__audioLab.renderVoice(n, sd, w), [name, seed, !!wavDir && seed === 1]);
      first ??= s;
      for (const f of checkVoice(s, minRms)) fails.push(`seed ${seed}: ${f}`);
      if (s.wav) await writeFile(join(wavDir, `${name}.wav`), Buffer.from(s.wav, 'base64'));
    }
    const diff = await page.evaluate((n) => window.__audioLab.variation(n), name);
    if (diff < LIMITS.variation) fails.push(`seeds 1 and 2 barely differ (${(diff * 100).toFixed(1)}% of peak)`);
    rows.push({ name, s: first, diff, fails });
  }

  const amb = await page.evaluate((w) => window.__audioLab.renderAmbience(16, 1, w), !!wavDir);
  if (amb.wav) await writeFile(join(wavDir, 'ambience.wav'), Buffer.from(amb.wav, 'base64'));
  const ambFails = checkAmbience(amb);

  const pad = (v, w) => String(v).padStart(w);
  console.log(`\n${'voice'.padEnd(11)}${pad('peak', 7)}${pad('rms dB', 8)}${pad('max dB', 8)}${pad('bright', 8)}${pad('audible', 9)}${pad('declared', 10)}${pad('vary', 8)}  result`);
  for (const { name, s, diff, fails } of rows) {
    console.log(
      `${name.padEnd(11)}${pad(s.peak.toFixed(3), 7)}${pad(s.rmsDb.toFixed(1), 8)}${pad(s.maxWindowDb.toFixed(1), 8)}${pad(s.brightness.toFixed(2), 8)}${pad(s.audible.toFixed(2) + 's', 9)}${pad(s.declared.toFixed(2) + 's', 10)}${pad(diff.toFixed(3), 8)}  ${fails.length ? 'FAIL' : 'ok'}`,
    );
    for (const f of fails) console.log(`    - ${f}`);
    failed += fails.length ? 1 : 0;
  }
  console.log(
    `${'ambience'.padEnd(11)}${pad(amb.peak.toFixed(3), 7)}${pad(amb.rmsDb.toFixed(1), 8)}${pad(amb.maxWindowDb.toFixed(1), 8)}${pad(amb.brightness.toFixed(2), 8)}${pad('16s', 9)}${pad('', 10)}${pad('', 8)}  ${ambFails.length ? 'FAIL' : 'ok'}`,
  );
  console.log(`    per second: ${amb.seconds.join(' ')}`);
  for (const f of ambFails) console.log(`    - ${f}`);
  failed += ambFails.length ? 1 : 0;

  // ---- live: a scripted hand through useGameSounds and the real engine ----
  await page.reload();
  await page.waitForFunction(() => window.__audioLab, null, { timeout: 30_000 });
  const before = await page.evaluate(() => window.__audioLab.sfx.state());
  await page.click('#play-hand');
  await page.waitForFunction(() => window.__audioLab.demoSteps === 7, null, { timeout: 30_000 });
  await page.waitForTimeout(2_500);
  const live = await page.evaluate(() => ({ played: [...window.__audioLab.played], state: window.__audioLab.sfx.state() }));
  const liveFails = [];
  if (before !== 'locked') liveFails.push(`audio context existed before the first gesture (${before})`);
  if (live.state !== 'running') liveFails.push(`audio context is ${live.state} after the gesture`);
  const expected = ['deal', 'rule', 'stampFar', 'stamp', 'tick', 'fold', 'chip', 'flip', 'reveal', 'win', 'stingClean'];
  for (const name of expected) if (!live.played.includes(name)) liveFails.push(`never played ${name}`);
  const order = ['reveal', 'win', 'stingClean'].map((n) => live.played.indexOf(n));
  if (!(order[0] < order[1] && order[1] < order[2])) liveFails.push(`showdown out of order: ${live.played.join(' ')}`);
  console.log(`\nlive hand (${live.state}): ${live.played.join(' ')}`);
  for (const f of liveFails) console.log(`    - ${f}`);
  failed += liveFails.length ? 1 : 0;

  if (errors.length) {
    console.log(`\npage errors:\n  ${errors.join('\n  ')}`);
    failed += 1;
  }
  if (wavDir) console.log(`\nwrote renders to ${wavDir}`);
} finally {
  await browser.close();
  await server.close();
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall sounds pass');
process.exit(failed ? 1 : 0);
