import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

interface PersonaCarouselProps {
  /** Which pane is showing. Drives the track offset; both stay mounted. */
  pane: 'list' | 'editor';
  list: ReactNode;
  editor: ReactNode;
}

/**
 * Two-screen carousel: the list slides out to the inline-start edge as the
 * editor slides in from the inline-end, and back again on Done.
 *
 * A track rather than `AnimatePresence` because there are exactly two screens
 * and both should stay mounted — the editor's form state (and its in-flight
 * autosave) survives a trip back to the list for free, and there are no exit
 * animations to mistime. Panes fill the panel and scroll internally, so the
 * container height never changes and nothing has to be measured.
 *
 * `translateX` is a visual axis rather than a flow-relative one, so a physical
 * transform is correct here; the track is pre-shifted under RTL so the editor
 * still arrives from the side the list departs towards.
 */
export const PersonaCarousel = ({
  pane,
  list,
  editor,
}: PersonaCarouselProps) => {
  const reduceMotion = useReducedMotion();
  const showingEditor = pane === 'editor';

  return (
    <div className="relative h-full min-h-0 overflow-x-hidden">
      <motion.div
        className="grid h-full min-h-0 w-[200%] grid-cols-2 rtl:-translate-x-1/2"
        animate={{ x: showingEditor ? '-50%' : '0%' }}
        transition={
          reduceMotion
            ? // The two panes sit side by side in a track, so there is nothing
              // to crossfade between — the honest reduced-motion answer is to
              // swap instantly rather than fake a fade the layout can't do.
              { duration: 0 }
            : // A state swap, so no overshoot: bounce would read as
              // bounciness rather than as physicality here.
              { type: 'spring', duration: 0.35, bounce: 0 }
        }
      >
        {/*
          Both panes stay in the DOM, so the off-screen one must leave the tab
          order and the accessibility tree — otherwise Tab walks into
          invisible textareas and a screen reader announces two screens.
        */}
        <div className="h-full min-h-0" inert={showingEditor}>
          {list}
        </div>
        <div className="h-full min-h-0" inert={!showingEditor}>
          {editor}
        </div>
      </motion.div>
    </div>
  );
};
