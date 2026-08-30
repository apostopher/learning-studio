import { useMutation, useQueryClient } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import { dataKeys } from './keys';

interface MovePlacementVars {
  lessonId: number;
  targetModuleId: number;
  prevLessonId: number | null;
  nextLessonId: number | null;
}

/**
 * Move a placed lesson to a new slot — within its module or into a sibling
 * module of the SAME course.
 *
 * Hits the same route as `useMoveLesson` but invalidates the org-wide
 * `editorBoard` key instead of one course's `courseBoard`. Reusing
 * `useMoveLesson` here would have meant picking a single `courseId` at hook
 * call time, which the knowledge editor cannot do: it renders every course in
 * the org at once, so the course is only known once a drag lands.
 *
 * No optimistic update of its own — the editor's drag handlers have already
 * placed the lesson and hold the snapshot to roll back to, so a second
 * optimistic write here would fight them.
 */
export function useMovePlacement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: MovePlacementVars) => {
      const res = await fetch(`/api/admin/lessons/${vars.lessonId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetModuleId: vars.targetModuleId,
          prevLessonId: vars.prevLessonId,
          nextLessonId: vars.nextLessonId,
        }),
      });
      if (!res.ok) throw new Error(`Failed to move lesson (${res.status})`);
    },
    // Settled, not success: after a failure the caller has rolled the cache
    // back to its snapshot, and a refetch confirms that guess against what the
    // server actually kept.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
    },
  });
}
