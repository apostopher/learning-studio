import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { type NewsSource, newsSourceSchema } from '#/lib/admin-schemas';
import { dataKeys } from './keys';

/** A course's news sources, in feed order. */
export function useCourseNewsSources(courseId: number) {
  return useQuery({
    queryKey: dataKeys.courseNewsSources(courseId),
    queryFn: async (): Promise<NewsSource[]> => {
      const res = await fetch(`/api/admin/courses/${courseId}/news-sources`);
      if (!res.ok) {
        throw new Error(`Failed to load news sources (${res.status})`);
      }
      return z.array(newsSourceSchema).parse(await res.json());
    },
    staleTime: 30_000,
  });
}
