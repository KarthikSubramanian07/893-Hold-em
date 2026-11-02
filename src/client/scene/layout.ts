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
  const rx = lerp(1.4, 2.15, t);
  const rz = lerp(1.15, 1.1, t);
  const nearA = lerp(38, 44, t);
  const farA = lerp(86, 106, t);
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

/** Half-extents of a mask face at scale 1, and how far horns, ears, or a hat reach above it. */
export const MASK_FACE = { hw: 0.3, hh: 0.38, crown: 0.26 } as const;

/** How big the masks are drawn: a touch larger on a wide screen, where they sit further off. */
export function maskScale(aspect: number, count = 3): number {
  const crowd = count >= 4 ? 0.86 : count === 1 ? 1.12 : 1;
  return lerp(1.12, 1.22, aspectBlend(aspect)) * crowd;
}

/** Where each House mask floats, left to right across the far side. */
export function maskLayout(count: number, aspect: number): Vec3[] {
  const t = aspectBlend(aspect);
  const width = lerp(2.5, count >= 4 ? 5.1 : count === 3 ? 4.3 : 3.7, t);
  const n = Math.max(1, count);
  const out: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    // Four masks part a little wider in the middle, where the lantern hangs.
    const u = n === 1 ? 0 : n === 4 ? [-0.5, -0.2, 0.2, 0.5][i]! : i / (n - 1) - 0.5;
    const x = u * width * Math.min(1, (n - 1) / 2.4 + 0.35);
    // Masks sit on a gentle arc so the outer ones come forward a touch.
    const z = -1.95 + Math.abs(u) * 0.4;
    out.push({ x, y: 1.06, z });
  }
  return out;
}

/** How high the lantern hangs: higher on tall screens so it clears the masks. */
export function lanternHeight(aspect: number): number {
  return lerp(2.66, 2.0, aspectBlend(aspect));
}

/** The lantern hangs this far toward the House from the table centre. */
export const LANTERN_Z = -0.5;

/** Camera-space depth of a world point (distance along the view direction). */
function viewDepth(frame: CameraFrame, p: Vec3): number {
  const f = { x: frame.target.x - frame.position.x, y: frame.target.y - frame.position.y, z: frame.target.z - frame.position.z };
  const len = Math.hypot(f.x, f.y, f.z);
  return ((p.x - frame.position.x) * f.x + (p.y - frame.position.y) * f.y + (p.z - frame.position.z) * f.z) / len;
}

/**
 * Project a world point to normalised device coordinates (-1..1, y up) for the
 * resting camera at this aspect. Pure, so composition can be unit-tested.
 */
export function projectNdc(p: Vec3, aspect: number, frame: CameraFrame = cameraFrame(aspect)): { x: number; y: number; depth: number } {
  const pos = frame.position;
  const fw = { x: frame.target.x - pos.x, y: frame.target.y - pos.y, z: frame.target.z - pos.z };
  const fl = Math.hypot(fw.x, fw.y, fw.z);
  const f = { x: fw.x / fl, y: fw.y / fl, z: fw.z / fl };
  // right = f × up(0,1,0); up' = right × f
  const rl = Math.hypot(f.z, f.x);
  const r = { x: -f.z / rl, y: 0, z: f.x / rl };
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  const d = { x: p.x - pos.x, y: p.y - pos.y, z: p.z - pos.z };
  const cx = d.x * r.x + d.y * r.y + d.z * r.z;
  const cy = d.x * u.x + d.y * u.y + d.z * u.z;
  const cz = d.x * f.x + d.y * f.y + d.z * f.z;
  const ty = Math.tan((frame.fov * DEG) / 2);
  return { x: cx / (cz * ty * aspect), y: cy / (cz * ty), depth: cz };
}

export interface Stage {
  masks: Vec3[];
  /** Mask size multiplier. */
  scale: number;
  /** The lantern bulb's resting position. */
  lantern: Vec3;
  /** The House Rule card's resting position. */
  rule: Vec3;
}

/**
 * The far side of the table as one composition: masks, lantern, and the rule
 * card, arranged so no face is ever behind the lantern or the card.
 *
 *   1 mask    lantern left, mask a touch right, rule card on the right
 *   2 or 4    lantern and rule card share the centre gap
 *   3         lantern in the left gap, rule card in the right gap
 *
 * Gap positions are found in screen space (the lantern hangs nearer the camera
 * than the masks, so its world x is scaled by the depth ratio).
 */
export function stageLayout(count: number, aspect: number): Stage {
  const t = aspectBlend(aspect);
  const scale = maskScale(aspect, count);
  const frame = cameraFrame(aspect);
  const masks = maskLayout(count, aspect);
  const y = lanternHeight(aspect);
  let ruleX = 0;
  let gapX = 0;
  if (count === 1) {
    masks[0] = { ...masks[0]!, x: lerp(0.32, 0.42, t) };
    gapX = -lerp(0.62, 1.0, t);
    ruleX = lerp(0.95, 1.2, t);
  } else if (count === 3) {
    gapX = (masks[0]!.x + masks[1]!.x) / 2;
    ruleX = (masks[1]!.x + masks[2]!.x) / 2;
  } else if (count % 2 === 0) {
    gapX = 0;
    ruleX = 0;
  }
  // Put the lantern where the gap is on screen, not in the world.
  const gap = { x: gapX, y: masks[0]?.y ?? 1, z: masks[0]?.z ?? -1.9 };
  const lz = LANTERN_Z;
  const ratio = viewDepth(frame, { x: 0, y, z: lz }) / viewDepth(frame, gap);
  const lantern = { x: gapX * ratio, y, z: lz };
  const ruleZ = -1.42;
  const ruleRatio = viewDepth(frame, { x: 0, y: 0.44, z: ruleZ }) / viewDepth(frame, { x: 0, y: 0.44, z: gap.z });
  return { masks, scale, lantern, rule: { x: ruleX * (count === 1 ? 1 : ruleRatio), y: 0.44, z: ruleZ } };
}

/** Rotate a seat-local offset (x across, z outward) into world x/z. */
export function seatLocal(spot: SeatSpot, lx: number, lz: number): [number, number] {
  const c = Math.cos(spot.yaw);
  const s = Math.sin(spot.yaw);
  return [spot.x + lx * c + lz * s, spot.z - lx * s + lz * c];
}

/**
 * Where a seat "is", for anything that needs to point at it: the top of its
 * name plate, or for your own seat, your seal beside the cards you hold up.
 */
export function seatAnchor(spot: SeatSpot, you: boolean): Vec3 {
  if (you) {
    const [x, z] = seatLocal(spot, -0.95, 0.05);
    return { x, y: 0.05, z };
  }
  const [x, z] = seatLocal(spot, 0, 0.3);
  return { x, y: 0.14, z };
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
