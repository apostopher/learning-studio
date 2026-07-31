import { useAtomValue } from 'jotai';
import { atomFamily } from 'jotai-family';
import { atomWithQuery } from 'jotai-tanstack-query';
import type { LearnerCourseDetails } from '#/lib/course-details-shape';
import { queryKeys } from './keys';

// Typed against `LearnerCourseDetails` (`#/lib/course-details-shape`) — the
// shape the route actually serves (video-identity-free) — not `CourseDetails`
// from `#/db/course`, which is the server's internal shape and still carries
// `videoId`/`videoProvider`/`videoRef`. Casting to the wider internal type
// here would silently reintroduce fields this fetch never gets back, exactly
// the producer/consumer drift this migration keeps tripping over.
// `course-details-shape.ts` is deliberately import-free of both `#/db/course`
// and the route module, so this browser hook never type-depends on drizzle or
// auth, even transitively — this repo has a documented history of that class
// of import breaking the client build.
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
