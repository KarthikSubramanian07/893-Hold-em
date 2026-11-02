// The eight seals a guest can drink under.
import type { Avatar } from '../../engine/types';
import { Seal, type SealCut, type SealShape } from './Seal';

export interface AvatarInfo {
  kanji: string;
  romaji: string;
  name: string;
  shape: SealShape;
  cut: SealCut;
  seed: number;
}

export const AVATAR_INFO: Record<Avatar, AvatarInfo> = {
  kitsune: { kanji: '狐', romaji: 'Kitsune', name: 'Fox', shape: 'round', cut: 'haku', seed: 2 },
  tanuki: { kanji: '狸', romaji: 'Tanuki', name: 'Raccoon dog', shape: 'square', cut: 'shu', seed: 5 },
  koi: { kanji: '鯉', romaji: 'Koi', name: 'Carp', shape: 'square', cut: 'haku', seed: 8 },
  tsuru: { kanji: '鶴', romaji: 'Tsuru', name: 'Crane', shape: 'round', cut: 'shu', seed: 13 },
  tora: { kanji: '虎', romaji: 'Tora', name: 'Tiger', shape: 'round', cut: 'haku', seed: 21 },
  usagi: { kanji: '兎', romaji: 'Usagi', name: 'Hare', shape: 'square', cut: 'shu', seed: 34 },
  karasu: { kanji: '烏', romaji: 'Karasu', name: 'Crow', shape: 'square', cut: 'haku', seed: 55 },
  hebi: { kanji: '蛇', romaji: 'Hebi', name: 'Snake', shape: 'round', cut: 'shu', seed: 89 },
};

export function AvatarSeal({
  avatar,
  size = 40,
  color,
  paper,
  title,
  className,
}: {
  avatar: Avatar;
  size?: number;
  color?: string;
  paper?: string;
  title?: string;
  className?: string;
}) {
  const a = AVATAR_INFO[avatar];
  return (
    <Seal
      chars={a.kanji}
      shape={a.shape}
      cut={a.cut}
      size={size}
      seed={a.seed}
      color={color}
      paper={paper}
      tilt={((a.seed % 7) - 3) * 1.2}
      title={title}
      className={className}
    />
  );
}
