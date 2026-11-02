// Unknown paths and codes that don't open anything.
import { useEffect } from 'react';
import { Link } from '../app/router';
import { Seal } from '../ui/Seal';
import './notfound.css';

export function NotFound({ reason }: { reason: 'path' | 'code' }) {
  useEffect(() => {
    document.title = "Closed · 893 Hold'em";
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex';
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);

  return (
    <main className="nf paper paper-page">
      <div className="nf__card">
        <p className="nf__k vert" aria-hidden="true">
          本日休業
        </p>
        <div className="nf__body">
          <p className="label nf__label">{reason === 'code' ? 'No such table' : '404 · Nothing here'}</p>
          <h1 className="nf__title">That table's closed. Try another door.</h1>
          <p className="nf__p">
            {reason === 'code'
              ? 'Table codes are five characters, like K7QX2. Check the link your crew sent.'
              : "Whatever you were looking for, it isn't behind this curtain."}
          </p>
          <Link to="/" className="btn">
            Back to the bar
          </Link>
        </div>
        <Seal className="nf__seal" chars="閉" shape="round" size={92} tilt={-14} seed={31} />
      </div>
    </main>
  );
}
