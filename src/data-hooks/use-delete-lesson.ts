import { useMutation, useQueryClient } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias.
import { lessonInUseSchema } from '#/lib/admin-schemas';
import { dataKeys } from './keys';

/**
 * Delete a lesson outright, cascading its progress rows. Refused while any
 * course shows it, with a message naming the courses.
 *
 * Takes no course id and invalidates THREE keys, because the boards on screen
 * may predate its last course dropping it:
 *
 *  - `editorBoard()` — the org editor loses every placement of it;
 *  - `orgLibrary()` — the library loses the card;
 *  - `courseBoards()` — the PREFIX, not one course. This hook is reachable
 *    from the per-course board too (`SortableLessonCard`), whose cache lives
 *    under `courseBoard(courseId)` with a 30s `staleTime`. Naming a single
 *    course would still be wrong even if this hook knew one: any cached board
 *    may still show the lesson. Miss this and the deleted lesson sits on the board, still
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
      if (res.status === 409) {
        const inUse = lessonInUseSchema.safeParse(
          await res.json().catch(() => null),
        );
        if (inUse.success) throw new Error(inUse.data.error);
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
