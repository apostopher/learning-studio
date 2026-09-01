import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  OrgEditorBoard,
  UpdateLessonConfigInput,
} from '#/lib/admin-schemas';
import { dataKeys } from './keys';

/**
 * The quickshot chips on the ORG editor's board.
 *
 * The same `PATCH /api/admin/lessons/:id` as `useUpdateLessonConfig`, against
 * a different cache. That is the whole reason it exists: the per-course hook
 * writes its optimistic value into `dataKeys.courseBoard(courseId)`, which the
 * org editor does not read — reusing it there would have left every chip
 * flipping back a moment after it was tapped, since the board it actually
 * renders from was never touched.
 *
 * A lesson can sit in several courses on this rail at once. The optimistic
 * update therefore patches EVERY occurrence of the lesson across every course
 * board, because the fields it edits belong to the lesson rather than to any
 * one placement — a chip tapped in the 2-Week column that stayed grey in the
 * Mini column would be showing two different answers to the same question.
 *
 * Guarded by `requireLessonContentPermission` on the route, so a discipline
 * SME may do this to their own lessons and an admin to any.
 */
export function useUpdateEditorLessonConfig() {
  const queryClient = useQueryClient();
  const mutationKey = dataKeys.updateEditorLessonConfig();
  const isLastInFlight = () => queryClient.isMutating({ mutationKey }) === 1;

  return useMutation({
    mutationKey,
    mutationFn: async (input: {
      lessonId: number;
      patch: UpdateLessonConfigInput;
    }) => {
      const res = await fetch(`/api/admin/lessons/${input.lessonId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input.patch),
      });
      if (!res.ok) {
        throw new Error(`Failed to update lesson config (${res.status})`);
      }
    },
    onMutate: async (input) => {
      const key = dataKeys.editorBoard();
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<OrgEditorBoard>(key);
      if (previous) {
        queryClient.setQueryData<OrgEditorBoard>(
          key,
          previous.map((board) => ({
            ...board,
            modules: board.modules.map((mod) => ({
              ...mod,
              lessons: mod.lessons.map((lesson) =>
                lesson.id === input.lessonId
                  ? { ...lesson, ...input.patch }
                  : lesson,
              ),
            })),
          })),
        );
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      // Restoring mid-run would wipe a later tap's optimistic value along with
      // the failed one. The trailing invalidation corrects the board instead.
      if (context?.previous && isLastInFlight()) {
        queryClient.setQueryData(dataKeys.editorBoard(), context.previous);
      }
      toast.error("Couldn't update setting");
    },
    onSettled: () => {
      if (!isLastInFlight()) return;
      queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
      // The PREFIX, not one course. This write changes data the per-course
      // board renders, and a lesson can sit in many courses — the editor
      // links straight across to `/admin/$courseId/editor`, whose
      // `useCourseBoard` has a 30s staleTime, so a board visited moments ago
      // is still *fresh* and shows the old value for the rest of that mount.
      // `useDeleteLesson` reasoned this through first; the same applies here.
      queryClient.invalidateQueries({ queryKey: dataKeys.courseBoards() });
      // The library card shows the same lesson's availability, and `levels`
      // and access feed what the library reports about it.
      queryClient.invalidateQueries({ queryKey: dataKeys.orgLibrary() });
    },
  });
}
