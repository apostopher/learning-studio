import { atomFamily } from 'jotai-family';
import { atomWithQuery } from 'jotai-tanstack-query';
import { queryKeys } from '#/hooks/data/keys';
import { type VideoResponse, VideoResponseSchema } from '#/types';

export const lessonVideoAtomFamily = atomFamily((videoId: string) =>
  atomWithQuery<VideoResponse>(() => ({
    queryKey: queryKeys.lessonVideo(videoId),
    queryFn: async () => {
      const r = await fetch(
        `/api/lesson/video?videoId=${encodeURIComponent(videoId)}`,
      );
      if (!r.ok) throw new Error('Failed to fetch video');
      return VideoResponseSchema.parse(await r.json());
    },
    enabled: !!videoId,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    retry: 1,
  })),
);
