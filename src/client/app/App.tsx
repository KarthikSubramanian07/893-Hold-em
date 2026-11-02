import { lazy, Suspense, useEffect } from 'react';
import { Landing } from '../pages/Landing';
import { NotFound } from '../pages/NotFound';
import { Toaster } from '../ui/toast';
import { navigate, usePathname } from './router';
import { canonicalPath, matchRoute } from './routes';

// The table pulls in the 3D scene; keep it out of the landing bundle.
const TablePage = lazy(() => import('../pages/Table').then((m) => ({ default: m.TablePage })));

export function App() {
  const pathname = usePathname();
  const route = matchRoute(pathname);

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
      <Toaster />
    </>
  );
}
