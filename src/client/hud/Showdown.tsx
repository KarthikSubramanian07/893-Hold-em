// The flip. Your own two cards turn over for the first time, then the rest of
// the story: who was In, who nodded at whom, the House's hand, and where the
// marker went.
import type { GameView } from '../../engine/types';
import { sfx } from '../audio';
import { isMonster, movedLine, mySeat, nodsOn, OUTCOME_LINE, readyQuorum, revealLine, signed, tallyLine } from '../net/selectors';
import { useTable } from '../net/store';
import { AvatarSeal } from '../ui/avatars';
import { CardPair, MiniCard } from './MiniCard';
import { Track } from './TopBar';

export function Showdown({ view }: { view: GameView }) {
  const send = useTable((s) => s.send);
  const r = view.result;
  if (!r) return null;
  const me = mySeat(view);
  const { ready, needed } = readyQuorum(view);
  const iAmReady = view.you ? view.ready.includes(view.you) : true;
  const last = view.hand >= view.lastOrders;
  const tally = tallyLine(view);
  const reveal = revealLine(view);
  const monster = isMonster(me?.hand);

  return (
    <section className={`sd sd--${r.outcome}`} aria-labelledby="sd-verdict">
      {me && (
        <div className={`sd__reveal${monster ? ' is-monster' : ''}${me.champion ? ' is-carrier' : ''}`}>
          <p className="label sd__k">Your cards, at last</p>
          <div className="sd__mine">
            {me.cards.map((c, i) => (
              <MiniCard key={i} slot={c} size="lg" flip delay={250 + i * 220} />
            ))}
          </div>
          {reveal && (
            <p className="sd__revealline" aria-live="polite">
              {reveal}
            </p>
          )}
        </div>
      )}

      <div className="sd__head">
        <p className="label sd__k">
          Hand {view.hand} <span aria-hidden="true">·</span> showdown
        </p>
        <h2 id="sd-verdict" className="sd__verdict" aria-live="assertive">
          {OUTCOME_LINE[r.outcome]}
        </h2>
        <p className="sd__moved">
          <span className={`sd__steps${r.moved > 0 ? ' is-up' : r.moved < 0 ? ' is-down' : ''}`}>{signed(r.moved)}</span>
          <span>{movedLine(r.moved)}</span>
        </p>
      </div>

      <dl className="sd__hands">
        <div className={r.outcome === 'crew' ? 'is-win' : ''}>
          <dt className="label">
            The crew
            {tally && <span className="sd__by"> · {tally}</span>}
          </dt>
          <dd>{r.crewBest ? `Best: ${r.crewBest.name}` : 'Nobody went In'}</dd>
        </div>
        <div className="sd__vs" aria-hidden="true">
          対
        </div>
        <div className={r.outcome === 'house' || r.outcome === 'walked' ? 'is-win' : ''}>
          <dt className="label">The House</dt>
          <dd>
            {r.houseBest.name}
            <CardPair cards={view.house.cards} size="xs" />
          </dd>
        </div>
      </dl>

      <ul className="sd__seats" aria-label="Who was In">
        {view.seats.map((s) => {
          const nods = nodsOn(view, s.id);
          const could = r.couldHave.includes(s.id) && s.stance === 'out';
          const lost = s.stance === 'in' && !s.champion && (s.hand?.score ?? 0) < r.houseBest.score;
          return (
            <li key={s.id} className={`sdseat${s.stance === 'in' ? ' is-in' : ' is-out'}${s.champion ? ' is-carrier' : ''}${s.id === view.you ? ' is-you' : ''}`}>
              <AvatarSeal avatar={s.avatar} size={22} />
              <span className="sdseat__name">{s.id === view.you ? 'You' : s.name}</span>
              <CardPair cards={s.cards} size="xs" />
              <span className="sdseat__stance">{s.stance === 'in' ? '入 In' : '出 Out'}</span>
              <span className="sdseat__nods" title={`${nods} ${nods === 1 ? 'nod' : 'nods'}`}>
                {nods > 0 ? (
                  <>
                    {Array.from({ length: nods }, (_, i) => (
                      <i key={i} aria-hidden="true" />
                    ))}
                    <span className="sr-only">{nods} {nods === 1 ? 'nod' : 'nods'}</span>
                  </>
                ) : (
                  <span className="sdseat__none">no nods</span>
                )}
              </span>
              {s.champion && <span className="sdseat__tag">won</span>}
              {lost && <span className="sdseat__tag sdseat__tag--lost">lost</span>}
              {could && <span className="sdseat__tag sdseat__tag--could">could have</span>}
            </li>
          );
        })}
      </ul>

      <div className="sd__foot">
        <Track view={view} size="big" />
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
