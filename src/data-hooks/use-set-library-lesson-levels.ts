import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { LibraryLesson, OrgLibrary } from '#/lib/admin-schemas';
import type { UserLevel } from '#/types';
import { dataKeys } from './keys';

/** Every lesson list the library holds, with `lessonId`'s levels replaced. */
function withLevels(
  library: OrgLibrary,
  lessonId: number,
  levels: UserLevel[],
): OrgLibrary {
  const patch = (lessons: LibraryLesson[]) =>
    lessons.map((l) => (l.id === lessonId ? { ...l, levels } : l));
  return {
    ...library,
    untitled: patch(library.untitled),
    disciplines: library.disciplines.map((d) => ({
      ...d,
      untitled: patch(d.untitled),
      modules: d.modules.map((m) => ({ ...m, lessons: patch(m.lessons) })),
    })),
  };
}

/**
 * Set a library lesson's levels from the Update levels board.
 *
 * Optimistic against the library cache, because the board is tapped lesson
 * after lesson in quick succession and each press must show its badge and
 * outline at once. Same `PATCH /api/admin/lessons/:id` as the quickshot chips
 * (`levels` is a config field), guarded by `requireLessonContentPermission` —
 * a discipline SME on their own lessons, an admin on any.
 */
export function useSetLibraryLessonLevels() {
  const queryClient = useQueryClient();
  const mutationKey = dataKeys.setLibraryLessonLevels();
  const isLastInFlight = () => queryClient.isMutating({ mutationKey }) === 1;

  return useMutation({
    mutationKey,
    mutationFn: async (input: { lessonId: number; levels: UserLevel[] }) => {
      const res = await fetch(`/api/admin/lessons/${input.lessonId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ levels: input.levels }),
      });
      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? 'Only an admin or a subject expert of this lesson’s discipline can change its levels.'
            : `Could not save the lesson’s levels (${res.status})`,
        );
      }
    },
    onMutate: async (input) => {
      const key = dataKeys.orgLibrary();
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<OrgLibrary>(key);
      if (previous) {
        queryClient.setQueryData<OrgLibrary>(
          key,
          withLevels(previous, input.lessonId, input.levels),
        );
      }
      return { previous };
    },
    onError: (error, _input, context) => {
      // Restoring mid-run would wipe a later press's optimistic value along
      // with the failed one; the trailing invalidation corrects it instead.
      if (context?.previous && isLastInFlight()) {
        queryClient.setQueryData(dataKeys.orgLibrary(), context.previous);
      }
      toast.error(error.message);
    },
    onSettled: () => {
      if (!isLastInFlight()) return;
      queryClient.invalidateQueries({ queryKey: dataKeys.orgLibrary() });
      // The course boards draw the same lesson's level chip.
      queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
      queryClient.invalidateQueries({ queryKey: dataKeys.courseBoards() });
    },
  });
}
