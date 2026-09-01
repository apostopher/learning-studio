import { useMutation, useQueryClient } from '@tanstack/react-query';
import { courseSchema, type UpdateCourseInput } from '@/lib/admin-schemas';
import { dataKeys } from './keys';

/** Update a course's details, then refetch its board and the admin course list. */
export function useUpdateCourse(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateCourseInput) => {
      const res = await fetch(`/api/admin/courses/${courseId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`Failed to update course (${res.status})`);
      return courseSchema.parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseBoard(courseId),
      });
      queryClient.invalidateQueries({ queryKey: dataKeys.adminCourses() });
      // The org editor's rail draws the same courses. Without this its column
      // keeps the old name (or keeps a deleted course) until the board's own
      // staleTime elapses.
      queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
    },
  });
}
