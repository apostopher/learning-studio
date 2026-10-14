import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { VideoLang } from '#/lib/video-languages';
import { dataKeys } from './keys';

/** Generate (or retry) a lesson video's Mux captions, then refetch status and playback. */
export function useRequestLessonCaptions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      lessonId,
      courseId,
      lang,
    }: {
      lessonId: number;
      courseId: number;
      lang: VideoLang;
    }) => {
      const res = await fetch(
        `/api/admin/lessons/${lessonId}/captions?courseId=${courseId}&lang=${lang}`,
        { method: 'POST' },
      );
      if (!res.ok) throw new Error(`Couldn't request captions (${res.status})`);
    },
    onSuccess: (_data, { lessonId }) => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonCaptionsAll(lessonId),
      });
      // Ready captions change what playback returns (the VTT URL).
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonPlaybacks(lessonId),
      });
    },
  });
}
