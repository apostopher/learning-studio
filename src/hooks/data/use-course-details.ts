import { useAtomValue } from 'jotai';
import { atomFamily } from 'jotai-family';
import { atomWithQuery } from 'jotai-tanstack-query';
import type { LearnerCourseDetails } from '@/routes/api/course/details';
import { queryKeys } from './keys';

// Typed against `LearnerCourseDetails` — the shape the route actually
// serves (`videoId`-free) — not `CourseDetails` from `#/db/course`, which is
// the server's internal shape and still carries `videoId`. Casting to the
// wider internal type here would silently reintroduce a field this fetch
// never gets back, exactly the producer/consumer drift this migration keeps
// tripping over.
export const courseDetailsAtomFamily = atomFamily((slug: string) =>
  atomWithQuery(() => ({
    queryKey: queryKeys.courseDetails(slug),
    queryFn: async () => {
      const response = await fetch(`/api/course/details?slug=${slug}`);
      if (!response.ok) {
        throw new Error('Failed to fetch course details');
      }
      const data = await response.json();
      return data as LearnerCourseDetails;
    },
    enabled: !!slug,
    staleTime: 1000 * 60 * 60 * 48,
    gcTime: 1000 * 60 * 60 * 48,
  })),
);

export function useCourseDetails(slug?: string) {
  return useAtomValue(courseDetailsAtomFamily(slug ?? ''));
}
