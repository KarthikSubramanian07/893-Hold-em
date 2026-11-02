// Deterministic choice. Every client at a table runs the narrator on its own,
// so a "random" line has to be a pure function of what they all share: the
// room code, the hand number, and the event. FNV-1a is small, fast, and spreads
// short strings well enough for picking between a handful of variants.

/** 32-bit FNV-1a over the UTF-16 code units of `s`. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Pick one of `bank` for this table and moment. Within one night the same event
 * walks a fixed shuffle of the bank by hand number, so a line does not repeat
 * until the bank has been used up.
 */
export function pick<T>(bank: readonly T[], code: string, hand: number, event: string): T {
  if (bank.length === 0) throw new Error(`empty line bank for ${event}`);
  if (bank.length === 1) return bank[0]!;
  const order = shuffle(bank.length, hash(`${code}|${event}`));
  return bank[order[Math.abs(hand) % bank.length]!]!;
}

/** A true/false coin for this table and moment, landing true about `p` of the time. */
export function chance(p: number, code: string, hand: number, event: string): boolean {
  return hash(`${code}|${hand}|${event}|coin`) / 0x1_0000_0000 < p;
}

/** Fisher-Yates over 0..n-1, driven by a tiny xorshift seeded from `seed`. */
function shuffle(n: number, seed: number): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  let x = seed || 0x9e3779b9;
  for (let i = n - 1; i > 0; i--) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    const j = (x >>> 0) % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Fill `{key}` holes in a template. Unknown keys are left as they are, so a typo shows up in tests. */
export function fill(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** "Mio", "Mio and Ren", "Mio, Ren and Sora". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
