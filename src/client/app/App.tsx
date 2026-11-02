import { lazy, Suspense, useEffect, useState } from 'react';
import { Landing } from '../pages/Landing';
import { NotFound } from '../pages/NotFound';
import { coldOpenFor } from '../story/firstVisit';
import { Toaster } from '../ui/toast';
import { navigate, usePathname } from './router';
import { canonicalPath, matchRoute } from './routes';

// The table pulls in the 3D scene; keep it out of the landing bundle.
const TablePage = lazy(() => import('../pages/Table').then((m) => ({ default: m.TablePage })));
// The matchbook and the story layer load after the paper world has painted.
const MatchbookPage = lazy(() => import('../pages/MatchbookPage').then((m) => ({ default: m.MatchbookPage })));
const StoryLayer = lazy(() => import('../story/StoryLayer').then((m) => ({ default: m.StoryLayer })));

export function App() {
  const pathname = usePathname();
  const route = matchRoute(pathname);
  // Decided once, at the door: the first visit to the front page opens on the alley.
  const [coldOpen, setColdOpen] = useState(() => coldOpenFor(location.pathname));

  useEffect(() => {
    const want = canonicalPath(pathname, route);
    if (want) navigate(want + location.search, { replace: true });
  }, [pathname, route]);

  useEffect(() => {
    if (route.name === 'landing') document.title = "893 Hold'em: a co-op poker heist for 2 to 6";
  }, [route.name]);

  return (
    <>
      {route.name === 'landing' && <Landing />}
      {route.name === 'notfound' && <NotFound reason={route.reason} />}
      {route.name === 'table' && (
        <Suspense fallback={<div className="table-fallback" aria-busy="true" />}>
          <TablePage key={route.code} code={route.code} />
        </Suspense>
      )}
      {route.name === 'matchbook' && (
        <Suspense fallback={<div className="matchbook-fallback" aria-busy="true" />}>
          <MatchbookPage />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <StoryLayer
          venue={route.name === 'table' ? 'table' : 'street'}
          coldOpen={coldOpen && route.name === 'landing'}
          onColdOpenDone={() => setColdOpen(false)}
        />
      </Suspense>
      <Toaster />
    </>
  );
}
