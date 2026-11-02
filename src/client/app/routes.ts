// Route matching, kept pure so it can be tested without a browser.
import { CODE_RE } from '../../protocol';

export type Route =
  | { name: 'landing' }
  | { name: 'table'; code: string }
  | { name: 'notfound'; reason: 'path' | 'code' };

export function matchRoute(pathname: string): Route {
  const path = pathname.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');
  if (path === '/' || path === '' || path === '/index.html') return { name: 'landing' };
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
    const want = `/t/${route.code}`;
    return pathname === want ? null : want;
  }
  return null;
}
