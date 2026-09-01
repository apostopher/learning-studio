import { useMutation, useQueryClient } from '@tanstack/react-query';
import { boardModuleSchema, type CreateModuleInput } from '@/lib/admin-schemas';
import { dataKeys } from './keys';

/** Create a module in a course, then refetch that course's board. */
export function useCreateModule(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateModuleInput) => {
      const res = await fetch(`/api/admin/courses/${courseId}/modules`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`Failed to create module (${res.status})`);
      return boardModuleSchema.parse(await res.json());
    },
    onSuccess: () => {
      // The org editor's rail draws this course's modules too.
      queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseBoard(courseId),
      });
    },
  });
}
