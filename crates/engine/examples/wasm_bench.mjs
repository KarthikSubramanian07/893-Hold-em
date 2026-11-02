// Times the `wasm_bench` example's exports in Node's WebAssembly engine (V8,
// the same engine as Cloudflare Workers and Chrome). See wasm_bench.rs.
import { readFileSync } from 'node:fs';

const path = process.argv[2] ?? 'target/wasm32-unknown-unknown/wasm/examples/wasm_bench.wasm';
const bytes = readFileSync(path);
const { instance } = await WebAssembly.instantiate(bytes, {});
const { bench_score, bench_estimate } = instance.exports;

function best(fn, passes) {
  let ms = Infinity;
  for (let i = 0; i < passes; i++) {
    const t = performance.now();
    fn();
    ms = Math.min(ms, performance.now() - t);
  }
  return ms;
}

const N = 4_000_000;
const scoreMs = best(() => bench_score(N), 6);
console.log(`wasm size:                   ${(bytes.length / 1024).toFixed(1)} KiB`);
console.log(`score_best (7 cards):        ${((scoreMs * 1e6) / N).toFixed(1)} ns/hand (incl. 1,024-hand setup)`);
const REPS = 500;
const estMs = best(() => bench_estimate(REPS), 4);
console.log(`estimate (2000, 3 House):    ${((estMs * 1e3) / REPS).toFixed(1)} µs`);
