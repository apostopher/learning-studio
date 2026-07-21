import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataKeys } from './keys';

export interface AddEmbeddingsInput {
  url: string;
  fileName: string;
  mimeType: string;
}

/** Ingest an uploaded doc into course-scoped embeddings, then refetch the list. */
export function useAddEmbeddings(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: AddEmbeddingsInput,
    ): Promise<{ sourcePath: string; chunks: number }> => {
      const res = await fetch('/api/ai-rag', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'file', courseId, ...input }),
      });
      if (!res.ok) throw new Error(`Failed to add embeddings (${res.status})`);
      const data = await res.json();
      return { sourcePath: data.sourcePath, chunks: data.chunks };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseEmbeddings(courseId),
      });
    },
  });
}
