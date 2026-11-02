// Hanko seals, carved by hand in SVG. A rough-edge filter makes every seal
// look pressed rather than drawn: the edge wobbles and the ink skips a little.
import { useId, type CSSProperties } from 'react';

export type SealShape = 'round' | 'square' | 'tall';
/** hakubun: paper-coloured characters cut out of a red block. shubun: red characters in a red frame. */
export type SealCut = 'haku' | 'shu';

export interface SealProps {
  chars: string;
  shape?: SealShape;
  cut?: SealCut;
  size?: number;
  color?: string;
  /** Background showing through the cut (hakubun). */
  paper?: string;
  /** Degrees. Real seals are never quite straight. */
  tilt?: number;
  seed?: number;
  title?: string;
  className?: string;
  style?: CSSProperties;
}

export function Seal({
  chars,
  shape = 'square',
  cut = 'haku',
  size = 64,
  color = 'var(--shu)',
  paper = 'var(--washi)',
  tilt = 0,
  seed = 3,
  title,
  className,
  style,
}: SealProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const glyphs = Array.from(chars);
  const n = glyphs.length;
  const w = 100;
  const h = shape === 'tall' ? Math.max(100, 18 + n * 64) : 100;
  // Character size and placement: one big glyph, or a vertical column.
  const fs = n === 1 ? (shape === 'round' ? 56 : 62) : shape === 'tall' ? 62 : n === 2 ? 40 : 30;
  const step = shape === 'tall' ? 64 : fs * 1.02;
  const top = h / 2 - ((n - 1) * step) / 2;
  const ink = cut === 'haku' ? paper : color;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={(size * h) / w}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ transform: tilt ? `rotate(${tilt}deg)` : undefined, overflow: 'visible', ...style }}
    >
      <defs>
        <filter id={`r${id}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed={seed} result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="3.2" xChannelSelector="R" yChannelSelector="G" result="rough" />
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="1" seed={seed + 11} result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -4 0 0 0 3.15" result="mask" />
          <feComposite in="rough" in2="mask" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#r${id})`}>
        {shape === 'round' ? (
          cut === 'haku' ? (
            <circle cx={50} cy={50} r={47} fill={color} />
          ) : (
            <>
              <circle cx={50} cy={50} r={45} fill="none" stroke={color} strokeWidth={5} />
              <circle cx={50} cy={50} r={38} fill="none" stroke={color} strokeWidth={1.2} />
            </>
          )
        ) : cut === 'haku' ? (
          <rect x={2} y={2} width={w - 4} height={h - 4} rx={6} fill={color} />
        ) : (
          <rect x={4} y={4} width={w - 8} height={h - 8} rx={4} fill="none" stroke={color} strokeWidth={6} />
        )}
        {glyphs.map((g, i) => (
          <text
            key={i}
            x={50}
            y={n === 1 ? 50 : top + i * step}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="'Shippori Mincho B1', serif"
            fontWeight={800}
            fontSize={fs}
            fill={ink}
            style={{ fontFeatureSettings: "'palt' 0" }}
          >
            {g}
          </text>
        ))}
      </g>
    </svg>
  );
}
