// The matchbook, on the bar counter under the lantern. It slides into the
// light closed, then opens itself; close it to see the cover again. From here:
// back to the table you came from, a new table, or the alley one more time.
import { useEffect, useState } from 'react';
import { makeRoomCode } from '../../protocol';
import { sfx } from '../audio';
import { Link, navigate, useSearch } from '../app/router';
import { CODE_RE } from '../../protocol';
import { ColdOpen, Matchbook, Rain, Seal, STAMPS, useMatchbook } from '../story';
import { useReducedMotion } from '../story/motion';
import './matchbook.css';

/** How long the closed matchbook sits in the light before it opens. */
const OPEN_AFTER_MS = 900;

export function MatchbookPage() {
  const search = useSearch();
  const back = new URLSearchParams(search).get('table')?.toUpperCase() ?? null;
  const table = back && CODE_RE.test(back) ? back : null;
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [replay, setReplay] = useState(false);
  const data = useMatchbook((s) => s.data);
  const stamped = STAMPS.filter((s) => data.stamps[s.id]).length;

  useEffect(() => {
    document.title = "The matchbook · 893 Hold'em";
    const t = setTimeout(() => setOpen(true), reduced ? 0 : OPEN_AFTER_MS);
    return () => clearTimeout(t);
  }, [reduced]);

  const toggle = (next: boolean) => {
    sfx.unlock();
    sfx.flip();
    setOpen(next);
  };

  return (
    <div className="mbp night">
      <Rain className="mbp__rain" density={0.5} />
      <div className="mbp__lamp" aria-hidden="true" />

      <header className="mbp__top">
        <Link to="/" className="mbp__mark" aria-label="893 Hold'em, back to the front door">
          <Seal text="八九三" size={22} />
          <span>893 Hold'em</span>
        </Link>
        <p className="mbp__k" aria-hidden="true">
          押印帳 · The matchbook
        </p>
      </header>

      <main id="main" className="mbp__main">
        <h1 className="sr-only">The matchbook</h1>
        <div className="mbp__book" data-open={open || undefined}>
          <Matchbook open={open} onOpenChange={toggle} />
        </div>

        <p className="mbp__caption">
          {stamped === 0
            ? 'Every stool starts empty. Play a night and the Master will press the first one.'
            : `${stamped} of ${STAMPS.length} pressed. ${data.nights} ${data.nights === 1 ? 'night' : 'nights'} at the bar. The rest are out there somewhere.`}
        </p>

        <nav className="mbp__actions" aria-label="Where to now">
          {table ? (
            <Link to={`/t/${table}`} className="btn btn--shu" onClick={() => sfx.click()}>
              Back to table {table}
            </Link>
          ) : (
            <button
              type="button"
              className="btn btn--shu"
              onClick={() => {
                sfx.unlock();
                sfx.stamp();
                navigate(`/t/${makeRoomCode()}`);
              }}
            >
              Open a table
            </button>
          )}
          <button
            type="button"
            className="btn btn--ghost mbp__ghost"
            onClick={() => {
              sfx.unlock();
              sfx.click();
              setReplay(true);
            }}
          >
            The alley, once more
          </button>
          <Link to="/" className="mbp__home">
            Back to the front door
          </Link>
        </nav>
      </main>

      {replay && <ColdOpen onDone={() => setReplay(false)} />}
    </div>
  );
}
