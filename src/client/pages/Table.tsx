// The night world. Paper doors slide open on a lacquer table; the HUD sits on top.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { sfx, useGameSounds } from '../audio';
import { Link } from '../app/router';
import { Banner, bartender } from '../hud/Banner';
import { CallDock } from '../hud/CallDock';
import { Lobby } from '../hud/Lobby';
import { ReactionFloats, ReactionsTray } from '../hud/Reactions';
import { Receipt } from '../hud/Receipt';
import { Showdown } from '../hud/Showdown';
import { TopBar } from '../hud/TopBar';
import { loadMuted, loadProfile, saveMuted, saveProfile } from '../lib/profile';
import { isPracticeCode } from '../net/practice';
import { useTable, type Profile } from '../net/store';
import { ProfileForm } from '../profile/ProfileForm';
import { TableScene } from '../scene';
import { BarCat, Narrator, checkName, type Line } from '../story';
import { subtitleSlot } from '../story/stage';
import { RulesDrawer } from '../ui/RulesDrawer';
import { Seal } from '../ui/Seal';
import './table.css';
import { useTableStory } from '../hud/useTableStory';
import '../hud/hud.css';

const NO_LINES: readonly Line[] = [];

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const change = () => setOn(m.matches);
    change();
    m.addEventListener('change', change);
    return () => m.removeEventListener('change', change);
  }, [query]);
  return on;
}

function useReducedMotion(): boolean {
  return useMedia('(prefers-reduced-motion: reduce)');
}

export function TablePage({ code }: { code: string }) {
  const [profile, setProfile] = useState<Profile | null>(() => loadProfile());
  const [editing, setEditing] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  // The subtitles wait for the shoji: nobody speaks behind a closed door.
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [muted, setMuted] = useState(() => loadMuted());
  const view = useTable((s) => s.view);
  const status = useTable((s) => s.status);
  const error = useTable((s) => s.error);
  const reduced = useReducedMotion();
  const practice = isPracticeCode(code);
  const wide = useMedia('(min-width: 900px)');

  useEffect(() => {
    document.title = practice ? "Practice with the regulars · 893 Hold'em" : `Table ${code} · 893 Hold'em`;
  }, [code, practice]);

  // Connect once we know who's sitting down; leave when the page goes.
  const profileReady = profile !== null;
  useEffect(() => {
    if (!profileReady) return;
    const p = loadProfile() ?? { name: 'Stranger', avatar: 'kitsune' };
    checkName(p.name);
    useTable.getState().connect(code, p);
    return () => useTable.getState().leave();
  }, [code, profileReady]);

  // Audio stays locked until a gesture; ambience follows the mute switch.
  useEffect(() => {
    sfx.setMuted(muted);
    const unlock = () => {
      sfx.unlock();
      if (!muted) sfx.ambience(true);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      sfx.ambience(false);
    };
  }, [muted]);

  useGameSounds(view);
  const story = useTableStory(view, code);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    saveMuted(next);
    sfx.setMuted(next);
    sfx.ambience(!next);
    if (!next) sfx.click();
  };

  const sitDown = (p: Profile) => {
    setProfile(saveProfile(p));
  };

  const rename = (p: Profile) => {
    const saved = saveProfile(p);
    setProfile(saved);
    setEditing(false);
    useTable.getState().send({ t: 'rename', name: saved.name, avatar: saved.avatar });
    checkName(saved.name);
  };

  const openRules = () => {
    sfx.click();
    setRulesOpen(true);
  };

  const slot = subtitleSlot(view?.phase, wide);
  const subtitles = (
    <Narrator lines={doorsOpen ? story.lines : NO_LINES} tone="night" className={`hud__subs hud__subs--${slot}`} />
  );

  const fatal = !view && (status === 'closed' || error) ? bartender(error) ?? 'The line went dead before we found your table.' : null;

  return (
    <div className="table night" data-phase={view?.phase ?? 'none'}>
      <div className={`table__scene${view ? ' is-on' : ''}`}>{view && <TableScene view={view} quality={reduced ? 'low' : 'high'} />}</div>
      <div className="table__vignette" aria-hidden="true" />

      {view && (
        <div className="hud">
          <TopBar
            view={view}
            muted={muted}
            onMute={toggleMute}
            onRules={openRules}
            extra={story.cat ? <BarCat className="top__cat" size={46} /> : null}
          />
          <Banner status={status} error={error} hasView onRetry={() => profile && useTable.getState().connect(code, profile)} />
          <main className="hud__main" id="main">
            {view.phase === 'lobby' && <Lobby view={view} onEditProfile={() => setEditing(true)} />}
            {view.phase === 'over' && <Receipt view={view} aside={slot === 'aside' ? subtitles : null} />}
          </main>
          {slot !== 'aside' && subtitles}
          <div className="hud__bottom">
            {view.phase === 'call' && <CallDock view={view} />}
            {view.phase === 'showdown' && <Showdown view={view} />}
          </div>
          <ReactionsTray view={view} />
          <ReactionFloats view={view} />
        </div>
      )}

      <Shoji open={!!view} reduced={reduced} onGone={setDoorsOpen}>
        {!profile ? (
          <div className="shoji__card paper">
            <ProfileForm initial={null} code={code} onSubmit={sitDown} />
          </div>
        ) : fatal ? (
          <div className="shoji__msg">
            <Seal chars="閉" shape="round" size={64} seed={31} tilt={-8} />
            <p className="shoji__title">{fatal}</p>
            <Link to="/" className="btn btn--ghost">
              Back to the bar
            </Link>
          </div>
        ) : (
          <div className="shoji__msg" role="status">
            <Seal chars="八九三" shape="tall" size={40} seed={4} />
            <p className="shoji__title">{practice ? 'Pouring for the regulars.' : `Finding table ${code}.`}</p>
            <p className="label shoji__sub">{status === 'reconnecting' ? 'Knocking again' : 'The lantern is warming up'}</p>
          </div>
        )}
      </Shoji>

      <ProfileDialog open={editing} code={code} profile={profile} onSubmit={rename} onClose={() => setEditing(false)} />
      <RulesDrawer open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}

/** Two paper doors with a lantern behind them. They slide apart when the table is ready. */
function Shoji({
  open,
  reduced,
  onGone,
  children,
}: {
  open: boolean;
  reduced: boolean;
  onGone?: (gone: boolean) => void;
  children: ReactNode;
}) {
  const [gone, setGone] = useState(false);
  const report = useRef(onGone);
  useEffect(() => {
    report.current = onGone;
  }, [onGone]);
  useEffect(() => {
    if (!open) {
      setGone(false);
      report.current?.(false);
      return;
    }
    sfx.reveal();
    const t = setTimeout(
      () => {
        setGone(true);
        report.current?.(true);
      },
      reduced ? 450 : 1700,
    );
    return () => clearTimeout(t);
  }, [open, reduced]);
  if (gone) return null;
  return (
    <div className={`shoji${open ? ' is-open' : ''}`} aria-hidden={open || undefined}>
      <div className="shoji__glow" />
      <div className="shoji__door shoji__door--l paper" />
      <div className="shoji__door shoji__door--r paper" />
      {!open && <div className="shoji__center">{children}</div>}
    </div>
  );
}

function ProfileDialog({
  open,
  code,
  profile,
  onSubmit,
  onClose,
}: {
  open: boolean;
  code: string;
  profile: Profile | null;
  onSubmit: (p: Profile) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="pdialog paper" onClose={onClose} aria-label="Change your name and seal">
      {open && <ProfileForm initial={profile} code={code} submitLabel="Save" onSubmit={onSubmit} onCancel={onClose} />}
    </dialog>
  );
}
