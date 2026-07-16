import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataKeys } from './keys';

interface MoveVars {
  lessonId: number;
  targetModuleId: number;
  prevLessonId: number | null;
  nextLessonId: number | null;
}

/**
 * Persist a lesson move (reorder within, or across modules). The board's drag
 * handlers already apply the optimistic cache update during the drag, so this
 * only persists and refetches; the caller supplies onError to roll back.
 */
export function useMoveLesson(courseId: number) {
  const queryClient = useQueryClient();
  const key = dataKeys.courseBoard(courseId);
  return useMutation({
    mutationFn: async (vars: MoveVars) => {
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
