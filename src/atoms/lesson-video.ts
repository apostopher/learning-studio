import { atomFamily } from 'jotai-family';
import { atomWithQuery } from 'jotai-tanstack-query';
import { queryKeys } from '#/hooks/data/keys';
import { lessonPlaybackSchema } from '#/lib/admin-schemas';
import type { PlaybackResult } from '#/lib/video-providers/resolve.server';

export const lessonPlaybackAtomFamily = atomFamily((lessonSlug: string) =>
  atomWithQuery<PlaybackResult>(() => ({
    queryKey: queryKeys.lessonPlayback(lessonSlug),
    queryFn: async () => {
      const r = await fetch(
        `/api/lesson/playback?lessonSlug=${encodeURIComponent(lessonSlug)}`,
      );
      if (!r.ok) throw new Error('Failed to fetch playback');
      return lessonPlaybackSchema.parse(await r.json());
    },
    enabled: !!lessonSlug,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    retry: 1,
  })),
);
