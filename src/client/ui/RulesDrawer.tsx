// The full rules, set like the back page of a bar menu. Canonical text lives in
// docs/DESIGN.md; this mirrors it for players.
import { useEffect, useRef } from 'react';
import { LAST_ORDERS, MAX_CREW, MIN_CREW, RULES_IN_FOUR, TABLES, doorFor, sirensFor } from '../../engine/rules';
import { sfx } from '../audio';
import { IconClose } from './icons';

const CREWS = Array.from({ length: MAX_CREW - MIN_CREW + 1 }, (_, i) => MIN_CREW + i);

export function RulesContent() {
  return (
    <div className="rules">
      <section className="rules__quick">
        <h3 className="rules__h">The game in 30 seconds</h3>
        <ol>
          {RULES_IN_FOUR.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ol>
        <p className="rules__fine">
          Reach the door for a clean getaway. Reach the sirens and the bar is raided. After {LAST_ORDERS} hands it is last
          orders, and the night ends at dawn.
        </p>
      </section>

      <section>
        <h3 className="rules__h">The crew</h3>
        <p>
          Two to six seats, people or regulars (bots) who fill empty chairs. You play together against one masked House.
          Nobody talks about cards. The nod is the only signal you get.
        </p>
      </section>

      <section>
        <h3 className="rules__h">A hand</h3>
        <ol className="rules__steps">
          <li>
            <b>The deal.</b> Two cards each, facing out. You see every teammate&rsquo;s cards and never your own. The House
            holds three to five cards, more at the harder tables and for bigger crews, and shows one of them.
          </li>
          <li>
            <b>The flop and the nod.</b> Three board cards turn. Each player may nod at one teammate, meaning
            &ldquo;you&rsquo;re good&rdquo;, or pass. Nods stay secret until everyone has nodded, then they all turn over
            together.
          </li>
          <li>
            <b>The river and the call.</b> The last two board cards turn. Everyone picks at once:
            <span className="rules__stances">
              <span>
                <span className="rules__k rules__k--shu">入</span> <b>In</b> Your hand counts for the crew. One step for you,
                whichever way it goes.
              </span>
              <span>
                <span className="rules__k">出</span> <b>Out</b> Sit this one out. Your hand stays off the table.
              </span>
            </span>
          </li>
          <li>
            <b>The showdown.</b> Every card flips, yours too, for the first time. The best hand that&rsquo;s In faces the
            House&rsquo;s best five (its cards plus the board).
            <span className="rules__outcomes">
              <span>Win: the marker moves one step toward the door for every player In.</span>
              <span>Lose: one step toward the sirens for every player In.</span>
              <span>Tie: the marker stays put.</span>
              <span>Everyone Out: nothing moves, but the clock runs. There are only {LAST_ORDERS} hands.</span>
            </span>
          </li>
        </ol>
      </section>

      <section>
        <h3 className="rules__h">The track</h3>
        <p>
          One marker, between the sirens (警, on the left) and the door (門, on the right). It starts in the middle, closer
          to the sirens than the door. How far each end sits depends on the table and the size of the crew.
        </p>
        <div className="rules__scroll">
        <table className="rules__tables">
          <thead>
            <tr>
              <th scope="col">Table</th>
              <th scope="col">House</th>
              {CREWS.map((n) => (
                <th key={n} scope="col">
                  {n} players
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.values(TABLES).map((t) => (
              <tr key={t.id}>
                <th scope="row">
                  <span className="rules__tk">{t.kanji}</span> {t.name}
                </th>
                <td>{t.house} cards</td>
                {CREWS.map((n) => (
                  <td key={n} title={`${doorFor(t.id, n)} steps to the door, ${sirensFor(t.id, n)} to the sirens`}>
                    {doorFor(t.id, n)} / {sirensFor(t.id, n)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="rules__fine">Steps to the door / steps to the sirens. A crew that plays well gets away about 7 in 10 nights at Shitamachi, 1 in 2 at Kabukichō, 3 in 10 at Oyabun.</p>
      </section>

      <section>
        <h3 className="rules__h">Timing and silence</h3>
        <p>
          The timer is 30 seconds for each step unless the host picks 15, 60, or off. If it runs out, you pass on the nod
          and sit the call out. After the showdown the next hand starts when everyone taps Next, or after 10 seconds. Drop
          your connection and the table carries on without you; open the same link to take your seat back.
        </p>
        <p>
          Reactions (a sake clink, a sigh of smoke, a wink) work in the lobby and after the showdown. Never during a hand.
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
        <p className="drawer__sign hand">You can't see your own cards. That's the whole trick.</p>
      </div>
    </dialog>
  );
}
