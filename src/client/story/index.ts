// The story of Bar 893: who's talking, what they say, and what you keep.
//
//   narrate(prev, next, you)      lines for one view change (pure, shared by every seat)
//   idleLine(view, tick)          something for the lobby, or nothing
//   maskFor(table, index, rule)   the mask on each House hand, for the scene
//   detectStamps / useMatchbook   hanko stamps kept in localStorage '893:matchbook'
//   installEggs / useEggs         easter eggs, announced as '893:egg' window events
//
// Components (styles in story.css, imported here with the fonts):
//   <Narrator lines />  <ColdOpen onDone />  <Matchbook />  <StampToast />
//   <BarCat />  <HiddenCard open onClose />  <Seal text />

import '@fontsource/shippori-mincho-b1/500.css';
import '@fontsource/shippori-mincho-b1/600.css';
import '@fontsource/shippori-mincho-b1/800.css';
import '@fontsource/caveat/500.css';
import '@fontsource-variable/jetbrains-mono';
import './story.css';

export type { Line, MaskId, Mood, RegularName, Speaker, StoryEvent } from './types';
export { narrate, idleLine, chapterTitle, holdFor, type NarrateContext } from './narrator';
export { CHAPTERS, MASTER, CAT, speakerInfo } from './lines';
export { MASKS, TABLE_MASKS, maskFor, masksFor, type Mask, type MaskPalette } from './masks';
export { REGULARS, regularFor, type Regular } from './regulars';
export { STAMPS, STAMP, detectStamps, useMatchbook, loadMatchbook, MATCHBOOK_KEY, type StampId, type Stamp, type MatchbookData } from './stamps';
export {
  EGG_EVENT,
  BUTA_CARD,
  installEggs,
  triggerEgg,
  checkName,
  checkCode,
  lanternClick,
  petCat,
  catVisits,
  useEggs,
  type EggId,
  type EggDetail,
} from './eggs';
export { Narrator, type NarratorProps } from './Subtitles';
export { ColdOpen, shouldPlayColdOpen, type ColdOpenProps } from './ColdOpen';
export { Matchbook, type MatchbookProps } from './Matchbook';
export { StampToast, type StampToastProps } from './StampToast';
export { BarCat } from './BarCat';
export { HiddenCard } from './HiddenCard';
export { Seal, type SealProps } from './Seal';
export { Rain } from './Rain';
