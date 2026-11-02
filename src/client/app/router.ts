// A tiny History API router. One external store: the current URL.
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { createElement } from 'react';

const EVENT = '893:navigate';

function subscribe(cb: () => void): () => void {
  window.addEventListener('popstate', cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener('popstate', cb);
    window.removeEventListener(EVENT, cb);
  };
}

const getPath = () => location.pathname;
const getSearch = () => location.search;

export function usePathname(): string {
  return useSyncExternalStore(subscribe, getPath, () => '/');
}

export function useSearch(): string {
  return useSyncExternalStore(subscribe, getSearch, () => '');
}

/** Navigate within the app. Keeps `?fixture=` so dev mock views survive a click. */
export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  const url = new URL(to, location.href);
  const fixture = new URLSearchParams(location.search).get('fixture');
  if (fixture && !url.searchParams.has('fixture') && url.pathname !== '/') url.searchParams.set('fixture', fixture);
  const next = url.pathname + url.search + url.hash;
  if (next === location.pathname + location.search + location.hash) return;
  if (opts.replace) history.replaceState(null, '', next);
  else history.pushState(null, '', next);
  if (!url.hash) window.scrollTo({ top: 0 });
  window.dispatchEvent(new Event(EVENT));
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };

export function Link({ to, onClick, ...rest }: LinkProps) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return createElement('a', { ...rest, href: to, onClick: handle });
}
