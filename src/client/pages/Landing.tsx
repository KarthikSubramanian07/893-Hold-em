// The paper world. A matchbook from a Golden Gai bar that has no website.
import { useState, type FormEvent } from 'react';
import { RULES, TABLES } from '../../engine/rules';
import type { Difficulty, RuleId } from '../../engine/types';
import { makeRoomCode } from '../../protocol';
import { sfx } from '../audio';
import { Link, navigate } from '../app/router';
import { normalizeCode, parseCode } from '../lib/code';
import { HandArrow, IconArrow } from '../ui/icons';
import { RulesDrawer } from '../ui/RulesDrawer';
import { Seal } from '../ui/Seal';
import './landing.css';

const REPO = 'https://github.com/KarthikSubramanian07/893-Hold-em';
const DECK: RuleId[] = ['kiri', 'kagami', 'oni', 'shizuka', 'homura', 'kizuna', 'hebi', 'kitsune', 'gyaku'];
const TABLE_ORDER: Difficulty[] = ['shitamachi', 'kabukicho', 'oyabun'];
const KIND_LABEL = { boon: 'In your favour', bane: 'Against you', wild: 'Either way' } as const;

export function Landing() {
  const [rulesOpen, setRulesOpen] = useState(false);

  const openRules = () => {
    sfx.unlock();
    sfx.click();
    setRulesOpen(true);
  };

  return (
    <div className="landing paper paper-page">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Masthead onRules={openRules} />
      <main id="main">
        <Hero />
        <Beats />
        <Deck />
        <Tables />
        <Quiet />
      </main>
      <MatchbookFooter onRules={openRules} />
      <RulesDrawer open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}

function Masthead({ onRules }: { onRules: () => void }) {
  return (
    <header className="mast">
      <Link to="/" className="mast__mark" aria-label="893 Hold'em, home">
        <Seal chars="八九三" shape="tall" size={20} seed={4} />
        <span className="label">893 Hold'em</span>
      </Link>
      <p className="mast__mid label" aria-hidden="true">
        Golden Gai <span className="mast__dot">·</span> Shinjuku <span className="mast__dot">·</span> Open till the House
        closes
      </p>
      <nav className="mast__nav" aria-label="Site">
        <button type="button" className="mast__link label" onClick={onRules}>
          House rules
        </button>
        <a className="mast__link label" href={REPO} target="_blank" rel="noreferrer">
          Source
        </a>
      </nav>
    </header>
  );
}

function Hero() {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const open = () => {
    sfx.unlock();
    sfx.stamp();
    navigate(`/t/${makeRoomCode()}`);
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    sfx.unlock();
    const c = parseCode(code);
    if (!c) {
      setErr(code.trim() ? "That code doesn't open anything. Five characters, no O, no I." : 'Type the five characters from the invite.');
      return;
    }
    sfx.click();
    navigate(`/t/${c}`);
  };

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__lockup">
        <h1 id="hero-title" className="hero__title">
          <span className="hero__893" aria-hidden="true">
            <span>8</span>
            <span>9</span>
            <span>3</span>
          </span>
          <span className="hero__holdem">Hold'em</span>
          <span className="sr-only">893 Hold'em</span>
        </h1>
        <Seal className="hero__seal" chars="八九三" shape="tall" size={86} tilt={5} seed={9} title="Seal: ya-ku-za" />
        <p className="hero__note hand" aria-hidden="true">
          8 · 9 · 3, read ya-ku-za.
          <br />
          the worst hand in the old game.
          <br />
          we kept it.
          <HandArrow className="hero__arrow" />
        </p>
      </div>

      <div className="hero__body">
        <p className="hero__pitch">
          A co-op poker heist for 2 to 6. <em>Beat the House without saying a word.</em>
        </p>

        <div className="hero__actions">
          <button type="button" className="btn btn--shu hero__open" onClick={open} onMouseEnter={() => sfx.hover()}>
            Open a table <IconArrow />
          </button>

          <form className="join" onSubmit={join} noValidate>
            <label htmlFor="join-code" className="join__label label">
              Join with a code
            </label>
            <div className="join__row">
              <input
                id="join-code"
                className="join__input"
                value={code}
                onChange={(e) => {
                  setErr(null);
                  setCode(normalizeCode(e.target.value).slice(0, 5));
                }}
                placeholder="K7QX2"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
                maxLength={40}
                aria-invalid={err ? true : undefined}
                aria-describedby="join-hint"
              />
              <button type="submit" className="btn btn--ghost join__go">
                Join
              </button>
            </div>
            <p id="join-hint" className={`join__hint${err ? ' is-err' : ''}`} role={err ? 'alert' : undefined}>
              {err ?? 'Or paste the whole invite link.'}
            </p>
          </form>
        </div>

        <ul className="hero__facts label" aria-label="At a glance">
          <li>2 to 6 players</li>
          <li>6 hands a night</li>
          <li>One link</li>
          <li>No accounts</li>
        </ul>
      </div>

      <Matchbook />

      <p className="hero__vert vert" aria-hidden="true">
        最悪の手で、一緒に勝つ。
      </p>
    </section>
  );
}

/** The object that started it: the matchbook on the bar. Pure CSS and type. */
function Matchbook() {
  return (
    <div className="mb" aria-hidden="true">
      <div className="mb__cover">
        <div className="mb__frame">
          <p className="mb__top">Bar · 八九三</p>
          <p className="mb__kanji">賭</p>
          <p className="mb__mid">Hold'em</p>
          <p className="mb__addr">
            Golden Gai 5-1
            <br />
            2F · No phone
          </p>
        </div>
        <Seal className="mb__seal" chars="親" shape="round" size={46} tilt={-12} seed={17} color="var(--shu)" paper="var(--sumi)" />
      </div>
      <div className="mb__flap">
        <span className="mb__strike" />
        <span className="mb__close">Close cover before striking</span>
      </div>
    </div>
  );
}

const BEATS = [
  {
    n: '一',
    title: 'The deal',
    body: 'Two cards each, face down. Across the table, the House deals a pair to every mask.',
    art: <ArtDeal />,
  },
  {
    n: '二',
    title: 'The House Rule',
    body: 'From the second hand, one card flips and bends the rules. Fog hides the river. Serpent takes the ties.',
    art: <ArtRule />,
  },
  {
    n: '三',
    title: 'Four quiet calls',
    body: 'Pre-flop, flop, turn, river. Everyone picks Fold, Stay, or Raise in secret. Then every call flips at once.',
    art: <ArtCalls />,
  },
  {
    n: '四',
    title: 'The showdown',
    body: "The crew's best hand faces the House's best: win, and every stake still in gets paid. But each mask watches two seats. Lose to yours and you draw heat anyway.",
    art: <ArtShowdown />,
  },
];

function Beats() {
  return (
    <section className="beats" aria-labelledby="beats-title">
      <header className="sec-head reveal">
        <p className="label sec-head__k">The play · 手順</p>
        <h2 id="beats-title" className="sec-head__title">
          How a hand plays.
        </h2>
      </header>
      <ol className="beats__list">
        {BEATS.map((b, i) => (
          <li key={b.n} className="beat reveal" style={{ animationDelay: `${i * 60}ms` }}>
            <span className="beat__n vert" aria-hidden="true">
              {b.n}
            </span>
            <div className="beat__art">{b.art}</div>
            <h3 className="beat__title">
              <span className="sr-only">Step {i + 1}: </span>
              {b.title}
            </h3>
            <p className="beat__body">{b.body}</p>
          </li>
        ))}
      </ol>
      <p className="beats__aside hand reveal" aria-hidden="true">
        weak hand? ride the strong one's raise.
      </p>
    </section>
  );
}

function Deck() {
  const [flipped, setFlipped] = useState<RuleId | null>(null);
  return (
    <section className="deck" aria-labelledby="deck-title">
      <header className="sec-head reveal">
        <p className="label sec-head__k">House Rules · 掟</p>
        <h2 id="deck-title" className="sec-head__title">
          Nine cards. One flips each hand.
        </h2>
        <p className="sec-head__sub">Hover or tap a card to read it. The House is polite about it.</p>
      </header>
      <ul className="fan" style={{ ['--n' as string]: DECK.length }}>
        {DECK.map((id, i) => {
          const r = RULES[id];
          const isFlipped = flipped === id;
          return (
            <li key={id} className="fan__slot" style={{ ['--i' as string]: i }}>
              <button
                type="button"
                className={`rc rc--${r.kind}${isFlipped ? ' is-flipped' : ''}`}
                aria-pressed={isFlipped}
                aria-label={`${r.name}, ${r.romaji}. ${r.text} ${KIND_LABEL[r.kind]}.`}
                onClick={() => {
                  sfx.unlock();
                  sfx.flip();
                  setFlipped(isFlipped ? null : id);
                }}
                onMouseEnter={() => sfx.hover()}
              >
                <span className="rc__inner" aria-hidden="true">
                  <span className="rc__face rc__front">
                    <span className="rc__corner">{r.romaji}</span>
                    <span className="rc__kanji">{r.kanji}</span>
                    <span className="rc__name">{r.name}</span>
                    <span className="rc__corner rc__corner--b">{String(i + 1).padStart(2, '0')}</span>
                  </span>
                  <span className="rc__face rc__back">
                    <span className="rc__bk">{r.kanji}</span>
                    <span className="rc__bname">{r.name}</span>
                    <span className="rc__text">{r.text}</span>
                    <span className="rc__flavor">“{r.flavor}”</span>
                    <span className={`rc__kind rc__kind--${r.kind}`}>{KIND_LABEL[r.kind]}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Tables() {
  return (
    <section className="tables" aria-labelledby="tables-title">
      <header className="sec-head reveal">
        <p className="label sec-head__k">Difficulty · 席</p>
        <h2 id="tables-title" className="sec-head__title">
          Three tables, three Houses.
        </h2>
      </header>
      <div className="tables__row">
        {TABLE_ORDER.map((id, i) => {
          const t = TABLES[id];
          return (
            <article key={id} className={`plaque plaque--${id} reveal`} style={{ animationDelay: `${i * 80}ms` }}>
              <p className="plaque__kanji vert" aria-hidden="true">
                {t.kanji}
              </p>
              <div className="plaque__body">
                <p className="label plaque__lvl">
                  <span className="plaque__pips" aria-hidden="true">
                    {[0, 1, 2].map((p) => (
                      <i key={p} className={p <= i ? 'on' : ''} />
                    ))}
                  </span>
                  {['The easy room', 'The real thing', 'Bring friends'][i]}
                </p>
                <h3 className="plaque__name">{t.name}</h3>
                <p className="plaque__blurb">{t.blurb}</p>
                <dl className="plaque__stats">
                  <div>
                    <dt>Clean odds</dt>
                    <dd>{t.odds}</dd>
                  </div>
                  <div>
                    <dt>Rules deck</dt>
                    <dd>{t.deck.length}</dd>
                  </div>
                  <div>
                    <dt>First rule</dt>
                    <dd>Hand {t.ruleFrom}</dd>
                  </div>
                </dl>
                <p className="plaque__deck" aria-label={`Rules in this deck: ${t.deck.map((r) => RULES[r].name).join(', ')}`}>
                  {t.deck.map((r) => (
                    <span key={r} title={RULES[r].name}>
                      {RULES[r].kanji}
                    </span>
                  ))}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Quiet() {
  return (
    <section className="quiet" aria-labelledby="quiet-title">
      <p className="quiet__k vert reveal" aria-hidden="true">
        静かに
      </p>
      <div className="quiet__body reveal">
        <p className="label sec-head__k">Why it's quiet</p>
        <h2 id="quiet-title" className="quiet__title">
          The only conversation is the flip.
        </h2>
        <p className="quiet__p">
          <span className="quiet__drop">Y</span>ou can't tell the crew what you're holding. There's no chat, no voice, no table
          talk. All you can do is commit: fold, stay, or raise, and watch what everyone else committed to when the calls turn
          over together.
        </p>
        <p className="quiet__p">
          A raise says <em>I've got this one, pile in.</em> A fold from the wrong seat leaves everybody exposed. After a few
          hands, a crew of strangers starts reading each other like old friends. That's the game.
        </p>
        <p className="quiet__sig hand">— the bartender</p>
      </div>
    </section>
  );
}

function MatchbookFooter({ onRules }: { onRules: () => void }) {
  return (
    <footer className="foot night">
      <div className="foot__strike" aria-hidden="true" />
      <div className="foot__inner">
        <div className="foot__brand">
          <p className="foot__893" aria-hidden="true">
            893
          </p>
          <p className="foot__line">Matches for the crew. Strike on box.</p>
        </div>
        <div className="foot__cols">
          <div>
            <p className="label foot__k">The bar</p>
            <ul>
              <li>
                <button
                  type="button"
                  className="foot__btn"
                  onClick={() => {
                    sfx.unlock();
                    navigate(`/t/${makeRoomCode()}`);
                  }}
                >
                  Open a table
                </button>
              </li>
              <li>
                <button type="button" className="foot__btn" onClick={onRules}>
                  House rules
                </button>
              </li>
            </ul>
          </div>
          <div>
            <p className="label foot__k">The fine print</p>
            <ul>
              <li>
                <a href={REPO} target="_blank" rel="noreferrer">
                  Source on GitHub
                </a>
              </li>
              <li>
                <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
                  MIT license
                </a>
              </li>
            </ul>
          </div>
        </div>
        <Seal className="foot__seal" chars="閉" shape="square" size={54} tilt={8} seed={23} paper="var(--sumi)" />
      </div>
      <p className="foot__base label">
        <span>No accounts. No ads. No cards were harmed.</span>
        <span>Close cover before striking · 八九三</span>
      </p>
    </footer>
  );
}

/* ---- Beat illustrations: ink on paper, drawn by hand in SVG. ---------- */

const ink = { fill: 'none', stroke: 'var(--sumi)', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function ArtDeal() {
  return (
    <svg viewBox="0 0 160 110" aria-hidden="true">
      <g transform="rotate(-12 64 80)">
        <rect x="40" y="22" width="46" height="66" rx="4" {...ink} fill="var(--washi)" />
        <rect x="45" y="27" width="36" height="56" rx="2" fill="url(#hatch)" stroke="none" />
      </g>
      <g transform="rotate(9 96 80)">
        <rect x="72" y="20" width="46" height="66" rx="4" {...ink} fill="#f7f2e7" />
        <text x="80" y="38" fontFamily="var(--serif)" fontWeight="800" fontSize="15" fill="var(--shu)">
          A
        </text>
        <path d="M95 52c-4-6-12-2-8 5l8 9 8-9c4-7-4-11-8-5z" fill="var(--shu)" stroke="none" />
      </g>
      <path d="M22 98c30 4 86 4 116 0" {...ink} strokeWidth={1} opacity={0.5} />
      <defs>
        <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0v5" stroke="var(--shu)" strokeWidth="1.2" opacity="0.55" />
        </pattern>
      </defs>
    </svg>
  );
}

function ArtRule() {
  return (
    <svg viewBox="0 0 160 110" aria-hidden="true">
      <rect x="34" y="18" width="50" height="72" rx="4" {...ink} fill="#f7f2e7" />
      <text x="59" y="62" textAnchor="middle" fontFamily="var(--serif)" fontWeight="800" fontSize="30" fill="var(--sumi)">
        霧
      </text>
      <path d="M96 22c6 0 10 0 14 3v62c-4-3-8-3-14-3z" {...ink} fill="var(--sumi)" />
      <path d="M90 40c8-8 22-10 32-4" {...ink} strokeDasharray="2 4" />
      <path d="M118 31l5 5-6 3" {...ink} />
      <path d="M24 100h112" {...ink} strokeWidth={1} opacity={0.5} />
    </svg>
  );
}

function ArtCalls() {
  const stamps = [
    { k: '降', c: 'var(--sumi)', x: 14, r: -6 },
    { k: '待', c: 'var(--ai)', x: 58, r: 3 },
    { k: '攻', c: 'var(--shu)', x: 102, r: -2 },
  ];
  return (
    <svg viewBox="0 0 160 110" aria-hidden="true">
      {stamps.map((s) => (
        <g key={s.k} transform={`rotate(${s.r} ${s.x + 22} 50)`}>
          <rect x={s.x} y="28" width="44" height="44" rx="3" fill={s.c} />
          <text x={s.x + 22} y="51" textAnchor="middle" dominantBaseline="central" fontFamily="var(--serif)" fontWeight="800" fontSize="26" fill="var(--washi)">
            {s.k}
          </text>
        </g>
      ))}
      <path d="M20 92h120" {...ink} strokeWidth={1} opacity={0.5} />
      <path d="M36 86v-6M80 86v-6M124 86v-6" {...ink} strokeWidth={1} />
    </svg>
  );
}

function ArtShowdown() {
  return (
    <svg viewBox="0 0 160 110" aria-hidden="true">
      <rect x="14" y="30" width="34" height="50" rx="3" {...ink} fill="#f7f2e7" />
      <rect x="28" y="26" width="34" height="50" rx="3" {...ink} fill="#f7f2e7" />
      <text x="35" y="44" fontFamily="var(--serif)" fontWeight="800" fontSize="12" fill="var(--shu)">
        Q
      </text>
      <rect x="98" y="26" width="34" height="50" rx="3" {...ink} fill="var(--sumi)" />
      <rect x="112" y="30" width="34" height="50" rx="3" {...ink} fill="var(--sumi)" />
      <path d="M120 44c4-3 12-3 16 0-1 9-4 14-8 14s-7-5-8-14z" fill="none" stroke="var(--kin)" strokeWidth={1.2} />
      <path d="M124 48h3M131 48h3" stroke="var(--kin)" strokeWidth={1.2} strokeLinecap="round" />
      <text x="80" y="60" textAnchor="middle" fontFamily="var(--serif)" fontWeight="800" fontSize="20" fill="var(--shu)">
        対
      </text>
      <path d="M14 96h132" {...ink} strokeWidth={1} opacity={0.5} />
    </svg>
  );
}
