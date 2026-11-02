// The master chain: sfx and ambience buses into one gain, a gentle glue
// compressor, then a fast limiter so nothing ever clips the output.

export interface Master {
  /** One-shots go here. */
  sfx: GainNode;
  /** The room goes here, a little lower. */
  ambience: GainNode;
  /** Overall level; mute ramps this. */
  level: GainNode;
}

export const SFX_LEVEL = 0.8;
export const AMBIENCE_LEVEL = 0.3;

export function buildMaster(ctx: BaseAudioContext, destination: AudioNode = ctx.destination): Master {
  const level = ctx.createGain();
  level.gain.value = 1;

  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -20;
  glue.knee.value = 12;
  glue.ratio.value = 2.5;
  glue.attack.value = 0.01;
  glue.release.value = 0.25;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;

  // Leave headroom after the limiter for its fast-attack overshoot.
  const trim = ctx.createGain();
  trim.gain.value = 0.9;

  const sfx = ctx.createGain();
  sfx.gain.value = SFX_LEVEL;
  const ambience = ctx.createGain();
  ambience.gain.value = AMBIENCE_LEVEL;

  sfx.connect(level);
  ambience.connect(level);
  level.connect(glue);
  glue.connect(limiter);
  limiter.connect(trim);
  trim.connect(destination);
  return { sfx, ambience, level };
}
