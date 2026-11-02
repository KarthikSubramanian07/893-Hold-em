// Pure layout math for the table. World units are roughly metres. The table is
// an oval centred on the origin with its top at y = 0. The viewer sits at +z
// (the near edge) and the House sits at -z, in front of the rainy window.

export const TABLE = {
  /** Outer lacquer radii. */
  rx: 3.0,
  rz: 1.85,
  /** Indigo felt inlay radii. */
  feltRx: 2.5,
  feltRz: 1.4,
} as const;

export const CARD = { w: 0.5, h: 0.7 } as const;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SeatSpot {
  /** Anchor on the table surface where this seat's things sit. */
  x: number;
  z: number;
  /** Yaw (radians) that turns a seat's local +z axis to point away from the table centre. */
  yaw: number;
  /** Angle around the oval in degrees: 0 = front centre (the viewer), negative = viewer's left. */
  angle: number;
}

const DEG = Math.PI / 180;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 0 for a tall portrait phone, 1 for a wide desktop window. */
export function aspectBlend(aspect: number): number {
  return clamp((aspect - 0.5) / (1.45 - 0.5), 0, 1);
}

/** Evenly spaced angles in [from, to]; a single item sits at `single`. */
function spread(count: number, from: number, to: number, single: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [single];
  return Array.from({ length: count }, (_, i) => lerp(from, to, i / (count - 1)));
}

/**
 * Where each crew seat sits. Index 0 is always the viewer at the front centre.
 * The others continue around the table in seat order: first up the viewer's
 * left side (near to far), then down the right side (far to near), so the
 * order is the same circle every client sees, just rotated.
 */
export function seatLayout(count: number, aspect: number): SeatSpot[] {
  const t = aspectBlend(aspect);
  // On a narrow screen the sides of the oval fall off-frame, so pull the
  // anchors in toward the middle and keep them nearer the camera.
  const rx = lerp(1.5, 2.15, t);
  const rz = lerp(1.15, 1.1, t);
  const nearA = lerp(38, 44, t);
  const farA = lerp(84, 98, t);
  const singleA = lerp(58, 66, t);

  const spots: SeatSpot[] = [];
  const place = (angle: number) => {
    const a = angle * DEG;
    const x = rx * Math.sin(a);
    // The viewer's own things sit closer in, beside the cards held up to camera.
    const z = angle === 0 ? lerp(0.95, 0.72, t) : rz * Math.cos(a);
    spots.push({ x, z, yaw: Math.atan2(x, z), angle });
  };

  place(0);
  const others = Math.max(0, count - 1);
  const left = Math.ceil(others / 2);
  const right = others - left;
  for (const a of spread(left, nearA, farA, singleA)) place(-a);
  for (const a of spread(right, farA, nearA, singleA)) place(a);
  return spots;
}

/** Where each House mask floats, left to right across the far side. */
export function maskLayout(count: number, aspect: number): Vec3[] {
  const t = aspectBlend(aspect);
  const width = lerp(2.0, 3.6, t);
  const n = Math.max(1, count);
  const out: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const u = n === 1 ? 0 : i / (n - 1) - 0.5;
    const x = u * width * Math.min(1, (n - 1) / 2.4 + 0.35);
    // Masks sit on a gentle arc so the outer ones come forward a touch.
    const z = -1.9 + Math.abs(u) * 0.4;
    out.push({ x, y: 1.02, z });
  }
  return out;
}

/** House hole cards: in front of each mask on the far felt. */
export function houseCardSpots(mask: Vec3): [Vec3, Vec3] {
  const z = mask.z + 0.78;
  return [
    { x: mask.x - 0.2, y: 0, z },
    { x: mask.x + 0.2, y: 0, z },
  ];
}

export const BOARD_Z = -0.18;
export const BOARD_GAP = 0.6;

export function boardSpot(i: number): Vec3 {
  return { x: (i - 2) * BOARD_GAP, y: 0, z: BOARD_Z };
}

export interface CameraFrame {
  position: Vec3;
  target: Vec3;
  /** Vertical field of view in degrees. */
  fov: number;
}

/**
 * Frame the table for a given aspect ratio. Wide screens get a low, intimate
 * angle across the lacquer; tall phones pull up and back and widen the lens so
 * the board, the masks, and your own cards all stay in shot.
 */
export function cameraFrame(aspect: number): CameraFrame {
  const t = aspectBlend(aspect);
  const position = { x: 0, y: lerp(4.3, 3.2, t), z: lerp(5.0, 4.0, t) };
  const target = { x: 0, y: lerp(0.0, 0.1, t), z: lerp(0.25, -0.42, t) };
  const dist = Math.hypot(position.y - target.y, position.z - target.z);
  // Horizontal half-width that must stay visible at the target distance.
  const halfWidth = lerp(1.9, 3.1, t);
  const hHalf = Math.atan(halfWidth / dist);
  const vFromWidth = (2 * Math.atan(Math.tan(hHalf) / Math.max(aspect, 0.1))) / DEG;
  const fov = clamp(Math.max(vFromWidth, lerp(52, 50, t)), 40, 74);
  return { position, target, fov };
}

/**
 * Where your own two cards hang in front of the camera, in pixels. They sit
 * above the bottom HUD band and scale with the shorter screen side.
 */
export function heroCardPixels(width: number, height: number, bottomCalm = 150) {
  const h = clamp(Math.min(height * 0.22, width * 0.4), 110, 230);
  const centreY = bottomCalm + h * 0.5 + 10;
  return { cardHeight: h, centreY, gap: h * 0.42 };
}
