import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from './keys';

const lessonProgressSchema = z.object({
  lessonId: z.number(),
  moduleId: z.number(),
  videoId: z.string().nullable(),
  percent: z.number(),
  watched: z.boolean(),
});

const moduleProgressSchema = z.object({
  moduleId: z.number(),
  percent: z.number(),
  watchedLessons: z.number(),
  totalLessons: z.number(),
});

const courseProgressSummarySchema = z.object({
  slug: z.string(),
  percent: z.number(),
  watchedLessons: z.number(),
  totalLessons: z.number(),
  modules: z.array(moduleProgressSchema),
  lessons: z.array(lessonProgressSchema),
});

export type CourseProgressSummary = z.infer<typeof courseProgressSummarySchema>;

/** Poll the rollup this often so it reflects milestones the user just earned. */
const REFETCH_INTERVAL_MS = 60_000;

/**
 * The logged-in user's aggregated progress for a whole course: course / module
 * / lesson percentages in one payload. Backed by the server-aggregated
 * GET /api/course/progress-summary. Disabled until `slug` is non-empty.
 *
 * Kept fresh as the user watches: polls every minute (foreground only) and
 * refetches when the tab regains focus/visibility — TanStack Query's focus
 * manager listens for `visibilitychange`, so a refetch fires on tab return
 * (when the data is stale). `refetchIntervalInBackground` stays false so a
 * hidden tab doesn't poll; the focus refetch catches it up on return.
 */
export function useCourseProgressSummary(slug: string) {
  return useQuery({
    queryKey: dataKeys.courseProgressSummary(slug),
    queryFn: async () => {
      const res = await fetch(
        `/api/course/progress-summary?slug=${encodeURIComponent(slug)}`,
      );
      if (!res.ok) {
        throw new Error(`Failed to load course progress (${res.status})`);
      }
      return courseProgressSummarySchema.parse(await res.json());
    },
    enabled: slug.length > 0,
    staleTime: 30_000,
    refetchInterval: REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
