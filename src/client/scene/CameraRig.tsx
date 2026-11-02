// Frames the table for the current aspect ratio, then adds a slow breath and a
// little parallax toward the pointer. Reduced motion keeps it still.

import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { cameraFrame } from './layout';
import { damp, useLive } from './live';

export function CameraRig() {
  const live = useLive();
  const size = useThree((s) => s.size);
  const look = useRef(new THREE.Vector3());
  const par = useRef({ x: 0, y: 0, ready: false });

  useFrame(({ camera, pointer, clock }, dt) => {
    const cam = camera as THREE.PerspectiveCamera;
    const f = cameraFrame(size.width / Math.max(1, size.height));
    const p = par.current;
    const still = live.reducedMotion;
    p.x = damp(p.x, still ? 0 : pointer.x, 2, dt);
    p.y = damp(p.y, still ? 0 : pointer.y, 2, dt);
    const t = clock.elapsedTime;
    const bx = still ? 0 : Math.sin(t * 0.21) * 0.035 + Math.sin(t * 0.13) * 0.02;
    const by = still ? 0 : Math.sin(t * 0.29 + 1) * 0.022;
    // A hot room feels closer: lean in a touch as heat climbs.
    const lean = live.heat * 0.18;
    cam.position.set(f.position.x + p.x * 0.18 + bx, f.position.y + p.y * 0.08 + by - lean * 0.3, f.position.z - lean);
    look.current.set(f.target.x + p.x * 0.05, f.target.y, f.target.z);
    if (!p.ready) p.ready = true;
    cam.lookAt(look.current);
    if (Math.abs(cam.fov - f.fov) > 0.01) {
      cam.fov = f.fov;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}
