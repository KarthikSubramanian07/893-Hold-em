// The House Rule card that isn't in any deck. It slides out when someone
// enters the Konami code, and goes back when you tap it.

import { BUTA_CARD } from './eggs';
import { Seal } from './Seal';

export function HiddenCard({ open, onClose, className }: { open: boolean; onClose: () => void; className?: string }) {
  return (
    <div className={['hidden-card', className].filter(Boolean).join(' ')} data-open={open || undefined} aria-hidden={!open}>
      <button type="button" className="hidden-card__card" onClick={onClose} tabIndex={open ? 0 : -1} aria-label="Put the card back">
        <span className="hidden-card__corner">零</span>
        <span className="hidden-card__kanji" lang="ja">
          {BUTA_CARD.kanji}
        </span>
        <span className="hidden-card__name">
          {BUTA_CARD.romaji} · {BUTA_CARD.name}
        </span>
        <span className="hidden-card__text">{BUTA_CARD.text}</span>
        <span className="hidden-card__flavor">{BUTA_CARD.flavor}</span>
        <Seal className="hidden-card__seal" text="八九三" size={40} tilt={-6} />
      </button>
    </div>
  );
}
