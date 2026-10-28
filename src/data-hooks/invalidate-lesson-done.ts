import type { QueryClient } from '@tanstack/react-query';
import type { LessonRef } from '#/lib/lesson-ref';
import { dataKeys } from './keys';

/**
 * Refresh everything that reads whether a lesson is "done", after a write that
 * may have finished it.
 *
 * "Done" now includes the material tabs and the quiz, so the final step is
 * usually a tab tap or a quiz submit (or, on a video-only lesson, the video's
 * coverage completing). Two readers depend on it:
 *
 * - the course progress summary — the sidebar ring and its lock copy;
 * - this lesson's debrief status — the Debrief tab's 24h wait starts at done.
 *
 * Invalidated rather than written: the server owns both answers.
 */
export function invalidateLessonDoneReaders(
  queryClient: QueryClient,
  { courseSlug, lessonSlug }: LessonRef,
): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: dataKeys.debriefStatus(courseSlug, lessonSlug),
    }),
    queryClient.invalidateQueries({
      queryKey: dataKeys.courseProgressSummary(courseSlug),
    }),
  ]);
}
