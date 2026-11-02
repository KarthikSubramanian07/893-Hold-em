// Reactions, drawn with a brush that had a drink or two. 24×24, stroked.
import type { Reaction } from '../../protocol';

export const REACTION_LABEL: Record<Reaction, string> = {
  clink: 'Kanpai',
  smoke: 'Sigh',
  nod: 'Nod',
  bow: 'Bow',
  fire: 'Hot hand',
  ghost: 'Spooked',
};

const PATHS: Record<Reaction, string[]> = {
  clink: [
    'M3.6 9.2c1.6-.5 3.5-.8 5.2-.7l-.6 7.6c-.1 1-1.6 1.5-2.6 1.1-.8-.3-1.2-.9-1.3-1.6z',
    'M20.4 9.2c-1.6-.5-3.5-.8-5.2-.7l.6 7.6c.1 1 1.6 1.5 2.6 1.1.8-.3 1.2-.9 1.3-1.6z',
    'M12 3.4v2.4',
    'M8.8 4.6l1.2 1.8',
    'M15.2 4.6 14 6.4',
    'M6.4 18.2v2.4',
    'M17.6 18.2v2.4',
  ],
  smoke: [
    'M9 21c-2.2-1.6-2.4-3.4-.6-5.1 1.9-1.8 1.6-3.6-.4-5.2-1.6-1.3-1.4-3 .4-4.6',
    'M14.6 20.4c-1.8-1.3-1.9-2.8-.4-4.2 1.5-1.4 1.3-2.9-.3-4.2',
    'M17.8 8.2c1.2-.4 1.9-1.2 1.6-2.3',
  ],
  nod: [
    'M12 12.6a3.9 3.9 0 1 0 0-7.8 3.9 3.9 0 0 0 0 7.8z',
    'M5.2 19.6c1.5-2.3 4-3.6 6.8-3.6s5.3 1.3 6.8 3.6',
    'M19.4 6.4c.9 1.2 1.2 2.6.9 4',
    'M19.2 10.6l1.1-.3.4 1.1',
  ],
  bow: [
    'M7.6 9.8a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z',
    'M10.2 8.6c2.9.4 5.1 1.6 6.2 3.8.5 1.1.6 2.4.5 3.6l-.3 4.4',
    'M12.6 13.2l-1 6.8',
    'M3.4 20.4h17.2',
  ],
  fire: [
    'M12.2 2.8c.6 3.3 4.7 5 5.4 9.3.7 4.2-2.3 8.2-5.9 8.2-3.4 0-6-2.8-5.8-6.2.1-2.4 1.6-3.8 2.6-5.5.3 1.6 1 2.6 2.1 3.1-.3-3.2.3-6.3 1.6-8.9z',
    'M11.6 20.2c-1.6-.4-2.3-1.7-1.9-3.2.3-1.1 1.2-1.8 1.6-2.9.8 1 2.2 1.8 2.2 3.5 0 1.5-.9 2.5-1.9 2.6',
  ],
  ghost: [
    'M5.6 20.6V11a6.4 6.4 0 0 1 12.8 0v9.6l-2.1-1.7-2.1 1.9-2.2-1.9-2.2 1.9-2.1-1.9z',
    'M9.6 10.8v1.2',
    'M14.2 10.8v1.2',
    'M10.6 15.2c.9.5 1.9.5 2.8 0',
  ],
};

export function ReactionGlyph({ reaction, size = 24, strokeWidth = 1.6 }: { reaction: Reaction; size?: number; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[reaction].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
