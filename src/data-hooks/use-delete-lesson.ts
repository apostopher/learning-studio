import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataKeys } from './keys';

/** Delete a lesson, then refetch the course board. */
export function useDeleteLesson(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (lessonId: number) => {
      const res = await fetch(`/api/admin/lessons/${lessonId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`Failed to delete lesson (${res.status})`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseBoard(courseId),
      });
    },
  });
}
