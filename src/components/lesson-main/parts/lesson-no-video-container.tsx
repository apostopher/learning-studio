import { useLessonMaterial } from '#/hooks/data/use-lesson-material';
import { LessonNoVideo } from './lesson-no-video';

type LessonNoVideoContainerProps = {
  lessonName: string;
  courseSlug: string;
  lessonSlug: string;
  hasDebrief: boolean;
  /** `needsVideoWatch` — the admin's statement that a video belongs here. */
  videoExpected: boolean;
  /** Completed at an earlier level — such a lesson has no Debrief tab. */
  readOnly: boolean;
};

/**
 * Supplies the no-video card with the one thing it cannot know on its own:
 * whether the lesson has a Debrief tab, which the heading names.
 *
 * `useLessonMaterial` is the same cached query the material panel below is
 * already using, so reading it here costs no extra request.
 */
export const LessonNoVideoContainer = ({
  lessonName,
  courseSlug,
  lessonSlug,
  hasDebrief,
  videoExpected,
  readOnly,
}: LessonNoVideoContainerProps) => {
  const { data } = useLessonMaterial({ courseSlug, lessonSlug });
  const material = data && !data.locked ? data.material : null;

  // Mirrors LessonMaterialView's `hasDebriefTab`. The transcript fallback
  // cannot apply here: this branch exists precisely because the lesson has no
  // video.
  const withDebrief = hasDebrief && Boolean(material?.text) && !readOnly;

  return (
    <LessonNoVideo
      lessonName={lessonName}
      videoExpected={videoExpected}
      withDebrief={withDebrief}
    />
  );
};
