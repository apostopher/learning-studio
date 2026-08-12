import type { ReactNode, RefObject } from 'react';

type LessonDebriefSectionProps = {
  /** Scroll target for the post-video overlay — see LessonPlayerContainer. */
  sectionRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
};

/**
 * The debrief, standing on its own below the video.
 *
 * A lesson with no material row has no tab strip to host the Debrief tab, so
 * the debrief needs its own home; that is the entire reason this exists. It
 * carries a heading because, unlike a tab, nothing else here names what it is.
 *
 * Presentational and hookless (react-compiler + vitest null the dispatcher for
 * hook-calling components in src/, which would make this untestable).
 */
export const LessonDebriefSection = ({
  sectionRef,
  children,
}: LessonDebriefSectionProps) => (
  <div ref={sectionRef} className="flex flex-col gap-4">
    <div className="border-b border-gray-6 pb-2">
      <h2 className="text-sm font-medium text-primary">Debrief</h2>
    </div>
    {children}
  </div>
);
