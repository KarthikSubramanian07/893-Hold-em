// The story everywhere at once: listens for the eggs, slides out the hidden
// card, drops stamp slips, plays the cold open at the front door, and gives the
// Master a slip of paper to talk on when you're not at a table (at the table,
// the HUD's own subtitles do the talking).
//
// Lazy-loaded by the app shell, so the paper world paints before any of this.

import { useEffect, useState } from 'react';
import { sfx } from '../audio';
import { ColdOpen } from './ColdOpen';
import { EGG_EVENT, type EggDetail, installEggs } from './eggs';
import { HiddenCard } from './HiddenCard';
import { eggRemark } from './stage';
import { StampToast } from './StampToast';
import { Narrator } from './Subtitles';
import type { Line } from './types';
import './styles';
import './layer.css';

export interface StoryLayerProps {
  /** `table` when a table route is showing; its HUD narrates for itself. */
  venue: 'street' | 'table';
  /** Play the cold open now. */
  coldOpen?: boolean;
  onColdOpenDone?: () => void;
}

/** How long the neon egg marks the page, for anything on paper that wants to stutter too. */
const NEON_MS = 1600;

export function StoryLayer({ venue, coldOpen = false, onColdOpenDone }: StoryLayerProps) {
  const [card, setCard] = useState(false);
  const [lines, setLines] = useState<readonly Line[]>([]);

  // The veil main.tsx drew for a first visit can lift: we're here now.
  useEffect(() => {
    delete document.documentElement.dataset.cold;
  }, []);

  // Listen first, then install, so an egg found at install (3 a.m.) is heard.
  useEffect(() => {
    let neon: ReturnType<typeof setTimeout> | undefined;
    const onEgg = (e: CustomEvent<EggDetail>) => {
      const { id } = e.detail;
      if (id === 'konami') {
        sfx.unlock();
        sfx.flip();
        setCard(true);
      }
      if (id === 'kanpai') {
        // Two cups touching: a pair of lacquer clacks, close together.
        sfx.unlock();
        sfx.chip();
        setTimeout(() => sfx.chip(), 110);
      }
      if (id === 'neon') {
        const root = document.documentElement;
        root.dataset.egg = 'neon';
        clearTimeout(neon);
        neon = setTimeout(() => delete root.dataset.egg, NEON_MS);
      }
      if (venue === 'street') {
        const line = eggRemark(e.detail, 'street');
        if (line) setLines([line]);
      }
    };
    addEventListener(EGG_EVENT, onEgg);
    const uninstall = installEggs();
    return () => {
      uninstall();
      removeEventListener(EGG_EVENT, onEgg);
      clearTimeout(neon);
    };
  }, [venue]);

  return (
    <>
      {venue === 'street' && <Narrator lines={lines} tone="paper" className="street-subs" />}
      <StampToast className={venue === 'table' ? 'stamp-toast--table' : 'stamp-toast--street'} />
      <HiddenCard open={card} onClose={() => setCard(false)} />
      {coldOpen && onColdOpenDone && <ColdOpen onDone={onColdOpenDone} />}
    </>
  );
}
