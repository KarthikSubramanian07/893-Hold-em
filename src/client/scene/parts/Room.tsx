// The bar around the table: a rain-streaked window behind the House with the
// street's neon bleeding through it, dark wood walls, and the police lights
// that come when the marker slides toward the sirens.

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { since } from '../EggListener';
import { neonEgg } from '../eggFx';
import { useLive } from '../live';
import { PALETTE } from '../palette';
import { neonTexture } from '../textures/surfaces';

export const WINDOW = { w: 9.6, h: 5.6, y: 1.7, z: -4.6 } as const;

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Rain on glass, written from scratch: three layers of drops (static beads,
// runners with trails, and fine mist), each giving a refraction offset and a
// mask. Outside is a blurred street of bokeh lights plus the neon texture,
// sampled sharp inside drops and soft everywhere else.
const frag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uNeon;
  uniform float uTime;
  uniform float uAspect;
  uniform float uNeonLevel;
  uniform float uHeat;
  uniform float uPolice;
  uniform float uSurge;
  uniform float uGate;
  uniform float uRain;

  float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
  float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }

  // Static beads that bloom and evaporate. Returns offset.xy and mask.
  vec3 beads(vec2 uv, float scale, float t) {
    vec2 g = uv * scale;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    vec2 r = h22(id);
    vec2 c = (r - 0.5) * 0.7;
    float life = fract(t * (0.12 + r.x * 0.2) + r.y);
    float rad = (0.08 + 0.22 * h21(id + 7.0)) * smoothstep(0.0, 0.1, life) * smoothstep(1.0, 0.75, life);
    vec2 d = f - c;
    float m = smoothstep(rad, rad * 0.6, length(d)) * step(0.35, h21(id + 3.1));
    return vec3(d / max(rad, 1e-3) * m, m);
  }

  // Runners: one drop per column slides down in fits and starts, wiping a
  // trail that leaves a string of tiny beads behind it.
  vec4 runners(vec2 uv, float cols, float t) {
    vec2 g = vec2(uv.x * cols, uv.y);
    float col = floor(g.x);
    float rnd = h11(col * 17.31);
    if (rnd < 0.2) return vec4(0.0);
    float fx = fract(g.x) - 0.5;
    float speed = 0.16 + rnd * 0.22;
    float ph = t * speed + h11(col * 3.7);
    // stick-slip motion
    float y = 1.15 - fract(ph) * 1.4 - 0.04 * sin(ph * 40.0) * (1.0 - fract(ph));
    float wob = 0.18 * sin(uv.y * 23.0 + col) * sin(uv.y * 7.0 + rnd * 6.0);
    float x = wob;
    float dy = (uv.y - y) * cols * 0.55;
    vec2 d = vec2(fx - x, dy);
    float rad = 0.22 + rnd * 0.12;
    float drop = smoothstep(rad, rad * 0.55, length(d * vec2(1.0, 0.8)));
    float above = smoothstep(0.0, 0.02, uv.y - y);
    float trailLen = smoothstep(0.55, 0.0, uv.y - y);
    float trail = smoothstep(0.12, 0.03, abs(fx - x)) * above * trailLen;
    float bead = smoothstep(0.1, 0.0, length(vec2(fx - x, (fract(uv.y * 18.0 + col) - 0.5) * 0.4))) * trail;
    float m = max(drop, bead);
    return vec4(d / rad * m, m, trail);
  }

  // The street outside: soft round lights of every colour in the rain.
  vec3 bokeh(vec2 uv, float t) {
    vec3 col = vec3(0.0);
    for (int layer = 0; layer < 2; layer++) {
      float fl = float(layer);
      float sc = 5.0 + fl * 4.0;
      vec2 g = uv * vec2(sc * uAspect, sc) + vec2(t * 0.03 * (fl + 1.0), 0.0)
        + vec2(sin(uv.y * 31.0 + t * 1.7), cos(uv.x * 27.0 + t * 1.3)) * 0.04;
      vec2 id = floor(g);
      vec2 f = fract(g) - 0.5;
      vec2 r = h22(id + fl * 13.0);
      vec2 c = (r - 0.5) * 0.6;
      float rad = 0.18 + 0.2 * r.y;
      float on = step(0.45, h21(id * 1.7 + fl));
      float lum = smoothstep(rad, rad * 0.35, length(f - c)) * on;
      float hue = h21(id + 9.0 + fl);
      vec3 tint = hue < 0.35 ? vec3(1.0, 0.62, 0.3) : hue < 0.6 ? vec3(0.9, 0.95, 1.0) : hue < 0.8 ? vec3(0.25, 0.85, 0.8) : vec3(1.0, 0.3, 0.45);
      float twinkle = 0.7 + 0.3 * sin(t * (1.2 + r.x * 2.0) + r.y * 6.28);
      col += tint * lum * twinkle * (0.075 / (fl + 1.0));
    }
    // Cars hiss past in the wet street, low in the frame: headlights one way,
    // tail lights the other, every few seconds.
    float sweep = fract(t * 0.13);
    float car = smoothstep(0.22, 0.0, abs(uv.x - (sweep * 1.6 - 0.3))) * smoothstep(0.35, 0.05, uv.y);
    col += vec3(1.0, 0.85, 0.65) * car * 0.32;
    float back = fract(t * 0.09 + 0.5);
    float tail = smoothstep(0.12, 0.0, abs(uv.x - (1.3 - back * 1.6))) * smoothstep(0.28, 0.04, uv.y);
    col += vec3(1.0, 0.12, 0.08) * tail * 0.22;
    return col;
  }

  vec3 street(vec2 uv, float blur) {
    // Building silhouettes and a wet glow at street level.
    float sky = smoothstep(0.0, 1.0, uv.y);
    vec3 col = mix(vec3(0.03, 0.02, 0.03), vec3(0.006, 0.008, 0.018), sky);
    col += bokeh(uv, uTime) * 0.7;
    vec4 n = texture2D(uNeon, uv, blur);
    // Each channel is its own sign group with its own flicker.
    float t = uTime;
    float hot = uHeat;
    float f1 = 0.82 + 0.18 * step(0.12 - hot * 0.06, fract(sin(floor(t * 9.0) * 12.9898) * 43758.5));
    float f2 = 1.0 - 0.9 * step(0.985 - hot * 0.08, fract(sin(floor(t * 13.0) * 78.233) * 12345.6));
    float f3 = 0.86 + 0.14 * sin(t * 50.0) * step(0.6, fract(t * 0.21));
    float buzz = 0.93 + 0.07 * sin(t * 7.0) * sin(t * 2.3 + 1.0);
    vec3 neon = (n.r * vec3(1.0, 0.31, 0.43) * f1 + n.g * vec3(0.25, 0.9, 0.82) * f2 + n.b * vec3(1.0, 0.32, 0.14) * f3) * buzz;
    col += neon * (0.9 + uNeonLevel * 2.4 + uSurge * 2.5) * uGate;
    return col;
  }

  void main() {
    vec2 uv = vUv;
    vec2 auv = vec2(uv.x * uAspect, uv.y);
    float t = uTime;

    vec3 b1 = beads(auv, 22.0, t);
    vec3 b2 = beads(auv + 3.1, 38.0, t * 1.3);
    vec4 rn = runners(uv, 26.0, t) * uRain;
    vec2 offs = (b1.xy * 0.018 + b2.xy * 0.01) * uRain + rn.xy * 0.02;
    float mask = clamp(max(max(b1.z, b2.z) * uRain, rn.z), 0.0, 1.0);

    // Fog on the glass, wiped clear along runner trails.
    float fog = 1.0 - rn.w * 0.8;
    vec3 soft = street(uv, 2.4 * fog + 0.5);
    // Inside a drop the world is sharp, a little magnified and flipped.
    vec3 col = soft;
    if (mask > 0.02) col = mix(soft, street(uv - offs * 3.0, 0.4) * 1.15, mask);

    // Rain falling outside, lit by the neon.
    float streak = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float cols = 110.0 + fi * 70.0;
      // Wind leans the rain a little, and the lean breathes.
      float lean = (0.18 + 0.05 * sin(t * 0.4)) * (1.0 - fi * 0.2);
      vec2 ruv = vec2(uv.x + uv.y * lean, uv.y);
      float cx = floor(ruv.x * cols);
      float rnd = h11(cx * 1.37 + fi * 31.0);
      float y = fract(ruv.y * (0.8 + fi * 0.5) + t * (1.4 + rnd * 1.2 + fi * 0.4) + rnd * 10.0);
      float lit = step(0.45, rnd);
      streak += smoothstep(0.82, 1.0, y) * smoothstep(1.0, 0.97, y) * lit
        * smoothstep(0.5, 0.0, abs(fract(ruv.x * cols) - 0.5)) * (1.0 - fi * 0.25);
    }
    col += vec3(0.55, 0.65, 0.8) * streak * 0.36 * (0.6 + uNeonLevel);

    // Highlights where the room's lantern catches the top of each drop.
    col += vec3(1.0, 0.75, 0.45) * pow(max(0.0, -offs.y * 40.0), 2.0) * mask * 0.25;

    // Police lights: red and blue, strobing in pairs.
    float strobe = step(0.5, fract(t * 2.2));
    float blink = step(0.55, fract(t * 8.8)) * 0.6 + 0.4;
    vec3 pol = mix(vec3(1.0, 0.08, 0.1), vec3(0.15, 0.3, 1.0), strobe) * blink;
    float side = mix(smoothstep(0.9, 0.0, uv.x), smoothstep(0.1, 1.0, uv.x), strobe);
    col += pol * uPolice * (0.2 + 0.8 * side) * (0.6 + 0.4 * (1.0 - uv.y)) * 0.9;

    // The glass darkens toward the frame.
    float vig = smoothstep(0.0, 0.18, uv.x) * smoothstep(1.0, 0.82, uv.x) * smoothstep(0.0, 0.12, uv.y) * smoothstep(1.0, 0.85, uv.y);
    col *= (0.55 + 0.45 * vig) * 0.8;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function Room() {
  const live = useLive();
  const police = useRef<THREE.PointLight>(null);
  const neonLight = useRef<THREE.PointLight>(null);

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: {
          uNeon: { value: neonTexture() },
          uTime: { value: 0 },
          uAspect: { value: WINDOW.w / WINDOW.h },
          uNeonLevel: { value: 0.3 },
          uHeat: { value: 0 },
          uPolice: { value: 0 },
          uSurge: { value: 0 },
          uGate: { value: 1 },
          uRain: { value: 1 },
        },
        toneMapped: false,
      }),
    [],
  );

  const frame = useMemo(() => new THREE.MeshStandardMaterial({ color: '#17110d', roughness: 0.55, metalness: 0.05 }), []);
  const wall = useMemo(() => new THREE.MeshStandardMaterial({ color: '#120d0a', roughness: 0.85 }), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const u = mat.uniforms;
    u.uTime!.value = live.reducedMotion ? t * 0.35 : t;
    u.uNeonLevel!.value = live.neon;
    u.uHeat!.value = live.danger;
    u.uPolice!.value = live.police;
    // 8-9-3: the signs stutter like a dying ballast, then surge.
    const egg = neonEgg(since(live, 'neon', t));
    u.uSurge!.value = live.surge + egg.surge;
    u.uGate!.value = live.reducedMotion ? Math.max(0.6, egg.gate) : egg.gate;
    const strobe = Math.floor(t * 2.2 * 2) % 2 === 0;
    const blink = Math.floor(t * 8.8) % 2 === 0 ? 1 : 0.4;
    const pl = police.current;
    if (pl) {
      pl.intensity = live.police * 24 * blink;
      pl.color.set(strobe ? PALETTE.police : PALETTE.policeBlue);
      pl.position.x = strobe ? -3.5 : 3.5;
    }
    if (neonLight.current) {
      const flick = 0.9 + 0.1 * Math.sin(t * 31) * Math.sin(t * 3.3);
      neonLight.current.intensity = (2.5 + live.neon * 9 + (live.surge + egg.surge) * 18) * flick * egg.gate;
    }
  });

  const mullions = useMemo(() => {
    const bars: { p: [number, number, number]; s: [number, number, number] }[] = [];
    const { w, h, y, z } = WINDOW;
    const d = 0.12;
    bars.push({ p: [0, y + h / 2, z + 0.05], s: [w + 0.3, 0.16, d] });
    bars.push({ p: [0, y - h / 2, z + 0.05], s: [w + 0.3, 0.22, d * 1.6] });
    bars.push({ p: [-w / 2, y, z + 0.05], s: [0.16, h, d] });
    bars.push({ p: [w / 2, y, z + 0.05], s: [0.16, h, d] });
    for (const k of [-2, -1, 1, 2]) bars.push({ p: [(k * w) / 6, y, z + 0.04], s: [0.05, h, 0.06] });
    bars.push({ p: [0, y + h * 0.18, z + 0.04], s: [w, 0.04, 0.05] });
    return bars;
  }, []);

  return (
    <group>
      <mesh material={mat} position={[0, WINDOW.y, WINDOW.z]}>
        <planeGeometry args={[WINDOW.w, WINDOW.h]} />
      </mesh>
      {mullions.map((b, i) => (
        <mesh key={i} material={frame} position={b.p} castShadow={false}>
          <boxGeometry args={b.s} />
        </mesh>
      ))}
      {/* walls around the window */}
      <mesh material={wall} position={[0, WINDOW.y + WINDOW.h / 2 + 2, WINDOW.z + 0.02]}>
        <planeGeometry args={[30, 4]} />
      </mesh>
      <mesh material={wall} position={[0, (WINDOW.y - WINDOW.h / 2) / 2 - 1.5, WINDOW.z + 0.02]}>
        <planeGeometry args={[30, WINDOW.y - WINDOW.h / 2 + 3]} />
      </mesh>
      <mesh material={wall} position={[-(WINDOW.w / 2 + 7.5), WINDOW.y, WINDOW.z + 0.02]}>
        <planeGeometry args={[15, 12]} />
      </mesh>
      <mesh material={wall} position={[WINDOW.w / 2 + 7.5, WINDOW.y, WINDOW.z + 0.02]}>
        <planeGeometry args={[15, 12]} />
      </mesh>
      <mesh material={wall} position={[-6.5, 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[14, 10]} />
      </mesh>
      <mesh material={wall} position={[6.5, 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[14, 10]} />
      </mesh>
      <mesh position={[0, -1.1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#0c0908" roughness={0.6} />
      </mesh>
      {/* Neon spill from outside, lighting the masks from behind. */}
      <pointLight ref={neonLight} color={PALETTE.neon} position={[1.8, 2.6, -3.9]} decay={2} distance={9} />
      <pointLight ref={police} color={PALETTE.police} position={[-3.5, 1.6, -3.8]} decay={2} distance={12} />
    </group>
  );
}
