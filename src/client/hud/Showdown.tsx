// The flip is done. One word for how it went, then the numbers.
import type { GameView } from '../../engine/types';
import { sfx } from '../audio';
import { OUTCOME_LINE, OUTCOME_SUB, readyQuorum, yourHand } from '../net/selectors';
import { useTable } from '../net/store';

export function Showdown({ view }: { view: GameView }) {
  const send = useTable((s) => s.send);
  const r = view.result;
  if (!r) return null;
  const { ready, needed } = readyQuorum(view);
  const iAmReady = view.you ? view.ready.includes(view.you) : true;
  const last = view.hand >= view.hands;
  const champion = view.seats.find((s) => s.champion);
  const crewWon = r.outcome === 'crew';
  const houseWon = r.outcome === 'house';

  return (
    <section className={`sd sd--${r.outcome}`} aria-labelledby="sd-verdict">
      <div className="sd__head">
        <p className="label sd__k">
          Hand {view.hand} of {view.hands} <span aria-hidden="true">·</span> showdown
        </p>
        <h2 id="sd-verdict" className="sd__verdict" aria-live="assertive">
          {OUTCOME_LINE[r.outcome]}
        </h2>
        <p className="sd__sub">{OUTCOME_SUB[r.outcome]}</p>
        {yourHand(view) && <p className="sd__you">{yourHand(view)}</p>}
      </div>

      <dl className="sd__hands">
        <div className={crewWon ? 'is-win' : ''}>
          <dt className="label">
            The crew{champion && crewWon ? <span className="sd__by"> · carried by {champion.name}</span> : null}
          </dt>
          <dd>{r.crewBest?.name ?? 'Nobody stayed in'}</dd>
        </div>
        <div className="sd__vs" aria-hidden="true">
          対
        </div>
        <div className={houseWon ? 'is-win' : ''}>
          <dt className="label">The House</dt>
          <dd>{r.houseBest.name}</dd>
        </div>
      </dl>

      <div className="sd__foot">
        <p className="sd__deltas">
          <span className="label sd__deltas-k">Crew total</span>
          <span className={`sd__delta sd__delta--take${r.take ? ' is-on' : ''}`}>
            +{r.take} <span>円 take</span>
          </span>
          <span className={`sd__delta sd__delta--heat${r.heat ? ' is-on' : ''}`}>
            +{r.heat} <span>熱 heat</span>
          </span>
        </p>
        <div className="sd__next">
          <button
            type="button"
            className="btn btn--kin"
            disabled={iAmReady}
            onClick={() => {
              sfx.unlock();
              sfx.click();
              send({ t: 'next' });
            }}
          >
            {iAmReady ? 'Ready' : last ? 'Settle up' : 'Next hand'}
          </button>
          <p className="sd__ready" aria-live="polite">
            <span className="sd__readypips" aria-hidden="true">
              {Array.from({ length: needed }, (_, i) => (
                <i key={i} className={i < ready ? 'on' : ''} />
              ))}
            </span>
            {ready}/{needed} ready
          </p>
        </div>
      </div>
    </section>
  );
}
