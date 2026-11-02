// The full rules, set like the back page of a bar menu. Canonical text lives in
// docs/DESIGN.md; this mirrors it for players.
import { useEffect, useRef } from 'react';
import { RULES, TABLES } from '../../engine/rules';
import type { RuleId } from '../../engine/types';
import { sfx } from '../audio';
import { IconClose } from './icons';
import { Seal } from './Seal';

const RULE_ORDER: RuleId[] = ['kiri', 'kagami', 'oni', 'shizuka', 'homura', 'kizuna', 'hebi', 'kitsune', 'gyaku'];

export function RulesContent() {
  return (
    <div className="rules">
      <section className="rules__quick">
        <h3 className="rules__h">The game in 30 seconds</h3>
        <ol>
          <li>You and your crew play poker hands together, against the masked House.</li>
          <li>Each round, everyone secretly picks Fold, Stay, or Raise. All picks turn over at once. That is the only talking allowed.</li>
          <li>If the crew&rsquo;s best hand beats the House&rsquo;s best, everyone still in gets paid their bet (take).</li>
          <li>But the mask watching you checks your own hand. If it beats you, you add your bet as heat.</li>
          <li>Reach the take target in six hands without hitting the heat limit, and you get away clean.</li>
        </ol>
      </section>

      <section>
        <h3 className="rules__h">The crew</h3>
        <p>
          Two to six seats, people or regulars (bots) who fill empty chairs. The House plays one hand per mask, one mask for
          every two of you, so the odds stay honest at any table size.
        </p>
      </section>

      <section>
        <h3 className="rules__h">A night</h3>
        <p>Six hands. The crew shares two counters.</p>
        <dl className="rules__counters">
          <div>
            <dt>
              <span className="rules__k rules__k--kin">円</span> Take
            </dt>
            <dd>Money won. Reach the target to get away clean.</dd>
          </div>
          <div>
            <dt>
              <span className="rules__k rules__k--neon">熱</span> Heat
            </dt>
            <dd>Police attention. Hit the limit and the bar gets raided. That ends the night.</dd>
          </div>
        </dl>
        <ul className="rules__verdicts">
          <li>
            <b>Clean getaway.</b> Six hands played, take at or above target, heat under the limit.
          </li>
          <li>
            <b>Raid.</b> Heat reaches the limit, at any point.
          </li>
          <li>
            <b>Came up short.</b> Six hands played, take under target.
          </li>
        </ul>
      </section>

      <section>
        <h3 className="rules__h">A hand</h3>
        <ol className="rules__steps">
          <li>
            <b>The deal.</b> Two private cards each. Every House mask gets two face down.
          </li>
          <li>
            <b>The House Rule.</b> From hand two (hand one at the Oyabun table), one House Rule flips. It bends this hand only.
          </li>
          <li>
            <b>Four calls.</b> Pre-flop, flop, turn, river. Everyone still in picks one, in secret:
            <span className="rules__stances">
              <span>
                <span className="rules__k">降</span> <b>Fold</b> Step out. Your cards stop counting. No coming back.
              </span>
              <span>
                <span className="rules__k rules__k--ai">待</span> <b>Stay</b> Keep your stake.
              </span>
              <span>
                <span className="rules__k rules__k--shu">攻</span> <b>Raise</b> Stake up by one, to a maximum of three.
              </span>
            </span>
            Stakes start at one. When everyone locks in, or the timer runs out (undecided counts as Stay), every call flips at
            once. That flip is the only conversation you get.
          </li>
          <li>
            <b>The showdown.</b> Two counts, settled at once.
            <span className="rules__outcomes">
              <span>
                Take: the crew's best active hand faces the House's best. If the crew wins, take rises by every active stake.
                Everyone still in gets paid, even with trash.
              </span>
              <span>
                Heat: each mask watches two seats. Anyone still in whose own hand loses to the mask watching them draws heat
                equal to their stake, even when the crew wins. You were seen.
              </span>
              <span>Ties pay nothing and burn nothing, unless the Serpent is out.</span>
              <span>Everybody folded: heat rises by one. Walking away still gets noticed.</span>
            </span>
          </li>
        </ol>
      </section>

      <section>
        <h3 className="rules__h">House Rules</h3>
        <ul className="rules__deck">
          {RULE_ORDER.map((id) => {
            const r = RULES[id];
            return (
              <li key={id}>
                <Seal chars={r.kanji} size={34} shape="square" cut={r.kind === 'boon' ? 'shu' : 'haku'} color={r.kind === 'wild' ? 'var(--sumi)' : 'var(--shu)'} seed={id.length} />
                <div>
                  <b>
                    {r.name} <span className="rules__romaji">{r.romaji}</span>
                  </b>
                  <span>{r.text}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3 className="rules__h">Tables</h3>
        <table className="rules__tables">
          <thead>
            <tr>
              <th scope="col">Table</th>
              <th scope="col">Rules from</th>
              <th scope="col">Clean odds</th>
              <th scope="col">Deck</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(TABLES).map((t) => (
              <tr key={t.id}>
                <th scope="row">
                  <span className="rules__tk">{t.kanji}</span> {t.name}
                </th>
                <td>Hand {t.ruleFrom}</td>
                <td>{t.odds}</td>
                <td>{t.deck.length} cards</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="rules__fine">The heat limit and the take target both scale with the crew, since every seat still in can draw heat. The lobby shows the numbers for your table.</p>
      </section>

      <section>
        <h3 className="rules__h">Timing and silence</h3>
        <p>
          The call timer is 30 seconds unless the host picks 15, 60, or off. After the showdown the next hand starts when
          everyone taps Next, or after 12 seconds. Drop your connection and your calls default to Stay; open the same link
          to take your seat back.
        </p>
        <p>
          Reactions (a sake clink, a sigh of smoke, a slow nod) work in the lobby and after the showdown. Never during calls.
        </p>
      </section>
    </div>
  );
}

export function RulesDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="drawer paper"
      aria-labelledby="rules-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="drawer__inner">
        <header className="drawer__head">
          <div>
            <p className="label">House rules · 掟</p>
            <h2 id="rules-title" className="drawer__title">
              How the night works.
            </h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              sfx.click();
              onClose();
            }}
            aria-label="Close the rules"
          >
            <IconClose />
          </button>
        </header>
        <RulesContent />
        <p className="drawer__sign hand">No talking about your cards. That's the whole trick.</p>
      </div>
    </dialog>
  );
}
