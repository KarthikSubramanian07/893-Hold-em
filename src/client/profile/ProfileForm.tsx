// "Who's drinking tonight?" A name and a seal, remembered on this device.
import { useId, useState, type FormEvent } from 'react';
import type { Avatar } from '../../engine/types';
import { AVATARS, NAME_MAX } from '../../protocol';
import { sfx } from '../audio';
import type { Profile } from '../net/store';
import { tidyName } from '../lib/profile';
import { AVATAR_INFO, AvatarSeal } from '../ui/avatars';
import './profile.css';

export function ProfileForm({
  initial,
  code,
  submitLabel = 'Take a seat',
  onSubmit,
  onCancel,
}: {
  initial: Profile | null;
  code: string;
  submitLabel?: string;
  onSubmit: (p: Profile) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [avatar, setAvatar] = useState<Avatar>(initial?.avatar ?? AVATARS[Math.floor(Math.random() * AVATARS.length)]!);
  const [err, setErr] = useState<string | null>(null);
  const id = useId();
  const count = Array.from(name).length;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    sfx.unlock();
    const clean = name.trim();
    if (!clean) {
      setErr('The Master needs something to call you.');
      return;
    }
    sfx.stamp();
    onSubmit({ name: clean, avatar });
  };

  return (
    <form className="pf" onSubmit={submit} noValidate>
      <p className="label pf__k">
        Table <span className="pf__code">{code}</span>
      </p>
      <h2 className="pf__title">Who's drinking tonight?</h2>
      <p className="pf__sub">A name and a seal. Your crew will see your cards tonight; you won't. No account, no email. We keep it on this device.</p>

      <div className="pf__field">
        <label htmlFor={`${id}-name`} className="label pf__label">
          Your name
        </label>
        <div className="pf__name">
          <input
            id={`${id}-name`}
            value={name}
            onChange={(e) => {
              setErr(null);
              setName(tidyName(e.target.value));
            }}
            placeholder="Stranger"
            autoComplete="nickname"
            enterKeyHint="go"
            maxLength={NAME_MAX * 2}
            aria-invalid={err ? true : undefined}
            aria-describedby={`${id}-hint`}
            autoFocus
          />
          <span className="pf__count" aria-hidden="true">
            {count}/{NAME_MAX}
          </span>
        </div>
        <p id={`${id}-hint`} className={`pf__hint${err ? ' is-err' : ''}`} role={err ? 'alert' : undefined}>
          {err ?? 'Kanji welcome.'}
        </p>
      </div>

      <fieldset className="pf__field pf__seals">
        <legend className="label pf__label">Your seal</legend>
        <div className="pf__grid">
          {AVATARS.map((a) => {
            const info = AVATAR_INFO[a];
            return (
              <label key={a} className={`pf__seal${avatar === a ? ' is-on' : ''}`} onMouseEnter={() => sfx.hover()}>
                <input
                  type="radio"
                  name={`${id}-avatar`}
                  value={a}
                  checked={avatar === a}
                  onChange={() => {
                    sfx.click();
                    setAvatar(a);
                  }}
                  className="sr-only"
                />
                <AvatarSeal avatar={a} size={52} />
                <span className="pf__romaji">{info.romaji}</span>
                <span className="sr-only">{info.name}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="pf__actions">
        <button type="submit" className="btn btn--shu">
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Never mind
          </button>
        )}
      </div>
    </form>
  );
}
