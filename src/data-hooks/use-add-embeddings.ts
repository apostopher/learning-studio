import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DocSource } from '#/lib/doc-source';
import { dataKeys } from './keys';

export interface AddEmbeddingsInput {
  url: string;
  fileName: string;
  mimeType: string;
  source: DocSource;
}

/**
 * Ingest an uploaded doc into embeddings, then refetch the list. `null` files
 * it as a shared doc: the body then carries no `courseId` field at all.
 */
export function useAddEmbeddings(courseId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: AddEmbeddingsInput,
    ): Promise<{ sourcePath: string; chunks: number }> => {
      const res = await fetch('/api/ai-rag', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'file',
          ...(courseId === null ? {} : { courseId }),
          ...input,
        }),
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
