import { useQuery } from '@tanstack/react-query';
import { lessonPlaybackSchema } from '@/lib/admin-schemas';
import { dataKeys } from './keys';

/** Resolved playback URL for a lesson's video. `null` when no video is set. */
export function useLessonVideoPlayback(lessonId: number, enabled: boolean) {
  return useQuery({
    queryKey: dataKeys.lessonPlayback(lessonId),
    queryFn: async () => {
      const res = await fetch(`/api/admin/lessons/${lessonId}/video-playback`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Failed to load playback (${res.status})`);
      return lessonPlaybackSchema.parse(await res.json());
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}
