import { useMutation, useQueryClient } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its hook test.
import { queryKeys } from '#/hooks/data/keys';
import { dataKeys } from './keys';

/**
 * Link an existing library lesson into a module.
 *
 * Invalidates BOTH the editor board and the library: linking changes the
 * course's board (the lesson now appears there) *and* the library's "in N
 * courses" badge count for that lesson. Invalidating only one leaves the
 * other showing a stale count with nothing to tell the admin it's wrong.
 *
 * A lesson removed and added back is how a course updates it, so everything
 * else that shows the lesson as the course has it goes too.
 */
export function useLinkLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { moduleId: number; lessonId: number }) => {
      const res = await fetch(`/api/admin/modules/${vars.moduleId}/lessons`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lessonId: vars.lessonId }),
      });
      if (res.status === 409) {
        // Read the route's own explanation rather than duplicating its
        // string here — two copies of the same sentence drift the moment
        // either one is edited.
        const body = (await res.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        const message =
          typeof body?.error === 'string'
            ? body.error
            : 'This course already teaches this lesson';
        throw new Error(message);
      }
      if (!res.ok) throw new Error(`Failed to link lesson (${res.status})`);
      return res.json();
    },
    onSuccess: (_data, { lessonId }) => {
      queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
      // The PREFIX, not one course. This write changes data the per-course
      // board renders, and a lesson can sit in many courses — the editor
      // links straight across to `/admin/$courseId/editor`, whose
      // `useCourseBoard` has a 30s staleTime, so a board visited moments ago
      // is still *fresh* and shows the old value for the rest of that mount.
      // `useDeleteLesson` reasoned this through first; the same applies here.
      queryClient.invalidateQueries({ queryKey: dataKeys.courseBoards() });
      queryClient.invalidateQueries({ queryKey: dataKeys.orgLibrary() });
      for (const queryKey of [
        dataKeys.allLessonPosters(),
        dataKeys.lessonPlaybacks(lessonId),
        // The learner's pages, where the same person has had them open. By
        // prefix: they are keyed by slugs this write does not know.
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
    },
  });
}
