import { useMutation, useQueryClient } from '@tanstack/react-query';
import { boardLessonSchema } from '@/lib/admin-schemas';
import { dataKeys } from './keys';

/** Create a lesson in a module, then refetch the course board. */
export function useCreateLesson(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { moduleId: number; name: string }) => {
      const res = await fetch(`/api/admin/modules/${input.moduleId}/lessons`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: input.name }),
      });
      if (!res.ok) throw new Error(`Failed to create lesson (${res.status})`);
      return boardLessonSchema.parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseBoard(courseId),
      });
    },
  });
}
