import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataKeys } from './keys';

/** Rename a module, then refetch the course board. */
export function useUpdateModule(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      moduleId: number;
      name: string;
      imageUrlAvif?: string | null;
      imageUrlWebp?: string | null;
    }) => {
      const res = await fetch(`/api/admin/modules/${input.moduleId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: input.name,
          // null → omitted so the optional URL schema passes; the server clears
          // the column when a field is absent.
          imageUrlAvif: input.imageUrlAvif ?? undefined,
          imageUrlWebp: input.imageUrlWebp ?? undefined,
        }),
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
