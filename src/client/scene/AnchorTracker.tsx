// Publishes each seat's screen position to the anchors store (see anchors.ts),
// about ten times a second and only when something actually moved.

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { anchorsMoved, ndcToPixels, useSeatAnchors, type SeatScreenAnchor } from './anchors';
import type { Vec3 } from './layout';

/** Float reactions from just above the plate, not from inside it. */
const LIFT = 0.16;

export function AnchorTracker({ anchors }: { anchors: ReadonlyMap<string, Vec3> }) {
  const gl = useThree((s) => s.gl);
  const last = useRef(0);
  const v = useRef(new THREE.Vector3());
  useEffect(() => () => useSeatAnchors.setState({ seats: {}, width: 0, height: 0 }), []);
  useFrame(({ camera, clock, size }) => {
    const now = clock.elapsedTime;
    if (now - last.current < 0.1) return;
    last.current = now;
    const rect = gl.domElement.getBoundingClientRect();
    const seats: Record<string, SeatScreenAnchor> = {};
    for (const [id, a] of anchors) {
      v.current.set(a.x, a.y + LIFT, a.z).project(camera);
      const p = ndcToPixels(v.current, size.width, size.height);
      seats[id] = { x: p.x, y: p.y, pageX: rect.left + p.x, pageY: rect.top + p.y, visible: p.visible };
    }
    const prev = useSeatAnchors.getState();
    if (prev.width !== size.width || prev.height !== size.height || anchorsMoved(prev.seats, seats)) {
      useSeatAnchors.setState({ seats, width: size.width, height: size.height });
    }
  });
  return null;
}
