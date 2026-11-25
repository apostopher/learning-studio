import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SetLessonAlternateVideoInput } from '#/lib/admin-schemas';
import { dataKeys } from './keys';
import { useSettleContentWrite } from './lesson-content-write';

/** Attach (or replace) a lesson's video for one language, then refetch what shows it. */
export function useSetLessonAlternateVideo(lessonId: number) {
  const queryClient = useQueryClient();
  const settle = useSettleContentWrite(lessonId);
  return useMutation({
    mutationKey: dataKeys.lessonContentWrite(lessonId),
    mutationFn: async (input: SetLessonAlternateVideoInput) => {
      const res = await fetch(
        `/api/admin/lessons/${lessonId}/alternate-videos`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        },
      );
      if (!res.ok) throw new Error(`Failed to add language (${res.status})`);
    },
    onSuccess: (_data, { version }) => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonAlternateVideos(lessonId),
      });
      // The languages list rides on every course's playback for this lesson.
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonPlaybacks(lessonId),
      });
      // A different video for the language has different captions.
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonCaptionsAll(lessonId),
      });
      settle(version);
    },
  });
}
