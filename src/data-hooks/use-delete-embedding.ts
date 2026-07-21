import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataKeys } from './keys';

/** Delete all embeddings (and blob) for one source in a course, then refetch. */
export function useDeleteEmbedding(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sourcePath }: { sourcePath: string }) => {
      const res = await fetch('/api/ai-rag', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ courseId, sourcePath }),
      });
      if (!res.ok) throw new Error(`Failed to delete (${res.status})`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseEmbeddings(courseId),
      });
    },
  });
}
