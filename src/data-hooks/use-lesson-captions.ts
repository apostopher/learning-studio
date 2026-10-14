import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type LessonCaptions, lessonCaptionsSchema } from '#/lib/admin-schemas';
import type { VideoLang } from '#/lib/video-languages';
import { dataKeys } from './keys';

/** Poll only while Mux is still working; a settled state changes only on an admin action. */
export const captionsRefetchInterval = (
  status: LessonCaptions['status'] | undefined,
): number | false => (status === 'generating' ? 30_000 : false);

type CaptionsState = LessonCaptions['status'] | undefined;

/** Captions just turned ready: playback (cached without the VTT) must refetch. */
export const shouldRefreshPlaybackOnCaptions = (
  prev: CaptionsState,
  next: CaptionsState,
): boolean => prev !== 'ready' && next === 'ready';

export function useLessonCaptions(
  target: { lessonId: number; courseId: number; lang: VideoLang } | null,
) {
  const queryClient = useQueryClient();
  const queryKey = dataKeys.lessonCaptions(
    target?.lessonId ?? 0,
    target?.courseId ?? 0,
    target?.lang ?? 'en',
  );
  return useQuery({
    queryKey,
    enabled: target !== null,
    staleTime: 30_000,
    queryFn: async (): Promise<LessonCaptions | null> => {
      if (target === null) return null;
      const res = await fetch(
        `/api/admin/lessons/${target.lessonId}/captions?courseId=${target.courseId}&lang=${target.lang}`,
      );
      if (res.status === 404) return null;
      if (!res.ok)
        throw new Error(`Couldn't load captions status (${res.status})`);
      const next = lessonCaptionsSchema.parse(await res.json());
      // The admin preview's playback was resolved before the VTT existed;
      // when polling sees captions turn ready, refetch it so CC appears.
      const prev = queryClient.getQueryData<LessonCaptions | null>(queryKey);
      if (shouldRefreshPlaybackOnCaptions(prev?.status, next.status)) {
        queryClient.invalidateQueries({
          queryKey: dataKeys.lessonPlaybacks(target.lessonId),
        });
      }
      return next;
    },
    refetchInterval: (query) =>
      captionsRefetchInterval(query.state.data?.status),
  });
}
