// The call timer. The server stamps an absolute deadline in its own clock; the
// store keeps `skew` so that Date.now() + skew is server time.

export interface Countdown {
  /** Milliseconds left, never negative. */
  ms: number;
  /** Whole seconds left, rounded up so "1" shows until the very end. */
  seconds: number;
  /** 1 at the start of the call, 0 at the deadline. */
  fraction: number;
  /** Under five seconds. */
  urgent: boolean;
}

export const IDLE: Countdown = { ms: 0, seconds: 0, fraction: 0, urgent: false };

export function countdown(deadline: number | null, clientNow: number, skew: number, totalMs: number): Countdown | null {
  if (deadline == null || totalMs <= 0) return null;
  const ms = Math.max(0, deadline - (clientNow + skew));
  const fraction = Math.min(1, ms / totalMs);
  return { ms, seconds: Math.ceil(ms / 1000), fraction, urgent: ms > 0 && ms <= 5000 };
}

/** stroke-dashoffset for a ring of radius r that empties as the call runs out. */
export function ringOffset(fraction: number, r: number): number {
  const c = 2 * Math.PI * r;
  return c * (1 - Math.min(1, Math.max(0, fraction)));
}
