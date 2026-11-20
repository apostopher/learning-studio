import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataKeys } from './keys';

/**
 * Delete a module, then refetch everything that drew it. Its lesson
 * PLACEMENTS go with it (cascade); the lessons themselves are org-owned and
 * stay in the library.
 *
 * Also invalidates the editor rail (which draws every course), every
 * per-course board (a remixer showed it too) and the library (each lesson's
 * "in N courses" count may have dropped).
 */
export function useDeleteModule(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (moduleId: number) => {
      const res = await fetch(`/api/admin/modules/${moduleId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`Failed to delete module (${res.status})`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseBoard(courseId),
      });
      queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
      queryClient.invalidateQueries({ queryKey: dataKeys.courseBoards() });
      queryClient.invalidateQueries({ queryKey: dataKeys.orgLibrary() });
    },
  });
}
