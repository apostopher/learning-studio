import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CourseBoard } from '@/lib/admin-schemas';
import { dataKeys } from './keys';

interface ReorderVars {
  lessonId: number;
  prevLessonId: number | null;
  nextLessonId: number | null;
}

/**
 * Reorder a lesson within its module (optimistic), persisting an averaged rank
 * server-side. Scoped to `moduleId` so only that module's lessons are moved.
 */
export function useReorderLesson(courseId: number, moduleId: number) {
  const queryClient = useQueryClient();
  const key = dataKeys.courseBoard(courseId);
  return useMutation({
    mutationFn: async (vars: ReorderVars) => {
      const res = await fetch(`/api/admin/lessons/${vars.lessonId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prevLessonId: vars.prevLessonId,
          nextLessonId: vars.nextLessonId,
        }),
      });
      if (!res.ok) throw new Error(`Failed to reorder lesson (${res.status})`);
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CourseBoard | null>(key);
      queryClient.setQueryData<CourseBoard | null>(key, (old) => {
        if (!old) return old;
        const modules = old.modules.map((m) => {
          if (m.id !== moduleId) return m;
          const lessons = [...m.lessons];
          const from = lessons.findIndex((l) => l.id === vars.lessonId);
          if (from === -1) return m;
          const [moved] = lessons.splice(from, 1);
          const to =
            vars.prevLessonId == null
              ? 0
              : lessons.findIndex((l) => l.id === vars.prevLessonId) + 1;
          lessons.splice(to, 0, moved);
          return { ...m, lessons };
        });
        return { ...old, modules };
      });
      return { previous };
    },
    onError: (_error, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(key, ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
