import { useMutation, useQueryClient } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by `editor-cache-invalidation.test.tsx`.
import { type CreateCourseInput, courseSchema } from '#/lib/admin-schemas';
import { dataKeys } from './keys';

/**
 * Create a course, then refetch the two lists that draw courses.
 *
 * `editorBoard()` as well as `adminCourses()`: the org editor mounts this same
 * dialog as "New offering" and its rail is drawn from the editor board, so
 * without it the toast said "created" and the rail did not change until a
 * remount or a focus refetch past the 30s staleTime. Its three siblings —
 * `useUpdateCourse`, `useDeleteCourse` and `useCreateModule` — were all given
 * this when the editor shipped; only create was missed.
 */
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
      queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
    },
  });
}
