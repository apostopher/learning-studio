import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from './keys';

const lessonPostersSchema = z.record(z.string(), z.string());

/**
 * Poster frames for a course's lessons, keyed by lesson id.
 *
 * 30 minutes can outlive a short-lived Synthesia URL, leaving the client
 * holding one that 403s. Accepted rather than engineered around: the failure
 * mode is the grey tile the board drew before posters existed, it self-heals
 * on the next refetch, and a shorter staleTime would cost every board load to
 * prevent something cosmetic.
 */
export function useLessonPosters(courseId: number) {
  return useQuery({
    queryKey: dataKeys.lessonPosters(courseId),
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/courses/${courseId}/lesson-posters`,
      );
      if (!res.ok) throw new Error(`Failed to load posters (${res.status})`);
      return lessonPostersSchema.parse(await res.json());
    },
    staleTime: 30 * 60_000,
  });
}
