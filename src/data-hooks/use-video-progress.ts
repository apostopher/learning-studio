import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from './keys';

const videoProgressSchema = z.object({
  /** Distinct milestones the user has reached for this video, in order. */
  milestonesHit: z.array(z.number()),
  /** Whether the video counts as watched (every milestone except 100). */
  watched: z.boolean(),
});

export type VideoProgress = z.infer<typeof videoProgressSchema>;

/**
 * The logged-in user's progress for a single video: the milestones they've hit
 * and whether it counts as watched. Backed by GET /api/user/video-progress.
 * Disabled until `videoId` is non-empty.
 */
export function useVideoProgress(videoId: string) {
  return useQuery({
    queryKey: dataKeys.videoProgress(videoId),
    queryFn: async () => {
      const res = await fetch(
        `/api/user/video-progress?videoId=${encodeURIComponent(videoId)}`,
      );
      if (!res.ok) {
        throw new Error(`Failed to load video progress (${res.status})`);
      }
      return videoProgressSchema.parse(await res.json());
    },
    enabled: videoId.length > 0,
    staleTime: 30_000,
  });
}
