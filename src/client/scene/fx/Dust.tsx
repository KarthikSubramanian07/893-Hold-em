// Dust motes drifting through the lantern's cone. Bright only where the light
// actually reaches them.

import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useLive } from '../live';
import { rng } from '../textures/canvas';

const COUNT = 420;

const vert = /* glsl */ `
  uniform float uTime;
  uniform vec3 uLamp;
  uniform float uPx;
  attribute vec3 seed;
  varying float vLit;
  void main() {
    vec3 p = position;
    float t = uTime * (0.04 + seed.x * 0.05);
    p.x += sin(t * 6.0 + seed.y * 30.0) * 0.18 + sin(t * 2.3 + seed.z * 9.0) * 0.1;
    p.z += cos(t * 5.0 + seed.z * 20.0) * 0.18;
    p.y = mod(p.y + t * (seed.x - 0.4) * 1.2, 2.6) + 0.05;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // Inside the cone under the lamp?
    vec3 d = p - uLamp;
    float along = -d.y;
    float radial = length(d.xz);
    float cone = smoothstep(along * 0.95 + 0.25, along * 0.4, radial) * step(0.0, along);
    float twinkle = 0.6 + 0.4 * sin(uTime * (1.0 + seed.y * 2.0) + seed.x * 40.0);
    vLit = cone * twinkle;
    gl_PointSize = uPx * (0.6 + seed.y * 1.4) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const frag = /* glsl */ `
  varying float vLit;
  uniform float uLevel;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(c));
    gl_FragColor = vec4(vec3(1.0, 0.82, 0.58) * 1.6, a * vLit * 0.55 * uLevel);
  }
`;

export function Dust({ dpr }: { dpr: number }) {
  const live = useLive();
  const { geo, mat } = useMemo(() => {
    const r = rng(1234);
    const pos = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 2.2;
      pos.set([Math.cos(a) * d * 1.3, r() * 2.6, -0.25 + Math.sin(a) * d], i * 3);
      seed.set([r(), r(), r()], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uTime: { value: 0 }, uLamp: { value: new THREE.Vector3() }, uPx: { value: 9 }, uLevel: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return { geo, mat };
  }, []);
  useFrame(({ clock }) => {
    mat.uniforms.uTime!.value = live.still ? 0 : live.reducedMotion ? clock.elapsedTime * 0.3 : clock.elapsedTime;
    mat.uniforms.uLamp!.value.copy(live.lanternPos);
    mat.uniforms.uPx!.value = 9 * dpr;
    mat.uniforms.uLevel!.value = live.lantern;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}
