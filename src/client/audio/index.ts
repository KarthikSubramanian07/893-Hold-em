// STUB. The synthesized sound design replaces this file. Keep these exports.
import type { GameView } from '../../engine/types';

export interface Sfx {
  /** Call from a user gesture; browsers keep audio locked until then. */
  unlock(): void;
  setMuted(muted: boolean): void;
  muted(): boolean;
  ambience(on: boolean): void;
  click(): void;
  hover(): void;
  deal(): void;
  flip(): void;
  chip(): void;
  stamp(): void;
  fold(): void;
  reveal(): void;
  rule(): void;
  win(): void;
  lose(): void;
  tick(): void;
}

const noop = () => {};
export const sfx: Sfx = {
  unlock: noop, setMuted: noop, muted: () => false, ambience: noop, click: noop, hover: noop,
  deal: noop, flip: noop, chip: noop, stamp: noop, fold: noop, reveal: noop, rule: noop,
  win: noop, lose: noop, tick: noop,
};

/** Diff consecutive views and play the right sounds. */
export function useGameSounds(_view: GameView | null): void {}
