import type { LessonRef } from '#/lib/lesson-ref';
import { useResumePositionSaver } from './use-resume-position-saver';

type ResumePositionSaverContainerProps = LessonRef & { playerId: string };

/**
 * Renders nothing. Exists so the saver's lifetime is one lesson: give it
 * `key={lessonSlug}` and a lesson switch unmounts it (flushing the lesson
 * being left) instead of re-rendering it with the next lesson's props.
 */
export const ResumePositionSaverContainer = ({
  playerId,
  courseSlug,
  lessonSlug,
}: ResumePositionSaverContainerProps) => {
  useResumePositionSaver(playerId, { courseSlug, lessonSlug });
  return null;
};
