// Practice mode: a table that runs entirely in this tab, against the regulars.
// This file is tiny on purpose. The landing page and the router import it, so
// it must never pull in the engine; that lives behind a dynamic import in
// `wasm.ts` and is only fetched once someone actually sits down to practice.
import { CODE_RE } from '../../protocol';
import type { TableConfig } from '../../engine/types';

/**
 * The practice table's code. It has an O in it, which the room alphabet never
 * uses, so no server table can ever share it and `/t/ALONE` is a dead door.
 */
export const PRACTICE_CODE = 'ALONE';
export const PRACTICE_PATH = '/practice';

/** How the bar sets up a practice table before you touch anything. */
export const PRACTICE_DEFAULTS = {
  regulars: 3,
  // The easy room, and a long fuse: practice is for learning the nod.
  config: { difficulty: 'shitamachi', timer: 60 } satisfies TableConfig,
} as const;

export function isPracticeCode(code: string | null | undefined): boolean {
  return code === PRACTICE_CODE;
}

// Checked once at load: if the alphabet ever changes, the reserved code must not become reachable.
if (CODE_RE.test(PRACTICE_CODE)) throw new Error('PRACTICE_CODE collides with the room alphabet');
