// Interface marks. Thin, a little uneven, like ink on rice paper.
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function IconCopy({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...base} aria-hidden="true">
      <path d="M8.5 8.5h10.2v11.8H8.5z" />
      <path d="M15.5 8.4V4.6H5.2v11.8h3.2" />
    </svg>
  );
}

export function IconCheck({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...base} aria-hidden="true">
      <path d="M4.6 12.8l4.6 4.4 10.2-10.6" />
    </svg>
  );
}

export function IconSound({ size = 18, muted }: { size?: number; muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...base} aria-hidden="true">
      <path d="M4 9.6h3.6L12.4 5.4v13.2l-4.8-4.2H4z" />
      {muted ? (
        <path d="M16 9.4l5 5.2M21 9.4l-5 5.2" />
      ) : (
        <>
          <path d="M15.6 9.2c1.4 1.6 1.4 4 0 5.6" />
          <path d="M18.2 6.6c2.8 3 2.8 7.8 0 10.8" />
        </>
      )}
    </svg>
  );
}

export function IconClose({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...base} aria-hidden="true">
      <path d="M6 6.2l11.8 11.6M17.8 6.2 6 17.8" />
    </svg>
  );
}

export function IconArrow({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...base} aria-hidden="true">
      <path d="M4 12.2h15.4M13.6 6.2l6 6-6 6" />
    </svg>
  );
}

/** The bartender's arrow: one loose brushstroke with a hook. */
export function HandArrow({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 70" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M114 8C96 6 70 12 52 26 38 37 28 50 14 60" />
      <path d="M12 44c0 6 .8 11 2.4 16.4 5-1.4 10-2.2 15.6-2.4" />
    </svg>
  );
}

export function IconPause({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...base} aria-hidden="true">
      <path d="M8.6 5.8v12.4M15.4 5.8v12.4" />
    </svg>
  );
}
