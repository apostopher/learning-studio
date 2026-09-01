import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataKeys } from './keys';

/**
 * Delete a lesson outright — from the library and from every course teaching
 * it, cascading its progress rows.
 *
 * Takes no course id and invalidates THREE keys, because a lesson now belongs
 * to the org and can sit in many courses:
 *
 *  - `editorBoard()` — the org editor loses every placement of it;
 *  - `orgLibrary()` — the library loses the card;
 *  - `courseBoards()` — the PREFIX, not one course. This hook is reachable
 *    from the per-course board too (`SortableLessonCard`), whose cache lives
 *    under `courseBoard(courseId)` with a 30s `staleTime`. Naming a single
 *    course would still be wrong even if this hook knew one: the lesson has
 *    just left every course that taught it, so every one of those boards is
 *    stale. Miss this and the deleted lesson sits on the board, still
 *    clickable into a config dialog for a row that no longer exists, until a
 *    remount or the staleness window expires.
 */
export function useDeleteLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (lessonId: number) => {
      const res = await fetch(`/api/admin/lessons/${lessonId}`, {
        method: 'DELETE',
      });
      // A 403 is a refusal, not a failure, and "please try again" would be a
      // lie: authority over a lesson's existence follows its DISCIPLINE (see
      // `requireLessonContentPermission`), so retrying changes nothing.
      if (res.status === 403) {
        throw new Error(
          'You cannot delete this lesson. Deleting one needs authority over its discipline, or an org-wide admin role.',
        );
      }
      if (!res.ok) throw new Error(`Failed to delete lesson (${res.status})`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
      queryClient.invalidateQueries({ queryKey: dataKeys.orgLibrary() });
      queryClient.invalidateQueries({ queryKey: dataKeys.courseBoards() });
    },
  });
}
