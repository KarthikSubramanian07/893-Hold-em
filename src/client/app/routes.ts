// Route matching, kept pure so it can be tested without a browser.
import { CODE_RE } from '../../protocol';
import { PRACTICE_CODE, PRACTICE_PATH, isPracticeCode } from '../net/practice';

export type Route =
  | { name: 'landing' }
  | { name: 'table'; code: string }
  | { name: 'matchbook' }
  | { name: 'notfound'; reason: 'path' | 'code' };

export function matchRoute(pathname: string): Route {
  const path = pathname.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');
  if (path === '/' || path === '' || path === '/index.html') return { name: 'landing' };
  // The practice table is a table like any other, with a code no server can hand out.
  if (path.toLowerCase() === PRACTICE_PATH) return { name: 'table', code: PRACTICE_CODE };
  if (path.toLowerCase() === '/matchbook') return { name: 'matchbook' };
  const m = /^\/t\/([^/]+)$/i.exec(path);
  if (m) {
    let raw = m[1]!;
    try {
      raw = decodeURIComponent(raw);
    } catch {
      return { name: 'notfound', reason: 'code' };
    }
    const code = raw.toUpperCase();
    return CODE_RE.test(code) ? { name: 'table', code } : { name: 'notfound', reason: 'code' };
  }
  return { name: 'notfound', reason: 'path' };
}

/** The canonical path for a route, or null when the URL is already canonical. */
export function canonicalPath(pathname: string, route: Route): string | null {
  if (route.name === 'table') {
    const want = isPracticeCode(route.code) ? PRACTICE_PATH : `/t/${route.code}`;
    return pathname === want ? null : want;
  }
  if (route.name === 'matchbook') return pathname === '/matchbook' ? null : '/matchbook';
  return null;
}
