import { useMutation, useQueryClient } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its hook test.
import { invalidateCourseLessons } from './invalidate-course-lessons';

/**
 * Remove a lesson's placement from a module. The lesson itself survives in
 * the library and any other course teaching it.
 */
export function useUnlinkLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { moduleId: number; lessonId: number }) => {
      const res = await fetch(
        `/api/admin/modules/${vars.moduleId}/lessons/${vars.lessonId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error(`Failed to unlink lesson (${res.status})`);
    },
    onSuccess: () => invalidateCourseLessons(queryClient),
  });
}
