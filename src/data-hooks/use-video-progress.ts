import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from './keys';

export const videoProgressSchema = z.object({
  /** Distinct milestones the user has reached for this video, in order. */
  milestonesHit: z.array(z.number()),
  /** Whether the video counts as watched (every milestone except 100). */
  watched: z.boolean(),
  /** Where the learner last left the video; null if never started. */
  resume: z.object({ seconds: z.number(), duration: z.number() }).nullable(),
});

export type VideoProgress = z.infer<typeof videoProgressSchema>;

/**
 * The logged-in user's progress for a single lesson's video: the milestones
 * they've hit, whether it counts as watched, and where they left off. Backed by
 * GET /api/user/video-progress. Disabled until `lessonSlug` is non-empty.
 */
export function useVideoProgress(lessonSlug: string) {
  return useQuery({
    queryKey: dataKeys.lessonProgress(lessonSlug),
    queryFn: async () => {
      const res = await fetch(
        `/api/user/video-progress?lessonSlug=${encodeURIComponent(lessonSlug)}`,
      );
      if (!res.ok) {
        throw new Error(`Failed to load video progress (${res.status})`);
      }
      return videoProgressSchema.parse(await res.json());
    },
    enabled: lessonSlug.length > 0,
    staleTime: 30_000,
  });
}
