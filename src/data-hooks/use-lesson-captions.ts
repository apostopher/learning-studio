import { useQuery } from '@tanstack/react-query';
import { type LessonCaptions, lessonCaptionsSchema } from '#/lib/admin-schemas';
import type { VideoLang } from '#/lib/video-languages';
import { dataKeys } from './keys';

/** Poll only while Mux is still working; a settled state changes only on an admin action. */
export const captionsRefetchInterval = (
  status: LessonCaptions['status'] | undefined,
): number | false => (status === 'generating' ? 30_000 : false);

export function useLessonCaptions(
  target: { lessonId: number; courseId: number; lang: VideoLang } | null,
) {
  return useQuery({
    queryKey: dataKeys.lessonCaptions(
      target?.lessonId ?? 0,
      target?.courseId ?? 0,
      target?.lang ?? 'en',
    ),
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
      return lessonCaptionsSchema.parse(await res.json());
    },
    refetchInterval: (query) =>
      captionsRefetchInterval(query.state.data?.status),
  });
}
