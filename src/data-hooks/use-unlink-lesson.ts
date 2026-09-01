import { useMutation, useQueryClient } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its hook test.
import { dataKeys } from './keys';

/**
 * Remove a lesson's placement from a module. The lesson itself survives in
 * the library and any other course teaching it.
 *
 * Invalidates BOTH the editor board and the library, same reasoning as
 * `useLinkLesson`: unlinking changes the course's board *and* the library's
 * "in N courses" badge for this lesson.
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
      queryClient.invalidateQueries({ queryKey: dataKeys.orgLibrary() });
    },
  });
}
