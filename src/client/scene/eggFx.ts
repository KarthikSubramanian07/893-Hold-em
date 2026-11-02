// Envelopes for the room's easter-egg reactions, as pure functions of the
// seconds since the egg fired. Kept apart from the components so they can be
// tested and so every reaction ends, cleanly, back at rest.

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * 8-9-3 typed: the neon stutters like a bad ballast, then surges and settles.
 * `gate` multiplies the signs (0 = dark), `surge` adds to their burn.
 */
export function neonEgg(t: number): { gate: number; surge: number } {
  if (!(t >= 0) || t > 4) return { gate: 1, surge: 0 };
  if (t < 1.0) {
    const tick = Math.floor(t * 14);
    return { gate: hash(tick) < 0.45 ? 0.05 : 1, surge: 0 };
  }
  return { gate: 1, surge: 2.2 * Math.exp(-(t - 1.0) * 1.6) };
}

/** The lantern egg: it gutters, nearly goes out, and catches again. */
export function lanternGutter(t: number): number {
  if (!(t >= 0) || t > 3.6) return 1;
  const dip = Math.sin(Math.min(1, t / 3.6) * Math.PI);
  const sputter = hash(Math.floor(t * 18)) < 0.5 ? 0.55 : 1;
  return 1 - 0.82 * dip * sputter;
}

/** Kanpai: the cups rise, meet, and settle back. 0 at rest, 1 when they touch. */
export function kanpaiLift(t: number): number {
  if (!(t >= 0) || t > 2.6) return 0;
  if (t < 0.7) return smooth(t / 0.7);
  if (t < 1.5) return 1;
  return 1 - smooth((t - 1.5) / 1.1);
}

/** The clink itself: a short bright glint at the moment the cups meet. */
export function kanpaiGlint(t: number): number {
  if (!(t >= 0.65) || t > 1.3) return 0;
  return Math.exp(-(t - 0.7) * 7) * (t >= 0.7 ? 1 : (t - 0.65) / 0.05);
}

function smooth(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/**
 * A damped pendulum for the lantern: a click adds angular velocity, gravity
 * pulls it home. Returns the next [angle, velocity].
 */
export function swingStep(angle: number, velocity: number, dt: number, kick = 0): [number, number] {
  const step = Math.min(dt, 0.05);
  let v = velocity + kick;
  v += -9.8 / 2.4 * Math.sin(angle) * step;
  v *= Math.exp(-0.9 * step);
  const a = angle + v * step;
  return [Math.max(-0.5, Math.min(0.5, a)), v];
}
