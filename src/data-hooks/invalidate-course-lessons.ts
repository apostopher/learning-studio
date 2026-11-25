import type { QueryClient } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias.
import { queryKeys } from '#/hooks/data/keys';
import { dataKeys } from './keys';

/**
 * Everything that shows which lessons a course has, and the lessons as it has
 * them: for each write by which one leaves or joins. Removed and added back is
 * how a course updates a lesson, so its content goes too.
 *
 * By prefix: a module can be in several courses, and the learner's pages are
 * keyed by slugs these writes do not know. Without the per-course boards, one
 * visited moments ago is still inside its 30s `staleTime` and stays wrong.
 */
export function invalidateCourseLessons(queryClient: QueryClient): void {
  for (const queryKey of [
    dataKeys.editorBoard(),
    dataKeys.courseBoards(),
    // Each lesson's "in N courses".
    dataKeys.orgLibrary(),
    dataKeys.allLessonPosters(),
    // The learner's pages, where the same person has had them open.
    queryKeys.allCourseDetails(),
    queryKeys.allLessonMaterials(),
    queryKeys.allLessonPlaybacks(),
    dataKeys.allCourseProgressSummaries(),
    dataKeys.allDebriefStatuses(),
    dataKeys.allDebriefAttempts(),
    dataKeys.allLessonQuizResults(),
  ]) {
    queryClient.invalidateQueries({ queryKey });
  }
}
