// The night-world palette. Hex values come from docs/DESIGN.md; the extras are
// the colours that only exist after dark (the neon outside, the police lights).

export const PALETTE = {
  washi: '#efe8da',
  washi2: '#e6dcc8',
  sumi: '#1b1a17',
  sumi2: '#2a2824',
  shu: '#d2412a',
  kin: '#c9a45c',
  ai: '#2d4a6b',
  matcha: '#7d8b5a',
  neon: '#ff4f6d',
  // Night-only extras.
  urushi: '#0b0908',
  aiDeep: '#1d3350',
  teal: '#3fe0cf',
  sodium: '#ffb15c',
  police: '#ff2b3a',
  policeBlue: '#3b6bff',
  ember: '#ffcf8a',
} as const;

export type PaletteKey = keyof typeof PALETTE;
