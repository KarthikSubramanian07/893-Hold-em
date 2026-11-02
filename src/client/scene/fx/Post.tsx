// Post-processing for quality="high": a riso misregistration and heat-haze
// pass, bloom on emissives only, ACES tone mapping, a vignette, and grain.

import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { useFrame } from '@react-three/fiber';
import { BlendFunction, Effect, EffectAttribute, ToneMappingMode } from 'postprocessing';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useLive } from '../live';

const fragment = /* glsl */ `
  uniform float uTime;
  uniform float uHaze;
  uniform float uShift;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // Heat haze shimmering over the House's side of the room.
    float m = smoothstep(0.3, 0.8, uv.y) * uHaze;
    vec2 d = vec2(
      sin(uv.y * 70.0 + uTime * 4.3) * 0.0022 + sin(uv.y * 23.0 - uTime * 2.9) * 0.0014,
      cos(uv.x * 45.0 + uTime * 3.4) * 0.0014
    ) * m;
    vec2 p = uv + d;
    vec3 c = m > 0.0005 ? texture2D(inputBuffer, p).rgb : inputColor.rgb;
    // The second drum of the riso print lands a hair off: shift the reds.
    vec2 off = vec2(uShift, -uShift * 0.7) * texelSize * 1.5;
    float r = texture2D(inputBuffer, p + off).r;
    c.r = mix(c.r, r, 0.55);
    // Lift the blacks a little toward warm sumi, like ink on paper.
    c = max(c, vec3(0.010, 0.008, 0.007));
    outputColor = vec4(c, inputColor.a);
  }
`;

class NightPrintEffect extends Effect {
  constructor() {
    super('NightPrintEffect', fragment, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, THREE.Uniform>([
        ['uTime', new THREE.Uniform(0)],
        ['uHaze', new THREE.Uniform(0)],
        ['uShift', new THREE.Uniform(1.2)],
      ]),
    });
  }
}

export function Post() {
  const live = useLive();
  const print = useMemo(() => new NightPrintEffect(), []);
  useFrame(({ clock }) => {
    print.uniforms.get('uTime')!.value = clock.elapsedTime;
    print.uniforms.get('uHaze')!.value = live.haze;
  });
  return (
    <EffectComposer multisampling={4}>
      <primitive object={print} dispose={null} />
      <Bloom mipmapBlur luminanceThreshold={1.0} luminanceSmoothing={0.25} intensity={1.15} radius={0.72} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette eskil={false} offset={0.22} darkness={0.78} />
      <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.32} />
    </EffectComposer>
  );
}
