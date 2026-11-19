import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { type DocSource, DocSourceSchema } from '#/lib/doc-source';
import { dataKeys } from './keys';

const responseSchema = z.object({
  docsBySource: z.array(
    z.object({
      sourcePath: z.string(),
      count: z.number(),
      source: DocSourceSchema,
    }),
  ),
});

export type CourseEmbeddingDoc = {
  sourcePath: string;
  count: number;
  source: DocSource;
};

/**
 * Docs (grouped by source, with embedding counts) for one course — or, with
 * `null`, the shared docs that belong to no course (the AI Training tab).
 * Null sends no `courseId` param at all: the server reads an absent one as
 * "no course".
 */
export function useCourseEmbeddings(courseId: number | null) {
  return useQuery({
    queryKey: dataKeys.courseEmbeddings(courseId),
    queryFn: async (): Promise<CourseEmbeddingDoc[]> => {
      const res = await fetch(
        courseId === null ? '/api/ai-rag' : `/api/ai-rag?courseId=${courseId}`,
      );
      if (!res.ok) {
        throw new Error(`Failed to load training docs (${res.status})`);
      }
      return responseSchema.parse(await res.json()).docsBySource;
    },
    staleTime: 30_000,
  });
}
