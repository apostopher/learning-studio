import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type CreateCourseInput, courseSchema } from '@/lib/admin-schemas';
import { dataKeys } from './keys';

/** Create a course, then refetch the admin course list. */
export function useCreateCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCourseInput) => {
      const res = await fetch('/api/admin/courses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`Failed to create course (${res.status})`);
      return courseSchema.parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.adminCourses() });
    },
  });
}
