// Where each seat is on screen, for the HUD. The scene projects every seat's
// anchor (the top of its name plate; your own seal for you) into CSS pixels a
// few times a second and publishes them here, so reactions and other overlays
// can float up from the right seat without knowing anything about 3D.
//
//   const anchor = useSeatAnchors((s) => s.seats[seatId]);   // React
//   const anchor = seatScreenAnchor(seatId);                  // anywhere
//
// x / y are relative to the scene canvas's top-left corner; pageX / pageY
// add the canvas's position in the viewport (for position: fixed overlays).
// `visible` is false when the seat is behind the camera or off screen.

import { create } from 'zustand';

export interface SeatScreenAnchor {
  x: number;
  y: number;
  pageX: number;
  pageY: number;
  visible: boolean;
}

export interface SeatAnchorsState {
  /** By seat id (e.g. "s3"). Missing in the lobby's empty chairs. */
  seats: Record<string, SeatScreenAnchor>;
  /** Canvas size in CSS pixels when the anchors were measured. */
  width: number;
  height: number;
}

export const useSeatAnchors = create<SeatAnchorsState>(() => ({ seats: {}, width: 0, height: 0 }));

/** The latest screen anchor for a seat, or null if the scene hasn't placed it. */
export function seatScreenAnchor(id: string): SeatScreenAnchor | null {
  return useSeatAnchors.getState().seats[id] ?? null;
}

/** Normalised device coordinates (-1..1, y up) to canvas pixels. */
export function ndcToPixels(ndc: { x: number; y: number; z: number }, width: number, height: number): { x: number; y: number; visible: boolean } {
  const x = ((ndc.x + 1) / 2) * width;
  const y = ((1 - ndc.y) / 2) * height;
  const visible = ndc.z > -1 && ndc.z < 1 && x >= 0 && x <= width && y >= 0 && y <= height;
  return { x, y, visible };
}

/** True when two anchor sets differ by more than `eps` pixels anywhere (or in membership). */
export function anchorsMoved(a: Record<string, SeatScreenAnchor>, b: Record<string, SeatScreenAnchor>, eps = 0.75): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return true;
  for (const k of ka) {
    const p = a[k]!;
    const q = b[k];
    if (!q || p.visible !== q.visible) return true;
    if (Math.abs(p.x - q.x) > eps || Math.abs(p.y - q.y) > eps || Math.abs(p.pageX - q.pageX) > eps || Math.abs(p.pageY - q.pageY) > eps) return true;
  }
  return false;
}
