import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataKeys } from './keys';

/** Rename a module, then refetch the course board. */
export function useUpdateModule(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { moduleId: number; name: string }) => {
      const res = await fetch(`/api/admin/modules/${input.moduleId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: input.name }),
      });
      if (!res.ok) throw new Error(`Failed to update module (${res.status})`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseBoard(courseId),
      });
    },
  });
}
