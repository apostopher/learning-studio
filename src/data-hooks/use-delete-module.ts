import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateCourseLessons } from './invalidate-course-lessons';
import { dataKeys } from './keys';

/**
 * Delete a module, then refetch everything that drew it. Its lesson
 * PLACEMENTS go with it (cascade); the lessons themselves are org-owned and
 * stay in the library.
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
      invalidateCourseLessons(queryClient);
    },
  });
}
