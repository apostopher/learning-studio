import { useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { activeTabAtom, lessonMaterialRef } from '#/atoms/lesson-ai-test';
import { useLessonMaterial } from '#/hooks/data/use-lesson-material';
import { LessonNoVideo } from './lesson-no-video';

type LessonNoVideoContainerProps = {
  lessonName: string;
  lessonSlug: string;
  hasDebrief: boolean;
  /** `needsVideoWatch` — the admin's statement that a video belongs here. */
  videoExpected: boolean;
};

/**
 * Supplies the no-video card with the one thing it cannot know on its own:
 * whether a debrief can actually be started.
 *
 * The card's button only NAVIGATES — it selects the Debrief tab and scrolls to
 * it, leaving generation to `DebriefIntro` there. Duplicating the generate
 * call would give this lesson two places that can kick off the same request,
 * and the tab has to handle the idle case regardless.
 *
 * `useLessonMaterial` is the same cached query the material panel below is
 * already using, so reading it here costs no extra request.
 */
export const LessonNoVideoContainer = ({
  lessonName,
  lessonSlug,
  hasDebrief,
  videoExpected,
}: LessonNoVideoContainerProps) => {
  const setActiveTab = useSetAtom(activeTabAtom);
  const { data } = useLessonMaterial(lessonSlug);
  const material = data && !data.locked ? data.material : null;

  // Mirrors computeMaterialTabs: no generator input means no Debrief tab, so
  // a shortcut to it would land on a tab that does not exist. Body text alone
  // is enough now — the server derives key points from it when none were
  // authored (see resolveDebriefSource). The transcript fallback cannot apply
  // here: this branch exists precisely because the lesson has no video.
  const canDebrief = hasDebrief && Boolean(material?.text);

  const onDebrief = useCallback(() => {
    setActiveTab('quiz');
    queueMicrotask(() => {
      lessonMaterialRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }, [setActiveTab]);

  return (
    <LessonNoVideo
      lessonName={lessonName}
      videoExpected={videoExpected}
      onDebrief={canDebrief ? onDebrief : undefined}
    />
  );
};
