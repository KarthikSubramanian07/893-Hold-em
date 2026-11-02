// The night, itemized. Printed on the bar's thermal roll and stamped.
import type { ReactNode } from 'react';
import { RULES, TABLES } from '../../engine/rules';
import type { GameView, HistoryEntry } from '../../engine/types';
import { sfx } from '../audio';
import { Link, navigate } from '../app/router';
import { amHost, VERDICT_LINE, VERDICT_SUB } from '../net/selectors';
import { useTable } from '../net/store';
import { Seal } from '../ui/Seal';

export function Receipt({ view, aside }: { view: GameView; aside?: ReactNode }) {
  const send = useTable((s) => s.send);
  const leave = useTable((s) => s.leave);
  const verdict = view.verdict ?? 'short';
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

        <ol className="receipt__lines">
          {view.history.map((h) => (
            <Line key={h.hand} h={h} />
          ))}
        </ol>

        <dl className="receipt__totals">
          <div>
            <dt>Take</dt>
            <dd>
              {view.take} <span>/ {view.target} 円</span>
            </dd>
          </div>
          <div>
            <dt>Heat</dt>
            <dd>
              {view.heat} <span>/ {view.heatLimit} 熱</span>
            </dd>
          </div>
        </dl>

        <div className="receipt__verdict">
          <h2 id="receipt-verdict" className={`verdict-stamp verdict-stamp--${verdict}`} aria-live="polite">
            {VERDICT_LINE[verdict]}
          </h2>
          <p>{VERDICT_SUB[verdict]}</p>
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

function Line({ h }: { h: HistoryEntry }) {
  const rule = h.rule ? RULES[h.rule] : null;
  const amount =
    h.outcome === 'crew' ? `+${h.take} 円` : h.outcome === 'house' || h.outcome === 'walked' ? `+${h.heat} 熱` : 'push';
  const tag = { crew: 'Won', house: 'Burned', tie: 'Push', walked: 'Walked' }[h.outcome];
  return (
    <li className={`rl rl--${h.outcome}`}>
      <span className="rl__n">{String(h.hand).padStart(2, '0')}</span>
      <span className="rl__main">
        <span className="rl__title">
          {tag}
          {rule && (
            <span className="rl__rule">
              {rule.kanji} {rule.name}
            </span>
          )}
        </span>
        <span className="rl__vs">
          {h.crewBestName ?? 'All folded'} <i>vs</i> {h.houseBestName}
        </span>
      </span>
      <span className="rl__amt">{amount}</span>
    </li>
  );
}
