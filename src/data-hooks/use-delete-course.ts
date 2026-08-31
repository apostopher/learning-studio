import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataKeys } from './keys';

/** Delete a course (modules and lessons cascade), then refetch the course list. */
export function useDeleteCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (courseId: number) => {
      const res = await fetch(`/api/admin/courses/${courseId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`Failed to delete course (${res.status})`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.adminCourses() });
      // The org editor's rail draws the same courses. Without this its column
      // keeps the old name (or keeps a deleted course) until the board's own
      // staleTime elapses.
      queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
    },
  });
}
