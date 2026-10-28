import type { QueryClient } from '@tanstack/react-query';
import { invalidateLessonDoneReaders } from '#/data-hooks/invalidate-lesson-done';
import { dataKeys } from '#/data-hooks/keys';
import { queryKeys } from '#/hooks/data/keys';
import type { LessonRef } from '#/lib/lesson-ref';

/**
 * What refreshes once a lesson's video coverage is confirmed complete
 * (`reconcileCoverage` has re-read the server): the material it unlocks, the
 * video progress itself, and — because finishing the video can be the step
 * that makes the lesson "done" — the readers of done (the course rollup and
 * the lesson's debrief status).
 *
 * Its own module so the keys can be tested without rendering
 * `useMilestoneReporter`, which this repo's Vitest pipeline cannot render.
 */
export function invalidateAfterCoverageComplete(
  queryClient: QueryClient,
  lesson: LessonRef,
): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.lessonMaterial(lesson),
    }),
    queryClient.invalidateQueries({
      queryKey: dataKeys.lessonProgress(lesson.lessonSlug),
    }),
    invalidateLessonDoneReaders(queryClient, lesson),
  ]);
}
