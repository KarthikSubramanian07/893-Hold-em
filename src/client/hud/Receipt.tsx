// The night, itemized. Printed on the bar's thermal roll and stamped.
import { useRef, type ReactNode } from 'react';
import { useRescueFocus } from './useRescueFocus';
import { TABLES } from '../../engine/rules';
import type { GameView, HistoryEntry } from '../../engine/types';
import { sfx } from '../audio';
import { Link, navigate } from '../app/router';
import { amHost, RAID_AT_DAWN_SUB, raidAtDawn, signed, VERDICT_LINE, VERDICT_SUB } from '../net/selectors';
import { Track } from './TopBar';
import { useTable } from '../net/store';
import { Seal } from '../ui/Seal';

export function Receipt({ view, aside }: { view: GameView; aside?: ReactNode }) {
  const send = useTable((s) => s.send);
  const leave = useTable((s) => s.leave);
  const title = useRef<HTMLHeadingElement>(null);
  useRescueFocus(title);
  const verdict = view.verdict ?? 'dawn';
  const host = amHost(view);
  const table = TABLES[view.config.difficulty];
  const stamp = new Date(view.now).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <section className="over" aria-labelledby="receipt-verdict">
      <article className={`receipt receipt--${verdict}`}>
        <header className="receipt__head">
          <Seal chars="八九三" shape="tall" size={22} seed={4} />
          <p className="receipt__bar">Bar 八九三 · Golden Gai</p>
          <p>
            Table {view.code} · {table.name}
          </p>
          <p>
            {stamp} · {view.seats.length} at the bar
          </p>
        </header>

        <ol className="receipt__lines" tabIndex={0} aria-label="Hand by hand">
          {view.history.map((h) => (
            <Line key={h.hand} h={h} />
          ))}
        </ol>

        <div className="receipt__track">
          <Track view={view} size="big" />
          <p>
            {view.history.length} {view.history.length === 1 ? 'hand' : 'hands'} · marker at {signed(view.meter)} · door {view.door}, sirens {view.sirens}
          </p>
        </div>

        <div className="receipt__verdict">
          <h2 id="receipt-verdict" ref={title} tabIndex={-1} className={`verdict-stamp verdict-stamp--${verdict}`}>
            {VERDICT_LINE[verdict]}
          </h2>
          <p>{raidAtDawn(view) ? RAID_AT_DAWN_SUB : VERDICT_SUB[verdict]}</p>
        </div>

        <p className="receipt__thanks">*** Thank you. We never saw you. ***</p>
      </article>

      <div className="over__actions">
        {aside}
        {host ? (
          <button
            type="button"
            className="btn btn--shu"
            onClick={() => {
              sfx.unlock();
              sfx.stamp();
              send({ t: 'again' });
            }}
          >
            Another night
          </button>
        ) : (
          <p className="over__wait">The host can deal another night.</p>
        )}
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            sfx.click();
            leave();
            navigate('/');
          }}
        >
          Leave
        </button>
        <Link to={`/matchbook?table=${view.code}`} className="over__book" onClick={() => sfx.click()}>
          <span aria-hidden="true">帳</span> Your matchbook
        </Link>
      </div>
    </section>
  );
}

const TAG = { crew: 'Ahead', house: 'Behind', tie: 'Even', walked: 'All out' } as const;

function Line({ h }: { h: HistoryEntry }) {
  const nods = h.carrierNods ? `${h.carrierNods} ${h.carrierNods === 1 ? 'nod' : 'nods'}` : 'no nods';
  // The carrier is the best hand that beat the House.
  const who = h.carrier ? `${h.carrier} won biggest · ${nods}` : h.ins === 0 ? 'Nobody went In' : null;
  return (
    <li className={`rl rl--${h.outcome}`}>
      <span className="rl__n">{String(h.hand).padStart(2, '0')}</span>
      <span className="rl__main">
        <span className="rl__title">
          {TAG[h.outcome]}
          <span className="rl__ins">{h.ins === 0 ? '0 In' : `${h.won} of ${h.ins} won`}</span>
        </span>
        {who && <span className="rl__who">{who}</span>}
        <span className="rl__vs">
          {h.crewBestName ?? 'Everyone Out'} <i>vs</i> {h.houseBestName}
        </span>
      </span>
      <span className="rl__amt">{signed(h.moved)}</span>
    </li>
  );
}
