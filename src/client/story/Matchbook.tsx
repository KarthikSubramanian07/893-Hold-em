// The matchbook: a vermilion cover from a bar with no website. Open it and the
// inside of the cover keeps the story so far (the three chapters, and what the
// Master said when each was cleared); the card inside keeps the stamps.

import { useMemo, useState } from 'react';
import type { Difficulty } from '../../engine/types';
import { CHAPTERS, EGG_LINES, MASTER } from './lines';
import { Seal } from './Seal';
import { STAMPS, type MatchbookData, type Stamp, useMatchbook } from './stamps';

export interface MatchbookProps {
  /** Defaults to the stored matchbook. */
  data?: MatchbookData;
  /** Controlled open state. Uncontrolled by default. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  className?: string;
}

const ORDER: Difficulty[] = ['shitamachi', 'kabukicho', 'oyabun'];

function stampedOn(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function Matchbook({ data: given, open: controlled, onOpenChange, onClose, className }: MatchbookProps) {
  const stored = useMatchbook((s) => s.data);
  const data = given ?? stored;
  const [own, setOwn] = useState(false);
  const open = controlled ?? own;
  const setOpen = (v: boolean) => {
    if (controlled === undefined) setOwn(v);
    onOpenChange?.(v);
  };
  const [focus, setFocus] = useState<Stamp['id'] | null>(null);

  const count = STAMPS.filter((s) => data.stamps[s.id]).length;
  // With nothing pointed at, feature the most recent stamp.
  const latest = useMemo(
    () => STAMPS.filter((s) => data.stamps[s.id]).sort((a, b) => data.stamps[b.id]! - data.stamps[a.id]!)[0] ?? null,
    [data],
  );
  const selected = STAMPS.find((s) => s.id === focus) ?? latest;
  const selectedAt = selected ? data.stamps[selected.id] : undefined;
  const selectedHidden = !!selected?.secret && !selectedAt;

  return (
    <section className={['matchbook', className].filter(Boolean).join(' ')} data-open={open || undefined} aria-label="Matchbook">
      <div className="matchbook__book">
        {/* The card inside: the stamps. */}
        <div className="matchbook__inside" aria-hidden={!open}>
          <header className="matchbook__head">
            <span className="matchbook__label">押印帳 · Stamps</span>
            <span className="matchbook__count">
              {count}
              <small>/{STAMPS.length}</small>
            </span>
          </header>
          <ol className="matchbook__grid">
            {STAMPS.map((s) => {
              const at = data.stamps[s.id];
              const hidden = s.secret && !at;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className="matchbook__slot"
                    data-stamped={at ? true : undefined}
                    data-active={selected?.id === s.id || undefined}
                    tabIndex={open ? 0 : -1}
                    onMouseEnter={() => setFocus(s.id)}
                    onFocus={() => setFocus(s.id)}
                    onClick={() => setFocus(s.id)}
                  >
                    <span className="sr-only">{hidden ? 'An unfound secret stamp' : `${s.name}${at ? ', stamped' : ', not yet'}`}</span>
                    <span className="matchbook__ring">
                      {hidden ? (
                        <span className="matchbook__secret">?</span>
                      ) : (
                        <Seal text={s.kanji} shape={s.shape} variant={at ? 'solid' : 'ghost'} size="100%" />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <footer className="matchbook__detail" aria-live="polite" data-stamped={selectedAt ? true : undefined}>
            {selected ? (
              <>
                <span className="matchbook__feature">
                  {selectedHidden ? (
                    <span className="matchbook__secret matchbook__secret--big">?</span>
                  ) : (
                    <Seal text={selected.kanji} shape={selected.shape} variant={selectedAt ? 'solid' : 'ghost'} size="100%" />
                  )}
                </span>
                <span className="matchbook__words">
                  <strong>{selectedHidden ? 'Not yet found' : selected.name}</strong>
                  <span>{selectedHidden ? 'Some things at the bar only happen if you look.' : selected.verse}</span>
                  <time>{selectedAt ? `押印 ${stampedOn(selectedAt)}` : '未押印 · not yet'}</time>
                </span>
              </>
            ) : (
              <span className="matchbook__hint">Nothing stamped yet. Every stool starts empty.</span>
            )}
          </footer>
        </div>

        {/* The cover. Its front is the art; its back is the inside of the flap. */}
        <div className="matchbook__cover">
          <button type="button" className="matchbook__front" onClick={() => setOpen(true)} tabIndex={open ? -1 : 0}>
            <span className="sr-only">Open the matchbook</span>
            <span className="matchbook__bar" aria-hidden="true">BAR</span>
            <span className="matchbook__kanji" aria-hidden="true">八九三</span>
            <span className="matchbook__numerals" aria-hidden="true">893</span>
            <span className="matchbook__rule" />
            <span className="matchbook__address" aria-hidden="true">
              新宿区 ゴールデン街 · 二階
              <br />
              Upstairs · Six stools · No phone
            </span>
            <Seal className="matchbook__mark" text="主" size={34} variant="outline" color="var(--washi, #efe8da)" tilt={4} />
            <span className="matchbook__striker" />
            <span className="matchbook__staple" />
          </button>

          <div className="matchbook__flap" aria-hidden={!open}>
            <header>
              <span className="matchbook__label">The story so far</span>
              <span className="matchbook__nights">
                {data.nights} {data.nights === 1 ? 'night' : 'nights'}
              </span>
            </header>
            <ol className="matchbook__chapters">
              {ORDER.map((id) => {
                const ch = CHAPTERS[id];
                const cleared = data.cleared.includes(id);
                const beat = ch.epilogue.clean[0]![0]!;
                return (
                  <li key={id} data-cleared={cleared || undefined}>
                    <span className="matchbook__chno">第{ch.number}章</span>
                    <div>
                      <h3>
                        <span lang="ja">{ch.kanji}</span> {ch.title}
                      </h3>
                      <p>{cleared ? `“${beat}”` : ch.synopsis}</p>
                    </div>
                    {cleared ? <Seal className="matchbook__cleared" text="済" shape="round" size={30} color="var(--kin, #c9a45c)" /> : null}
                  </li>
                );
              })}
            </ol>
            <p className="matchbook__note">
              {EGG_LINES.matchbook[0]}
              <span>— {MASTER.name.replace('The ', 'the ')}</span>
            </p>
            <button
              type="button"
              className="matchbook__close"
              tabIndex={open ? 0 : -1}
              onClick={() => {
                setOpen(false);
                onClose?.();
              }}
            >
              Close the matchbook
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
