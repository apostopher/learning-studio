import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from './keys';

const responseSchema = z.object({
  docsBySource: z.array(
    z.object({ sourcePath: z.string(), count: z.number() }),
  ),
});

export type CourseEmbeddingDoc = { sourcePath: string; count: number };

/** Docs (grouped by source, with embedding counts) for one course. */
export function useCourseEmbeddings(courseId: number) {
  return useQuery({
    queryKey: dataKeys.courseEmbeddings(courseId),
    queryFn: async (): Promise<CourseEmbeddingDoc[]> => {
      const res = await fetch(`/api/ai-rag?courseId=${courseId}`);
      if (!res.ok) {
        throw new Error(`Failed to load training docs (${res.status})`);
      }
      return responseSchema.parse(await res.json()).docsBySource;
    },
    staleTime: 30_000,
  });
}
