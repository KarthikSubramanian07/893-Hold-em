// Respect prefers-reduced-motion everywhere, and let anyone still the motion
// by hand: the "Motion" switch stops every looping animation (rain, neon,
// lanterns, the room's smoke and dust) whatever the system setting says.

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';
const STILL_KEY = '893:still';
const STILL_EVENT = '893:still';

function readStill(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(STILL_KEY) === '1';
  } catch {
    return false;
  }
}

let still = readStill();

function mark(): void {
  if (typeof document === 'undefined') return;
  if (still) document.documentElement.dataset.motion = 'still';
  else delete document.documentElement.dataset.motion;
}
mark();

function subscribe(cb: () => void): () => void {
  if (typeof matchMedia === 'undefined') return () => {};
  const mq = matchMedia(QUERY);
  mq.addEventListener('change', cb);
  addEventListener(STILL_EVENT, cb);
  return () => {
    mq.removeEventListener('change', cb);
    removeEventListener(STILL_EVENT, cb);
  };
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia(QUERY).matches;
}

/** The person stilled the motion with the switch. */
export function isStill(): boolean {
  return still;
}

export function setStill(on: boolean): void {
  still = on;
  try {
    localStorage.setItem(STILL_KEY, on ? '1' : '0');
  } catch {
    /* blocked storage: the switch still works for this visit */
  }
  mark();
  dispatchEvent(new Event(STILL_EVENT));
}

/** Reduced motion from the system, or the switch. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => prefersReducedMotion() || still, () => false);
}

/** Only the switch: looping effects stop outright, not just slow down. */
export function useStill(): boolean {
  return useSyncExternalStore(subscribe, isStill, () => false);
}
