// The one thing the landing page has to know before the story layer loads:
// has this browser seen the cold open? Kept tiny and dependency-free so the
// paper world can answer it synchronously, before first paint.

export const MATCHBOOK_KEY = '893:matchbook';

type Reader = Pick<Storage, 'getItem'>;

function storage(): Reader | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** True once the cold open has played (or been skipped) in this browser. */
export function coldOpenSeen(kv: Reader | null = storage()): boolean {
  try {
    const raw = JSON.parse(kv?.getItem(MATCHBOOK_KEY) ?? 'null') as { coldOpen?: unknown } | null;
    return raw?.coldOpen === true;
  } catch {
    return false;
  }
}

/**
 * Should this page open on the cold open? Only the front door, only the first
 * time. Someone arriving with an invite link goes straight to their table.
 */
export function coldOpenFor(pathname: string, kv: Reader | null = storage()): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return (path === '/' || path === '/index.html') && !coldOpenSeen(kv);
}
