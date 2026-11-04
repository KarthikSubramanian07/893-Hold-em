// The menu card on the bar: who's here, which room, how fast. Host runs it.
import { MAX_CREW, MIN_CREW, RULES_IN_FOUR, TABLES, doorFor, sirensFor } from '../../engine/rules';
import type { Difficulty, GameView, SeatView, TimerSetting } from '../../engine/types';
import { sfx } from '../audio';
import { isPracticeCode } from '../net/practice';
import { amHost, canStart } from '../net/selectors';
import { useTable } from '../net/store';
import { AvatarSeal } from '../ui/avatars';
import { IconClose, IconCopy } from '../ui/icons';
import { Seal } from '../ui/Seal';
import { copyInvite } from './invite';
import { PracticeNote, PracticeOffer } from './Practice';

const TIMERS: { v: TimerSetting; label: string }[] = [
  { v: 15, label: '15s' },
  { v: 30, label: '30s' },
  { v: 60, label: '60s' },
  { v: 0, label: 'Off' },
];
const ORDER: Difficulty[] = ['shitamachi', 'kabukicho', 'oyabun'];

export function Lobby({ view, onEditProfile }: { view: GameView; onEditProfile: () => void }) {
  const send = useTable((s) => s.send);
  const host = amHost(view);
  const seats = view.seats;
  const bots = seats.filter((s) => s.bot).length;
  const full = seats.length >= MAX_CREW;
  const hostName = seats.find((s) => s.host)?.name ?? 'the host';
  const crew = Math.max(MIN_CREW, seats.length);

  return (
    <section className="lobby paper" aria-labelledby="lobby-title">
      <div className="lobby__col lobby__crew">
        <p className="label lobby__k">Tonight's table</p>
        <h1 id="lobby-title" className="lobby__code" aria-label={`Table ${view.code.split('').join(' ')}`}>
          {view.code.split('').map((ch, i) => (
            <span key={i}>{ch}</span>
          ))}
        </h1>
        {isPracticeCode(view.code) ? (
          <PracticeNote />
        ) : (
          <div className="lobby__invite">
            <button type="button" className="btn btn--sm" onClick={() => void copyInvite(view.code)}>
              <IconCopy size={15} /> Copy invite link
            </button>
            <p className="lobby__invite-hint">Anyone with the link sits down. No sign-up.</p>
            {seats.length === 1 && <PracticeOffer />}
          </div>
        )}

        <div className="lobby__crewhead">
          <h2 className="label">
            The crew <span className="lobby__count">{seats.length}/{MAX_CREW}</span>
          </h2>
          {host && (
            <div className="lobby__bots">
              <button
                type="button"
                className="lobby__mini"
                disabled={full}
                onClick={() => {
                  sfx.click();
                  send({ t: 'bot', op: 'add' });
                }}
              >
                + Add a bot
              </button>
              <button
                type="button"
                className="lobby__mini"
                disabled={bots === 0}
                onClick={() => {
                  sfx.click();
                  send({ t: 'bot', op: 'remove' });
                }}
              >
                − Remove a bot
              </button>
            </div>
          )}
        </div>

        <ul className="crew">
          {seats.map((s) => (
            <CrewRow
              key={s.id}
              seat={s}
              you={s.id === view.you}
              canKick={host && s.id !== view.you}
              onKick={() => {
                sfx.click();
                send({ t: 'kick', seat: s.id });
              }}
              onEdit={onEditProfile}
            />
          ))}
          {Array.from({ length: MAX_CREW - seats.length }, (_, i) => (
            <li key={`empty-${i}`} className="crew__row crew__row--empty">
              <span className="crew__stool" aria-hidden="true" />
              <span>Empty stool</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="lobby__col lobby__setup">
        <fieldset className="lobby__field" disabled={!host}>
          <legend className="label lobby__legend">Difficulty</legend>
          <div className="rooms">
            {ORDER.map((id, i) => {
              const t = TABLES[id];
              const on = view.config.difficulty === id;
              return (
                <label key={id} className={`room room--${id}${on ? ' is-on' : ''}`} title={`The House holds ${t.house} cards. ${doorFor(id, crew)} steps to the door, ${sirensFor(id, crew)} to the sirens.`}>
                  <input
                    type="radio"
                    name="difficulty"
                    className="sr-only"
                    checked={on}
                    onChange={() => {
                      sfx.click();
                      send({ t: 'config', config: { difficulty: id } });
                    }}
                  />
                  <span className="room__kanji" aria-hidden="true">
                    {t.kanji}
                  </span>
                  <span className="room__name">{t.name}</span>
                  <span className="room__meta">
                    <span className="room__pips" aria-hidden="true">
                      {[0, 1, 2].map((p) => (
                        <i key={p} className={p <= i ? 'on' : ''} />
                      ))}
                    </span>
                    {`${t.house} cards · ${doorFor(id, crew)}/${sirensFor(id, crew)}`}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="lobby__blurb">
            {TABLES[view.config.difficulty].blurb} With {crew} players: {doorFor(view.config.difficulty, crew)} steps to the door,{' '}
            {sirensFor(view.config.difficulty, crew)} to the sirens.
          </p>
        </fieldset>

        <div className="lobby__field lobby__how">
          <p className="label lobby__legend">How a hand plays</p>
          <ol className="lobby__rules">
            {RULES_IN_FOUR.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        </div>

        <fieldset className="lobby__field" disabled={!host}>
          <legend className="label lobby__legend">Time to choose</legend>
          <div className="seg" role="radiogroup" aria-label="Decision timer">
            {TIMERS.map((t) => (
              <label key={t.v} className={`seg__opt${view.config.timer === t.v ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name="timer"
                  className="sr-only"
                  checked={view.config.timer === t.v}
                  onChange={() => {
                    sfx.click();
                    send({ t: 'config', config: { timer: t.v } });
                  }}
                />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="lobby__start">
          {host ? (
            <>
              <button
                type="button"
                className="btn btn--shu lobby__go"
                disabled={!canStart(view)}
                onClick={() => {
                  sfx.unlock();
                  sfx.stamp();
                  send({ t: 'start' });
                }}
              >
                Start the night
              </button>
              <p className="lobby__fine">
                {seats.length < MIN_CREW
                  ? 'You need at least two players. Send the link to a friend, or add a bot.'
                  : `${seats.length} players. Reach the door (${view.door} steps) before the sirens (${view.sirens}). Last orders after ${view.lastOrders} hands.`}
              </p>
            </>
          ) : (
            <p className="lobby__wait" aria-live="polite">
              <span className="lobby__pulse" aria-hidden="true" />
              Waiting for {hostName} to start the night.
            </p>
          )}
        </div>
      </div>

      <Seal className="lobby__seal" chars="席" shape="round" size={62} tilt={-10} seed={41} />
    </section>
  );
}

function CrewRow({
  seat,
  you,
  canKick,
  onKick,
  onEdit,
}: {
  seat: SeatView;
  you: boolean;
  canKick: boolean;
  onKick: () => void;
  onEdit: () => void;
}) {
  return (
    <li className={`crew__row${seat.connected ? '' : ' is-away'}${you ? ' is-you' : ''}`}>
      <AvatarSeal avatar={seat.avatar} size={34} />
      <span className="crew__name">
        {seat.name}
        {you && <span className="crew__tag crew__tag--you">You</span>}
        {seat.host && (
          <span className="crew__tag crew__tag--host" title="Host">
            親 Host
          </span>
        )}
        {seat.bot && <span className="crew__tag">Bot</span>}
        {!seat.connected && <span className="crew__tag">Stepped out</span>}
      </span>
      {you ? (
        <button type="button" className="crew__act" onClick={onEdit}>
          Change
        </button>
      ) : canKick ? (
        <button type="button" className="crew__act crew__kick" onClick={onKick} aria-label={`Show ${seat.name} the door`}>
          <IconClose size={14} />
        </button>
      ) : null}
    </li>
  );
}
