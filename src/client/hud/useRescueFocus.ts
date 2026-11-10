import { useEffect, type RefObject } from 'react';

/**
 * When the control a keyboard user was on goes away (the seat form, a Start
 * button, a pick that locks), focus falls back to the page itself. Catch it on
 * the panel that replaced it, so Tab carries on from where play is. Only when
 * focus really was lost: never pull it away from something else.
 */
export function useRescueFocus(ref: RefObject<HTMLElement | null>, key: unknown = null): void {
  useEffect(() => {
    const t = setTimeout(() => {
      const a = document.activeElement;
      if ((!a || a === document.body) && ref.current && !document.querySelector('dialog[open]')) ref.current.focus({ preventScroll: true });
    }, 60);
    return () => clearTimeout(t);
  }, [ref, key]);
}
