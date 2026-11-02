// What the site says to agents, at the edge.
//
// Two jobs, both done by functions/_middleware.ts on every page request:
//
// 1. Markdown negotiation (acceptmarkdown.com). A request that prefers
//    `text/markdown` over `text/html` gets the page as Markdown, from the
//    `.md` files the build writes next to the HTML (see site/build.ts), with
//    `Content-Type: text/markdown` and `Vary: Accept`. Browsers, which ask
//    for HTML, get exactly what they always got, plus `Vary: Accept`.
// 2. Honest 404s. An address that isn't a page or a part of the game gets a
//    real 404: the paper 404 page for browsers, Markdown for agents.
//
// Sockets, non-GET requests, and static files pass straight through.

/** A page the site serves, or `app` for the game's own routes. */
export type PageKey = 'index' | 'rules' | 'about' | 'contact' | 'privacy' | 'app';

const PAGES: Record<string, PageKey> = {
  '/': 'index',
  '/index.html': 'index',
  '/rules': 'rules',
  '/about': 'about',
  '/contact': 'contact',
  '/privacy': 'privacy',
  '/practice': 'app',
  '/matchbook': 'app',
};

/** Which page an address is, or null if it isn't one (a 404). */
export function pageFor(pathname: string): PageKey | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const page = PAGES[path.toLowerCase()];
  if (page) return page;
  if (/^\/t\/[A-Za-z0-9]{1,16}$/.test(path)) return 'app';
  return null;
}

/** The Markdown file behind a page; unknown addresses get the 404's. */
export function markdownFor(page: PageKey | null): string {
  if (page === null) return '/404.md';
  if (page === 'index') return '/index.md';
  return `/${page}.md`;
}

interface Range {
  type: string;
  q: number;
  order: number;
}

function parseAccept(accept: string): Range[] {
  return accept
    .split(',')
    .map((part, order) => {
      const [type = '', ...params] = part.trim().toLowerCase().split(';');
      let q = 1;
      for (const p of params) {
        const [k, v] = p.trim().split('=');
        if (k === 'q') q = Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : 0;
      }
      return { type: type.trim(), q, order };
    })
    .filter((r) => r.type);
}

/**
 * True when the client prefers Markdown to HTML. A bare wildcard (`*\/*`,
 * which every browser sends) never counts as asking for Markdown; on an
 * exact tie, whichever the client listed first wins.
 */
export function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  const ranges = parseAccept(accept);
  const best = (types: string[]) =>
    ranges.filter((r) => types.includes(r.type)).sort((a, b) => b.q - a.q || a.order - b.order)[0];
  const md = best(['text/markdown', 'text/x-markdown']);
  if (!md || md.q === 0) return false;
  const html = best(['text/html', 'application/xhtml+xml']);
  if (!html) return true;
  return md.q > html.q || (md.q === html.q && md.order < html.order);
}

function withVary(headers: Headers): Headers {
  const vary = headers.get('Vary');
  if (!vary) headers.set('Vary', 'Accept');
  else if (!/(^|,)\s*accept\s*(,|$)/i.test(vary)) headers.set('Vary', `${vary}, Accept`);
  return headers;
}

const LINKS = '</llms.txt>; rel="describedby"; type="text/plain", </sitemap.xml>; rel="sitemap"';

/**
 * Answer one request. `next` serves it as the site normally would (static
 * files, the SPA rewrites, the 404 page); `asset` fetches a built file by path.
 */
export async function answer(
  request: Request,
  next: () => Promise<Response>,
  asset: (path: string) => Promise<Response>,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'GET' && request.method !== 'HEAD') return next();
  if (request.headers.get('Upgrade')) return next();
  // Files with an extension (the .md files themselves, llms.txt, images…) are served as they are.
  if (/\.[a-z0-9]+$/i.test(url.pathname) && url.pathname !== '/index.html') return next();

  const page = pageFor(url.pathname);

  if (prefersMarkdown(request.headers.get('Accept'))) {
    const src = await asset(markdownFor(page));
    const body = src.ok ? await src.text() : '# Not found\n\nThere is nothing at this address. See /llms.txt.\n';
    const headers = withVary(
      new Headers({
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        Link: LINKS,
      }),
    );
    if (page !== null) headers.set('Content-Location', markdownFor(page));
    return new Response(request.method === 'HEAD' ? null : body, { status: page === null ? 404 : 200, headers });
  }

  const res = await next();
  // An address that is no page must be a real 404, even if something upstream said otherwise.
  const status = page === null && res.status < 400 ? 404 : res.status;
  const headers = withVary(new Headers(res.headers));
  if (page !== null && res.ok) headers.set('Link', `<${markdownFor(page)}>; rel="alternate"; type="text/markdown", ${LINKS}`);
  return new Response(res.body, { status, statusText: status === 404 ? 'Not Found' : res.statusText, headers });
}
