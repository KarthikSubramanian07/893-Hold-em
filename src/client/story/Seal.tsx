// A hanko, drawn by hand in SVG. The ink is uneven on purpose: a turbulence
// field roughens the edge and leaves small voids where the paste didn't take,
// seeded per seal so no two look quite alike.

import { useId } from 'react';
import { hash } from './hash';

export interface SealProps {
  /** One to four characters. Read top to bottom, right to left. */
  text: string;
  shape?: 'square' | 'round';
  /** `solid`: white characters on red (hakubun). `outline`: red characters inside a red border (shubun). */
  variant?: 'solid' | 'outline' | 'ghost';
  size?: number | string;
  /** Degrees. Real stamps are never quite straight. */
  tilt?: number;
  color?: string;
  title?: string;
  className?: string;
}

function layout(chars: string[], round: boolean): { x: number; y: number; size: number; ch: string }[] {
  const n = chars.length;
  if (n === 4) {
    // Two columns, right column first.
    const s = round ? 30 : 38;
    const [a, b] = round ? [65, 35] : [70, 30];
    return chars.map((ch, i) => ({ ch, size: s, x: i < 2 ? a! : b!, y: i % 2 === 0 ? (round ? 35 : 31) : round ? 65 : 70 }));
  }
  const usable = round ? (n === 1 ? 60 : 70) : 86;
  const size = n === 1 ? (round ? 58 : 64) : usable / n;
  const top = 50 - (size * n) / 2 + size / 2;
  return chars.map((ch, i) => ({ ch, size, x: 50, y: top + i * size }));
}

export function Seal({ text, shape = 'square', variant = 'solid', size = 64, tilt, color = 'var(--shu, #d2412a)', title, className }: SealProps) {
  const raw = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = `seal${raw}`;
  const seed = hash(text) % 997;
  const chars = Array.from(text).slice(0, 4);
  const round = shape === 'round';
  const cells = layout(chars, round);
  const angle = tilt ?? ((seed % 9) - 4) * 0.9;
  const solid = variant === 'solid';
  const ghost = variant === 'ghost';
  // Tall stacks get a little wider, the way seal carvers squash a column of characters.
  const stretch = chars.length === 2 ? 1.18 : chars.length === 3 ? 1.42 : 1;

  return (
    <svg
      className={['seal', className].filter(Boolean).join(' ')}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ transform: `rotate(${angle}deg)` }}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <filter id={`${id}-ink`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed={seed} result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale={ghost ? 1.5 : 3.2} xChannelSelector="R" yChannelSelector="G" result="edge" />
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed={seed + 7} result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -16 0 0 0 11.2" result="voids" />
          <feComposite in="edge" in2="voids" operator="in" />
        </filter>
        <filter id={`${id}-cut`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed={seed + 3} result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="1.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g opacity={ghost ? 0.3 : 1}>
        <g filter={`url(#${id}-ink)`}>
          {round ? (
            solid ? (
              <circle cx="50" cy="50" r="46" fill={color} />
            ) : (
              <circle cx="50" cy="50" r="44" fill="none" stroke={color} strokeWidth={ghost ? 1.6 : 4.5} />
            )
          ) : solid ? (
            <rect x="5" y="5" width="90" height="90" rx="5" fill={color} />
          ) : (
            <rect x="6" y="6" width="88" height="88" rx="4" fill="none" stroke={color} strokeWidth={ghost ? 1.6 : 5} />
          )}
        </g>
        <g filter={`url(#${id}-cut)`}>
          {cells.map((c, i) => (
            <text
              key={i}
              x={c.x}
              y={c.y}
              fontSize={c.size}
              textAnchor="middle"
              dominantBaseline="central"
              fill={ghost ? 'none' : solid ? 'var(--washi, #efe8da)' : color}
              stroke={ghost ? color : undefined}
              strokeWidth={ghost ? 0.9 : undefined}
              fontFamily="'Shippori Mincho B1', 'Hiragino Mincho ProN', 'Yu Mincho', serif"
              fontWeight={800}
              transform={stretch !== 1 ? `translate(${c.x} ${c.y}) scale(${stretch} 1) translate(${-c.x} ${-c.y})` : undefined}
            >
              {c.ch}
            </text>
          ))}
        </g>
      </g>
    </svg>
  );
}
