// Kyū, the bar cat. A black loaf with one white sock who turns up on certain
// nights (see catVisits). Pet her and she closes her eyes; the first time, she
// leaves a stamp in your matchbook.

import { useState } from 'react';
import { petCat } from './eggs';

export function BarCat({ className, size = 96 }: { className?: string; size?: number }) {
  const [content, setContent] = useState(false);
  const pet = () => {
    if (!content) petCat();
    setContent(true);
    setTimeout(() => setContent(false), 2600);
  };
  return (
    <button
      type="button"
      className={['bar-cat', className].filter(Boolean).join(' ')}
      data-content={content || undefined}
      onClick={pet}
      aria-label="Kyū, the bar cat"
      title="Kyū"
    >
      <svg viewBox="0 0 120 80" width={size} height={(size * 80) / 120} aria-hidden="true">
        {/* Tail, curled along the bar. */}
        <path className="bar-cat__tail" d="M98 66 C 116 64, 118 46, 106 40" fill="none" stroke="#0f0e0d" strokeWidth="7" strokeLinecap="round" />
        {/* The loaf. */}
        <path d="M20 70 C 18 46, 40 34, 64 36 C 88 38, 104 50, 102 70 Z" fill="#0f0e0d" />
        {/* Head. */}
        <g className="bar-cat__head">
          <path d="M14 46 L 18 22 L 30 34 Q 38 31 46 34 L 58 22 L 60 46 Q 60 62 37 63 Q 14 62 14 46 Z" fill="#0f0e0d" />
          <path d="M20 27 L 27 34 L 21 37 Z" fill="#3a2422" />
          <path d="M56 27 L 49 34 L 55 37 Z" fill="#3a2422" />
          <g className="bar-cat__eyes">
            <ellipse cx="29" cy="46" rx="4.2" ry="3.4" fill="#c9a45c" />
            <ellipse cx="45" cy="46" rx="4.2" ry="3.4" fill="#c9a45c" />
            <rect x="28.2" y="43" width="1.6" height="6" rx="0.8" fill="#0f0e0d" />
            <rect x="44.2" y="43" width="1.6" height="6" rx="0.8" fill="#0f0e0d" />
          </g>
          <g className="bar-cat__squint" stroke="#c9a45c" strokeWidth="1.6" fill="none" strokeLinecap="round">
            <path d="M25 46 Q 29 49 33 46" />
            <path d="M41 46 Q 45 49 49 46" />
          </g>
          <path d="M35 52 L 37 54 L 39 52" fill="none" stroke="#3a2422" strokeWidth="1.2" />
        </g>
        {/* The one white sock. */}
        <ellipse cx="52" cy="70" rx="8" ry="4" fill="#efe8da" />
      </svg>
      <span className="bar-cat__purr" aria-hidden="true">
        ごろごろ
      </span>
    </button>
  );
}
