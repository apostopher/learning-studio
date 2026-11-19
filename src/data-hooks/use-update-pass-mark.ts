import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { PassMarkSchema } from '#/lib/pass-mark';
import { dataKeys } from './keys';

const responseSchema = z.object({ passMark: PassMarkSchema });

/** Set a course's pass mark, then refetch the admin course list that shows it. */
export function useUpdatePassMark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { courseId: number; passMark: number }) => {
      const res = await fetch(
        `/api/admin/courses/${input.courseId}/pass-mark`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ passMark: input.passMark }),
        },
      );
      if (!res.ok)
        throw new Error(`Failed to update pass mark (${res.status})`);
      return responseSchema.parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.adminCourses() });
    },
  });
}
