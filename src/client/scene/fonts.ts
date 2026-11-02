// Self-hosted fonts only. The CSS files register @font-face rules whose files
// Vite bundles from node_modules, so nothing is ever fetched from a CDN. The
// canvas painters wait for the glyphs they need before drawing.

import '@fontsource/shippori-mincho-b1/800.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
// troika (drei <Text>) parses WOFF1 itself; hand it the Latin subset directly.
import plateFont from '@fontsource/shippori-mincho-b1/files/shippori-mincho-b1-latin-800-normal.woff?url';

export const PLATE_FONT: string = plateFont;
export const SERIF = '"Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif';
export const MONO = '"JetBrains Mono Variable", ui-monospace, Menlo, monospace';

/** Every glyph the painted textures use, so the right subsets load up front. */
const GLYPHS =
  '0123456789AJQK10八九三二四五六七十侍姫王壱降待攻伏狐狸鯉鶴虎兎烏蛇霧鏡鬼静炎絆逆バー麻雀酒円熱スナック営業中夜掟';

let ready: Promise<void> | null = null;

export function fontsReady(): Promise<void> {
  if (ready) return ready;
  if (typeof document === 'undefined' || !document.fonts) return (ready = Promise.resolve());
  const loads = Promise.all([
    document.fonts.load(`800 64px ${SERIF}`, GLYPHS),
    document.fonts.load(`600 32px ${MONO}`, 'HOUSE RULE 0123456789'),
  ]).then(() => undefined);
  // Never hold the table hostage to a font: draw with fallbacks after 3.5s.
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3500));
  ready = Promise.race([loads, timeout]).catch(() => undefined);
  return ready;
}
