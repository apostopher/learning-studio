import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataKeys } from './keys';

/** Delete a module (and its lessons, via cascade), then refetch the course board. */
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
    },
  });
}
