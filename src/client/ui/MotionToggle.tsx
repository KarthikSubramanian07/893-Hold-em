// The Motion switch: stills every looping animation on the page (WCAG 2.2.2).
import { setStill, useStill } from '../story/motion';

export function MotionToggle({ className = 'icon-btn' }: { className?: string }) {
  const still = useStill();
  return (
    <button
      type="button"
      className={className}
      aria-pressed={still}
      aria-label="Stop motion"
      title={still ? 'Motion stopped. Press to let it move again' : 'Stop the rain, smoke and other looping motion'}
      onClick={() => setStill(!still)}
    >
      <IconStill still={still} />
    </button>
  );
}

function IconStill({ still, size = 18 }: { still: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      {still ? (
        <path d="M3.6 9.2h17M3.6 15.2h17" />
      ) : (
        <>
          <path d="M3.6 9.2c2.4-2.2 4.8-2.2 7.2 0s4.8 2.2 7.2 0 2.6-1.6 2.6-1.6" />
          <path d="M3.6 15.2c2.4-2.2 4.8-2.2 7.2 0s4.8 2.2 7.2 0 2.6-1.6 2.6-1.6" />
        </>
      )}
    </svg>
  );
}
