// Regenerates `pairs.txt`, the oracle fixture for `tests/oracle.rs`.
//
// Two independent JavaScript evaluators judge every hand, and the script stops
// if they ever disagree, so the fixture never rests on a single library:
//
//   - @poker-apprentice/hand-evaluator (integer lookup-table evaluator)
//   - pokersolver (object-based solver, a completely different design)
//
// Each line is two seven-card hands on a shared board, which is how the game
// compares hands and which exercises kickers far more than unrelated hands do.
// About half the pairs are uniform; the rest are rejection-sampled so the first
// hand cycles through all nine categories, straight flushes included.
//
// Usage (dependencies live outside the repo, in a scratch directory):
//
//   mkdir -p /tmp/oracle-deps && cd /tmp/oracle-deps && npm init -y >/dev/null
//   npm install --ignore-scripts pokersolver@2 @poker-apprentice/hand-evaluator@4
//   node crates/engine/tests/oracle/generate.mjs /tmp/oracle-deps/node_modules
//
// Optional second and third arguments: number of pairs to check (default
// 100000, i.e. 200k hands) and number to write (default 20000).

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [modules, checkArg, writeArg] = process.argv.slice(2);
if (!modules) {
  console.error('usage: node generate.mjs <node_modules dir> [check] [write]');
  process.exit(2);
}
const require = createRequire(join(modules, 'noop.js'));
const apprentice = require('@poker-apprentice/hand-evaluator');
const { Hand } = require('pokersolver');

const CHECK = Number(checkArg ?? 100_000);
const WRITE = Number(writeArg ?? 20_000);
const SEED = 0x893;

// mulberry32: tiny, seeded, good enough for picking test hands.
let state = SEED >>> 0;
function rand() {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const DECK = [];
for (const r of '23456789TJQKA') for (const s of 'shdc') DECK.push(r + s);

function deal(n) {
  const d = DECK.slice();
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rand() * (d.length - i));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d.slice(0, n);
}

// HandStrength: 0 high .. 8 straight flush, 9 royal flush (folded into 8).
function apprenticeEval(cards) {
  const h = apprentice.evaluate({ holeCards: cards });
  return { h, cat: Math.min(h.strength, 8) };
}

const SOLVER_CATS = {
  'High Card': 0,
  Pair: 1,
  'Two Pair': 2,
  'Three of a Kind': 3,
  Straight: 4,
  Flush: 5,
  'Full House': 6,
  'Four of a Kind': 7,
  'Straight Flush': 8,
  'Royal Flush': 8,
};

function judge(board, a, b) {
  const ea = apprenticeEval([...a, ...board]);
  const eb = apprenticeEval([...b, ...board]);
  // apprentice.compare sorts strongest first: -1 means the first is stronger.
  const cmp = -apprentice.compare(ea.h, eb.h);

  const sa = Hand.solve([...a, ...board]);
  const sb = Hand.solve([...b, ...board]);
  const winners = Hand.winners([sa, sb]);
  const solverCmp = winners.length === 2 ? 0 : winners[0] === sa ? 1 : -1;
  const solverA = SOLVER_CATS[sa.name];
  const solverB = SOLVER_CATS[sb.name];

  if (ea.cat !== solverA || eb.cat !== solverB || cmp !== solverCmp) {
    throw new Error(
      `oracles disagree on board ${board} a ${a} b ${b}: ` +
        `apprentice ${ea.cat}/${eb.cat}/${cmp}, pokersolver ${solverA}/${solverB}/${solverCmp}`,
    );
  }
  return { catA: ea.cat, catB: eb.cat, cmp };
}

const lines = [];
const perCat = new Array(9).fill(0);
for (let i = 0; i < CHECK; i++) {
  let cards, verdict;
  const target = i % 2 === 1 ? (i >> 1) % 9 : -1;
  for (;;) {
    cards = deal(9);
    if (target < 0) break;
    if (apprenticeEval([...cards.slice(5, 7), ...cards.slice(0, 5)]).cat === target) break;
  }
  const board = cards.slice(0, 5);
  const a = cards.slice(5, 7);
  const b = cards.slice(7, 9);
  verdict = judge(board, a, b);
  perCat[verdict.catA]++;
  if (lines.length < WRITE) {
    lines.push(`${board.join('')} ${a.join('')} ${b.join('')} ${verdict.catA} ${verdict.catB} ${verdict.cmp}`);
  }
}

const header = [
  '# Oracle fixture for tests/oracle.rs. Regenerate with tests/oracle/generate.mjs.',
  `# Checked ${CHECK} pairs (${2 * CHECK} hands) against two evaluators; wrote ${lines.length}. Seed ${SEED}.`,
  '# board hole_a hole_b category_a category_b cmp',
  '# category: 0 high, 1 pair, 2 two pair, 3 trips, 4 straight, 5 flush, 6 full house, 7 quads, 8 straight flush',
  '# cmp: 1 if hand a (hole_a + board) wins, -1 if hand b wins, 0 for a tie',
];
const out = join(dirname(fileURLToPath(import.meta.url)), 'pairs.txt');
writeFileSync(out, [...header, ...lines, ''].join('\n'));
console.log(`checked ${CHECK} pairs, wrote ${lines.length} to ${out}`);
console.log('first-hand categories over all checked pairs:', perCat.join(' '));
