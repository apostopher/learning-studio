import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RemoveLessonAlternateVideoInput } from '#/lib/admin-schemas';
import { dataKeys } from './keys';
import { useSettleContentWrite } from './lesson-content-write';

/** Detach a lesson's translated video for one language, then refetch what shows it. */
export function useRemoveLessonAlternateVideo(lessonId: number) {
  const queryClient = useQueryClient();
  const settle = useSettleContentWrite(lessonId);
  return useMutation({
    mutationKey: dataKeys.lessonContentWrite(lessonId),
    mutationFn: async (input: RemoveLessonAlternateVideoInput) => {
      const res = await fetch(
        `/api/admin/lessons/${lessonId}/alternate-videos`,
        {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        },
      );
      if (!res.ok) throw new Error(`Failed to remove language (${res.status})`);
    },
    onSuccess: (_data, { version }) => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonAlternateVideos(lessonId),
      });
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
